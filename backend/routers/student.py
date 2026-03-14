import json
import asyncio
from fastapi import APIRouter, Depends, HTTPException
import aiosqlite

from database import get_db
from config import DB_PATH
from models import StudentJoinRequest, AnswerSubmit, AnswerDispute
from services.claude_service import grade_answer
from services.auto_grader import is_auto_gradable, grade_auto
from routers.websocket import broadcast

router = APIRouter(prefix="/api/student", tags=["student"])


@router.get("/exams")
async def list_active_exams(db: aiosqlite.Connection = Depends(get_db)):
    cursor = await db.execute(
        "SELECT id, title, class_name, date, duration_minutes, password FROM exams WHERE status = 'active'"
    )
    rows = await cursor.fetchall()
    result = []
    for row in rows:
        d = dict(row)
        d["has_password"] = bool(d.pop("password", None))
        result.append(d)
    return result


@router.post("/join")
async def join_exam(
    req: StudentJoinRequest, db: aiosqlite.Connection = Depends(get_db)
):
    # Check exam is active
    cursor = await db.execute(
        "SELECT id, title, password FROM exams WHERE id = ? AND status = 'active'", (req.exam_id,)
    )
    exam = await cursor.fetchone()
    if not exam:
        raise HTTPException(status_code=404, detail="Keine aktive Klassenarbeit mit dieser ID gefunden")

    # Check password if exam has one
    if exam["password"] and exam["password"] != (req.password or ""):
        raise HTTPException(status_code=403, detail="Falsches Passwort")

    # Find or create student
    cursor = await db.execute(
        "SELECT id FROM students WHERE name = ?", (req.name,)
    )
    student_row = await cursor.fetchone()
    if student_row:
        student_id = student_row[0]
    else:
        cursor = await db.execute(
            "INSERT INTO students (name) VALUES (?)", (req.name,)
        )
        student_id = cursor.lastrowid

    # Check if session already exists
    cursor = await db.execute(
        "SELECT id FROM exam_sessions WHERE exam_id = ? AND student_id = ?",
        (req.exam_id, student_id),
    )
    existing = await cursor.fetchone()
    if existing:
        await db.commit()
        return {"session_id": existing[0], "message": "Bestehende Sitzung fortgesetzt"}

    # Create new session
    cursor = await db.execute(
        "INSERT INTO exam_sessions (exam_id, student_id) VALUES (?, ?)",
        (req.exam_id, student_id),
    )
    session_id = cursor.lastrowid
    await db.commit()
    await broadcast(req.exam_id, "student_joined", {"student_name": req.name, "session_id": session_id})
    return {"session_id": session_id, "message": "Erfolgreich angemeldet"}


@router.get("/session/{session_id}")
async def get_session(
    session_id: int, db: aiosqlite.Connection = Depends(get_db)
):
    cursor = await db.execute(
        """SELECT es.*, e.title as exam_title, e.duration_minutes, s.name as student_name
           FROM exam_sessions es
           JOIN exams e ON e.id = es.exam_id
           JOIN students s ON s.id = es.student_id
           WHERE es.id = ?""",
        (session_id,),
    )
    session = await cursor.fetchone()
    if not session:
        raise HTTPException(status_code=404, detail="Sitzung nicht gefunden")

    session_dict = dict(session)

    # Get tasks for this exam
    cursor = await db.execute(
        """SELECT t.*, et.position FROM exam_tasks et
           JOIN tasks t ON t.id = et.task_id
           WHERE et.exam_id = ?
           ORDER BY et.position""",
        (session_dict["exam_id"],),
    )
    tasks_raw = [dict(row) for row in await cursor.fetchall()]
    # Parse question_data and strip sensitive fields so students can't see solutions
    tasks = []
    for t in tasks_raw:
        qd = t.get("question_data", "{}")
        try:
            t["question_data"] = json.loads(qd) if isinstance(qd, str) else qd
        except (json.JSONDecodeError, TypeError):
            t["question_data"] = {}
        # Remove fields that reveal answers to the student
        t.pop("solution", None)
        t.pop("grader_info", None)
        # Strip correct-answer info from question_data for essay/shortanswer
        qd_clean = t["question_data"]
        if t.get("task_type") in ("essay", "drawing") and isinstance(qd_clean, dict):
            qd_clean.pop("grader_info", None)
        tasks.append(t)

    # Get existing answers
    cursor = await db.execute(
        "SELECT * FROM answers WHERE session_id = ?", (session_id,)
    )
    answers = [dict(row) for row in await cursor.fetchall()]

    return {
        "session_id": session_id,
        "student_name": session_dict["student_name"],
        "exam_title": session_dict["exam_title"],
        "duration_minutes": session_dict["duration_minutes"],
        "status": session_dict["status"],
        "started_at": session_dict["started_at"],
        "tasks": tasks,
        "answers": answers,
    }


async def _grade_in_background(answer_id: int, task: dict, student_answer: str):
    """Run AI grading in background and update the answer when done."""
    task_type = task["task_type"]
    qd = task.get("question_data", "{}")
    try:
        question_data = json.loads(qd) if isinstance(qd, str) else (qd or {})
    except (json.JSONDecodeError, TypeError):
        question_data = {}

    grading_result = None
    try:
        grading_result = await grade_answer(
            task_text=task["text"],
            task_hint=task["hint"] or "",
            task_type=task_type,
            student_answer=student_answer,
            max_points=task["points"],
            question_data=question_data,
            solution=task.get("solution", ""),
        )
    except Exception:
        pass

    # Write result back with a fresh DB connection
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        if grading_result:
            await db.execute(
                """UPDATE answers SET
                   points_awarded = ?, is_correct = ?, feedback = ?,
                   graded_at = CURRENT_TIMESTAMP, grading_status = 'graded'
                   WHERE id = ?""",
                (
                    grading_result.get("points", 0),
                    grading_result.get("correct", False),
                    grading_result.get("feedback", ""),
                    answer_id,
                ),
            )
        else:
            # Grading failed — mark as graded anyway so task isn't stuck locked
            await db.execute(
                "UPDATE answers SET grading_status = 'error' WHERE id = ?",
                (answer_id,),
            )
        await db.commit()


@router.post("/answer")
async def submit_answer(
    req: AnswerSubmit, db: aiosqlite.Connection = Depends(get_db)
):
    # Verify session exists and is in progress
    cursor = await db.execute(
        "SELECT status FROM exam_sessions WHERE id = ?", (req.session_id,)
    )
    session = await cursor.fetchone()
    if not session:
        raise HTTPException(status_code=404, detail="Sitzung nicht gefunden")
    if session[0] != "in_progress":
        raise HTTPException(status_code=400, detail="Klassenarbeit bereits abgegeben")

    # Get task details for grading
    cursor = await db.execute(
        "SELECT * FROM tasks WHERE id = ?", (req.task_id,)
    )
    task_row = await cursor.fetchone()
    if not task_row:
        raise HTTPException(status_code=404, detail="Aufgabe nicht gefunden")
    task = dict(task_row)
    task_type = task["task_type"]

    # Parse question_data
    qd = task.get("question_data", "{}")
    try:
        question_data = json.loads(qd) if isinstance(qd, str) else (qd or {})
    except (json.JSONDecodeError, TypeError):
        question_data = {}

    # Check if this task is currently being graded by AI
    cursor = await db.execute(
        "SELECT id, grading_status FROM answers WHERE session_id = ? AND task_id = ?",
        (req.session_id, req.task_id),
    )
    existing = await cursor.fetchone()
    if existing and existing[1] == "pending":
        raise HTTPException(status_code=409, detail="Aufgabe wird gerade bewertet")

    # Grade based on task type
    # Drawing is AI-graded but only on explicit request (not auto-save)
    needs_ai_grading = task_type in ("essay", "shortanswer")
    grade_later = task_type == "drawing"  # save only, grade on navigation/submit

    if task_type == "description":
        grading_result = {"points": 0, "correct": True, "feedback": ""}
    elif is_auto_gradable(task_type):
        grading_result = grade_auto(task_type, question_data, req.student_answer, task["points"])
    else:
        grading_result = None

    # Upsert answer
    if grading_result:
        # Auto-graded or description — save with result immediately
        values = (
            req.student_answer,
            grading_result.get("points", 0),
            grading_result.get("correct", False),
            grading_result.get("feedback", ""),
        )
        if existing:
            await db.execute(
                """UPDATE answers SET student_answer = ?,
                   points_awarded = ?, is_correct = ?, feedback = ?,
                   graded_at = CURRENT_TIMESTAMP, grading_status = 'graded'
                   WHERE id = ?""",
                (*values, existing[0]),
            )
        else:
            await db.execute(
                """INSERT INTO answers (session_id, task_id, student_answer,
                   points_awarded, is_correct, feedback, graded_at, grading_status)
                   VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'graded')""",
                (req.session_id, req.task_id, *values),
            )
        await db.commit()
        return {
            "message": "Antwort gespeichert",
            "graded": True,
            "grading_status": "graded",
            "points": grading_result.get("points", 0),
            "correct": grading_result.get("correct"),
            "feedback": grading_result.get("feedback", ""),
        }
    elif needs_ai_grading:
        # Save answer with pending status, grade in background
        if existing:
            await db.execute(
                """UPDATE answers SET student_answer = ?, grading_status = 'pending',
                   points_awarded = NULL, is_correct = NULL, feedback = NULL, graded_at = NULL
                   WHERE id = ?""",
                (req.student_answer, existing[0]),
            )
            answer_id = existing[0]
        else:
            cursor = await db.execute(
                """INSERT INTO answers (session_id, task_id, student_answer, grading_status)
                   VALUES (?, ?, ?, 'pending')""",
                (req.session_id, req.task_id, req.student_answer),
            )
            answer_id = cursor.lastrowid
        await db.commit()

        # Launch background grading
        asyncio.create_task(_grade_in_background(answer_id, task, req.student_answer))

        return {
            "message": "Antwort gespeichert, Bewertung läuft",
            "graded": False,
            "grading_status": "pending",
        }
    elif grade_later:
        # Save without grading (drawing: graded on explicit trigger)
        if existing:
            await db.execute(
                "UPDATE answers SET student_answer = ?, grading_status = NULL WHERE id = ?",
                (req.student_answer, existing[0]),
            )
        else:
            await db.execute(
                """INSERT INTO answers (session_id, task_id, student_answer)
                   VALUES (?, ?, ?)""",
                (req.session_id, req.task_id, req.student_answer),
            )
        await db.commit()
        return {
            "message": "Antwort gespeichert",
            "graded": False,
            "grading_status": "saved",
        }
    else:
        # Unknown type — just save
        if existing:
            await db.execute(
                "UPDATE answers SET student_answer = ? WHERE id = ?",
                (req.student_answer, existing[0]),
            )
        else:
            await db.execute(
                "INSERT INTO answers (session_id, task_id, student_answer) VALUES (?, ?, ?)",
                (req.session_id, req.task_id, req.student_answer),
            )
        await db.commit()
        return {
            "message": "Antwort gespeichert",
            "graded": False,
            "grading_status": None,
        }


@router.get("/grading-status/{session_id}")
async def get_grading_status(
    session_id: int, db: aiosqlite.Connection = Depends(get_db)
):
    """Returns grading status for all answers in a session."""
    cursor = await db.execute(
        "SELECT task_id, grading_status FROM answers WHERE session_id = ?",
        (session_id,),
    )
    rows = await cursor.fetchall()
    return {str(row[0]): row[1] for row in rows}


@router.post("/grade-drawing")
async def grade_drawing(
    req: AnswerSubmit, db: aiosqlite.Connection = Depends(get_db)
):
    """Explicitly trigger AI grading for a drawing task (called on navigation away)."""
    cursor = await db.execute(
        "SELECT id, grading_status, student_answer FROM answers WHERE session_id = ? AND task_id = ?",
        (req.session_id, req.task_id),
    )
    answer = await cursor.fetchone()
    if not answer or not answer[2]:
        return {"message": "Keine Zeichnung vorhanden"}
    if answer[1] == "pending":
        return {"message": "Bewertung läuft bereits", "grading_status": "pending"}

    # Get task data
    cursor = await db.execute("SELECT * FROM tasks WHERE id = ?", (req.task_id,))
    task = await cursor.fetchone()
    if not task:
        return {"message": "Aufgabe nicht gefunden"}
    task = dict(task)

    # Mark as pending and launch grading
    await db.execute(
        "UPDATE answers SET grading_status = 'pending' WHERE id = ?", (answer[0],)
    )
    await db.commit()
    asyncio.create_task(_grade_in_background(answer[0], task, answer[2]))

    return {"message": "Bewertung gestartet", "grading_status": "pending"}


@router.post("/submit/{session_id}")
async def submit_exam(
    session_id: int, db: aiosqlite.Connection = Depends(get_db)
):
    cursor = await db.execute(
        "SELECT status FROM exam_sessions WHERE id = ?", (session_id,)
    )
    session = await cursor.fetchone()
    if not session:
        raise HTTPException(status_code=404, detail="Sitzung nicht gefunden")
    if session[0] != "in_progress":
        raise HTTPException(status_code=400, detail="Bereits abgegeben")

    # Trigger grading for any ungraded drawing tasks
    cursor = await db.execute(
        """SELECT a.id, t.*, a.student_answer FROM answers a
           JOIN tasks t ON t.id = a.task_id
           WHERE a.session_id = ? AND t.task_type = 'drawing'
           AND a.student_answer IS NOT NULL AND a.student_answer != ''
           AND (a.grading_status IS NULL OR a.grading_status = 'saved')""",
        (session_id,),
    )
    ungraded_drawings = [dict(row) for row in await cursor.fetchall()]
    if ungraded_drawings:
        # Mark all as pending
        for row in ungraded_drawings:
            await db.execute(
                "UPDATE answers SET grading_status = 'pending' WHERE id = ?", (row["id"],)
            )
        await db.commit()

        # Grade all drawings and wait for completion before calculating points
        grading_tasks = [
            _grade_in_background(row["id"], row, row["student_answer"])
            for row in ungraded_drawings
        ]
        await asyncio.gather(*grading_tasks, return_exceptions=True)

    # Calculate total points
    cursor = await db.execute(
        "SELECT COALESCE(SUM(points_awarded), 0) FROM answers WHERE session_id = ?",
        (session_id,),
    )
    total = (await cursor.fetchone())[0]

    # Calculate max points
    cursor = await db.execute(
        """SELECT COALESCE(SUM(t.points), 0) FROM exam_tasks et
           JOIN tasks t ON t.id = et.task_id
           JOIN exam_sessions es ON es.exam_id = et.exam_id
           WHERE es.id = ?""",
        (session_id,),
    )
    max_pts = (await cursor.fetchone())[0]

    await db.execute(
        """UPDATE exam_sessions SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP,
           total_points = ?, max_points = ? WHERE id = ?""",
        (total, max_pts, session_id),
    )
    await db.commit()

    # Get exam_id for broadcast
    cursor = await db.execute("SELECT exam_id FROM exam_sessions WHERE id = ?", (session_id,))
    exam_row = await cursor.fetchone()
    if exam_row:
        await broadcast(exam_row[0], "exam_submitted", {"session_id": session_id, "total_points": total, "max_points": max_pts})

    return {"message": "Klassenarbeit erfolgreich abgegeben"}


@router.post("/dispute")
async def dispute_answer(
    req: AnswerDispute, db: aiosqlite.Connection = Depends(get_db)
):
    cursor = await db.execute(
        "SELECT id, session_id FROM answers WHERE id = ?", (req.answer_id,)
    )
    answer = await cursor.fetchone()
    if not answer:
        raise HTTPException(status_code=404, detail="Antwort nicht gefunden")

    # Verify session is submitted
    cursor = await db.execute(
        "SELECT status FROM exam_sessions WHERE id = ?", (answer[1],)
    )
    session = await cursor.fetchone()
    if not session or session[0] == "in_progress":
        raise HTTPException(status_code=400, detail="Klassenarbeit noch nicht abgegeben")

    await db.execute(
        "UPDATE answers SET disputed = TRUE, dispute_reason = ? WHERE id = ?",
        (req.reason or "", req.answer_id),
    )
    await db.commit()
    return {"message": "Einspruch wurde gemeldet"}


@router.get("/results/{session_id}")
async def get_results(
    session_id: int, db: aiosqlite.Connection = Depends(get_db)
):
    cursor = await db.execute(
        """SELECT es.*, e.title as exam_title, e.show_results_immediately, s.name as student_name
           FROM exam_sessions es
           JOIN exams e ON e.id = es.exam_id
           JOIN students s ON s.id = es.student_id
           WHERE es.id = ?""",
        (session_id,),
    )
    session = await cursor.fetchone()
    if not session:
        raise HTTPException(status_code=404, detail="Sitzung nicht gefunden")

    session_dict = dict(session)
    if session_dict["status"] == "in_progress":
        raise HTTPException(status_code=400, detail="Klassenarbeit noch nicht abgegeben")

    cursor = await db.execute(
        """SELECT a.*, t.title as task_title, t.text as task_text, t.points as max_points, t.solution
           FROM answers a
           JOIN tasks t ON t.id = a.task_id
           WHERE a.session_id = ?""",
        (session_id,),
    )
    answers = [dict(row) for row in await cursor.fetchall()]

    from services.grading import calculate_grade
    total = session_dict["total_points"] or 0
    max_pts = session_dict["max_points"] or 1
    grade, grade_label, percent = calculate_grade(total, max_pts)

    return {
        "student_name": session_dict["student_name"],
        "exam_title": session_dict["exam_title"],
        "status": session_dict["status"],
        "total_points": session_dict["total_points"],
        "max_points": session_dict["max_points"],
        "grade": grade,
        "grade_label": grade_label,
        "percent": percent,
        "answers": answers,
    }
