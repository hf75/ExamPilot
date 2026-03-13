import json
from fastapi import APIRouter, Depends, HTTPException
import aiosqlite

from database import get_db
from models import StudentJoinRequest, AnswerSubmit, AnswerDispute
from services.claude_service import grade_answer
from services.auto_grader import is_auto_gradable, grade_auto
from routers.websocket import broadcast

router = APIRouter(prefix="/api/student", tags=["student"])


@router.get("/exams")
async def list_active_exams(db: aiosqlite.Connection = Depends(get_db)):
    cursor = await db.execute(
        "SELECT id, title, class_name, date, duration_minutes FROM exams WHERE status = 'active'"
    )
    rows = await cursor.fetchall()
    return [dict(row) for row in rows]


@router.post("/join")
async def join_exam(
    req: StudentJoinRequest, db: aiosqlite.Connection = Depends(get_db)
):
    # Check exam is active
    cursor = await db.execute(
        "SELECT id, title FROM exams WHERE id = ? AND status = 'active'", (req.exam_id,)
    )
    exam = await cursor.fetchone()
    if not exam:
        raise HTTPException(status_code=404, detail="Keine aktive Klassenarbeit mit dieser ID gefunden")

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
    # Parse question_data from JSON string
    tasks = []
    for t in tasks_raw:
        qd = t.get("question_data", "{}")
        try:
            t["question_data"] = json.loads(qd) if isinstance(qd, str) else qd
        except (json.JSONDecodeError, TypeError):
            t["question_data"] = {}
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

    # Grade based on task type
    grading_result = None
    if task_type == "description":
        # No grading for description tasks
        grading_result = {"points": 0, "correct": True, "feedback": ""}
    elif is_auto_gradable(task_type):
        # Auto-grade locally (instant)
        grading_result = grade_auto(task_type, question_data, req.student_answer, task["points"])
    elif task_type in ("essay", "shortanswer"):
        # AI grading via Claude
        try:
            grading_result = await grade_answer(
                task_text=task["text"],
                task_hint=task["hint"] or "",
                task_type=task_type,
                student_answer=req.student_answer,
                max_points=task["points"],
                question_data=question_data,
            )
        except Exception:
            grading_result = None

    # Upsert answer
    cursor = await db.execute(
        "SELECT id FROM answers WHERE session_id = ? AND task_id = ?",
        (req.session_id, req.task_id),
    )
    existing = await cursor.fetchone()

    if grading_result:
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
                   graded_at = CURRENT_TIMESTAMP WHERE id = ?""",
                (*values, existing[0]),
            )
        else:
            await db.execute(
                """INSERT INTO answers (session_id, task_id, student_answer,
                   points_awarded, is_correct, feedback, graded_at)
                   VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)""",
                (req.session_id, req.task_id, *values),
            )
    else:
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
        "graded": grading_result is not None,
        "points": grading_result.get("points", 0) if grading_result else None,
        "correct": grading_result.get("correct") if grading_result else None,
        "feedback": grading_result.get("feedback", "") if grading_result else None,
    }


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
        """SELECT a.*, t.title as task_title, t.text as task_text, t.points as max_points
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
