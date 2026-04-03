from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
import json
import aiosqlite

from database import get_db
from models import AnswerAdjust
from routers.auth import require_teacher
from services.grading import calculate_grade, parse_scale
from services.claude_service import analyze_class_weaknesses

router = APIRouter(prefix="/api/exams", tags=["results"])


@router.get("/{exam_id}/results")
async def get_exam_results(
    exam_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    cursor = await db.execute("SELECT * FROM exams WHERE id = ?", (exam_id,))
    exam = await cursor.fetchone()
    if not exam:
        raise HTTPException(status_code=404, detail="Klassenarbeit nicht gefunden")
    exam = dict(exam)

    # Parse custom grading scale if set
    scale_json = exam.get("grading_scale")
    custom_scale = None
    if scale_json:
        try:
            custom_scale = parse_scale(json.loads(scale_json) if isinstance(scale_json, str) else scale_json)
        except Exception:
            pass

    cursor = await db.execute(
        """SELECT es.id as session_id, es.total_points, es.max_points, es.status,
                  es.started_at, es.submitted_at, s.name as student_name, s.id as student_id
           FROM exam_sessions es
           JOIN students s ON s.id = es.student_id
           WHERE es.exam_id = ?
           ORDER BY s.name""",
        (exam_id,),
    )
    sessions = [dict(row) for row in await cursor.fetchall()]

    # Add grade and dispute count to each session
    for s in sessions:
        if s["total_points"] is not None and s["max_points"]:
            grade, label, percent = calculate_grade(s["total_points"], s["max_points"], custom_scale)
            s["grade"] = grade
            s["grade_label"] = label
            s["percent"] = percent
        else:
            s["grade"] = "-"
            s["grade_label"] = "-"
            s["percent"] = 0

        # Count disputed answers
        cursor = await db.execute(
            "SELECT COUNT(*) FROM answers WHERE session_id = ? AND disputed = TRUE",
            (s["session_id"],),
        )
        s["dispute_count"] = (await cursor.fetchone())[0]

    return {
        "exam": exam,
        "sessions": sessions,
    }


@router.get("/{exam_id}/results/{session_id}")
async def get_student_result(
    exam_id: int,
    session_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    cursor = await db.execute(
        """SELECT es.*, e.title as exam_title, e.grading_scale as exam_grading_scale,
                  s.name as student_name
           FROM exam_sessions es
           JOIN exams e ON e.id = es.exam_id
           JOIN students s ON s.id = es.student_id
           WHERE es.id = ? AND es.exam_id = ?""",
        (session_id, exam_id),
    )
    session = await cursor.fetchone()
    if not session:
        raise HTTPException(status_code=404, detail="Sitzung nicht gefunden")
    session = dict(session)

    # Parse custom grading scale
    scale_json = session.pop("exam_grading_scale", None)
    custom_scale = None
    if scale_json:
        try:
            custom_scale = parse_scale(json.loads(scale_json) if isinstance(scale_json, str) else scale_json)
        except Exception:
            pass

    cursor = await db.execute(
        """SELECT a.*, t.title as task_title, t.text as task_text, t.points as max_points,
                  t.hint, t.solution, t.task_type, t.question_data
           FROM answers a
           JOIN tasks t ON t.id = a.task_id
           WHERE a.session_id = ?""",
        (session_id,),
    )
    answers = []
    for row in await cursor.fetchall():
        a = dict(row)
        if a.get("task_type") == "webapp" and a.get("question_data"):
            try:
                qd = json.loads(a["question_data"]) if isinstance(a["question_data"], str) else a["question_data"]
                a["app_html"] = qd.get("app_html", "")
            except Exception:
                a["app_html"] = ""
        a.pop("question_data", None)
        answers.append(a)

    grade, label, percent = calculate_grade(
        session.get("total_points", 0) or 0,
        session.get("max_points", 1) or 1,
        custom_scale,
    )

    return {
        "session": session,
        "answers": answers,
        "grade": grade,
        "grade_label": label,
        "percent": percent,
    }


@router.get("/{exam_id}/live-progress")
async def get_live_progress(
    exam_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    """Live dashboard data: per-student, per-task progress matrix."""
    from routers.student import get_student_activity
    activity = get_student_activity()

    # Get task list for this exam
    cursor = await db.execute(
        """SELECT t.id, t.title, et.position FROM exam_tasks et
           JOIN tasks t ON t.id = et.task_id
           WHERE et.exam_id = ? ORDER BY et.position""",
        (exam_id,),
    )
    tasks = [dict(row) for row in await cursor.fetchall()]

    # Get all sessions with their answers
    cursor = await db.execute(
        """SELECT es.id as session_id, s.name as student_name, es.status,
                  es.started_at, es.total_points, es.max_points
           FROM exam_sessions es
           JOIN students s ON s.id = es.student_id
           WHERE es.exam_id = ?
           ORDER BY s.name""",
        (exam_id,),
    )
    sessions_raw = [dict(row) for row in await cursor.fetchall()]

    students = []
    for s in sessions_raw:
        sid = s["session_id"]
        cursor = await db.execute(
            """SELECT task_id,
                      CASE WHEN student_answer IS NOT NULL AND student_answer != '' THEN 1 ELSE 0 END as answered,
                      grading_status
               FROM answers WHERE session_id = ?""",
            (sid,),
        )
        answers = {}
        for row in await cursor.fetchall():
            answers[str(row[0])] = {
                "answered": bool(row[1]),
                "grading_status": row[2],
            }

        # Count disputed answers
        cursor = await db.execute(
            "SELECT COUNT(*) FROM answers WHERE session_id = ? AND disputed = TRUE",
            (sid,),
        )
        dispute_count = (await cursor.fetchone())[0]

        act = activity.get(sid, {})
        students.append({
            **s,
            "answers": answers,
            "current_task_id": act.get("task_id"),
            "last_seen": act.get("last_seen"),
            "dispute_count": dispute_count,
        })

    return {"tasks": tasks, "students": students}


@router.put("/{exam_id}/answers/{answer_id}/adjust")
async def adjust_answer(
    exam_id: int,
    answer_id: int,
    req: AnswerAdjust,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    cursor = await db.execute(
        "SELECT a.*, t.points as max_points FROM answers a JOIN tasks t ON t.id = a.task_id WHERE a.id = ?",
        (answer_id,),
    )
    answer = await cursor.fetchone()
    if not answer:
        raise HTTPException(status_code=404, detail="Antwort nicht gefunden")

    update_fields = "points_awarded = ?, manually_adjusted = TRUE, disputed = FALSE, dispute_reason = NULL"
    answer_dict = dict(answer)
    max_points = answer_dict.get("max_points", 0)
    is_correct = req.points_awarded >= max_points if max_points > 0 else req.points_awarded > 0
    update_fields += ", is_correct = ?"
    values = [req.points_awarded, is_correct]
    if req.feedback is not None:
        update_fields += ", feedback = ?"
        values.append(req.feedback)
    values.append(answer_id)

    await db.execute(f"UPDATE answers SET {update_fields} WHERE id = ?", values)

    # Recalculate session total
    session_id = answer_dict["session_id"]
    cursor = await db.execute(
        "SELECT COALESCE(SUM(points_awarded), 0) FROM answers WHERE session_id = ?",
        (session_id,),
    )
    total = (await cursor.fetchone())[0]
    await db.execute(
        "UPDATE exam_sessions SET total_points = ? WHERE id = ?",
        (total, session_id),
    )

    # Invalidate cached class analysis since grades changed
    cursor = await db.execute(
        "SELECT exam_id FROM exam_sessions WHERE id = ?", (session_id,)
    )
    session_row = await cursor.fetchone()
    if session_row:
        await db.execute(
            "DELETE FROM class_analyses WHERE exam_id = ?", (session_row[0],)
        )

    await db.commit()
    return {"message": "Punkte angepasst", "new_total": total}


@router.post("/{exam_id}/class-analysis")
async def get_class_analysis(
    exam_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    # Check cache first
    cursor = await db.execute(
        "SELECT analysis_text FROM class_analyses WHERE exam_id = ?", (exam_id,)
    )
    cached = await cursor.fetchone()
    if cached:
        return {"analysis": cached[0], "cached": True}

    # Collect all answers for submitted sessions
    cursor = await db.execute(
        """SELECT t.id as task_id, t.title, t.text, t.task_type, t.solution,
                  t.points as max_points, a.student_answer, a.points_awarded
           FROM exam_tasks et
           JOIN tasks t ON t.id = et.task_id
           JOIN answers a ON a.task_id = t.id
           JOIN exam_sessions es ON es.id = a.session_id AND es.exam_id = ?
           WHERE es.status = 'submitted'
           ORDER BY et.position, a.points_awarded ASC""",
        (exam_id,),
    )
    rows = [dict(r) for r in await cursor.fetchall()]

    if not rows:
        raise HTTPException(status_code=400, detail="Keine abgegebenen Arbeiten vorhanden")

    # Group by task and compute stats
    from collections import defaultdict
    task_groups = defaultdict(lambda: {"answers": []})
    task_order = []
    for r in rows:
        tid = r["task_id"]
        if tid not in task_groups:
            task_order.append(tid)
        g = task_groups[tid]
        g["title"] = r["title"]
        g["text"] = r["text"]
        g["task_type"] = r["task_type"]
        g["solution"] = r["solution"] or ""
        g["max_points"] = r["max_points"]
        g["answers"].append({
            "student_answer": r["student_answer"] or "",
            "points_awarded": r["points_awarded"] or 0,
        })

    skip_answers_types = {"feynman", "scenario", "drawing", "webapp"}
    tasks_with_stats = []
    for tid in task_order:
        g = task_groups[tid]
        answers = g["answers"]
        n = len(answers)
        avg = sum(a["points_awarded"] for a in answers) / n if n else 0
        success = sum(1 for a in answers if a["points_awarded"] >= g["max_points"] * 0.5) / n if n else 0

        wrong_answers = []
        if g["task_type"] not in skip_answers_types:
            wrong = [a for a in answers if a["points_awarded"] < g["max_points"]]
            for a in wrong[:10]:
                wrong_answers.append({
                    "points": a["points_awarded"],
                    "answer": a["student_answer"][:300],
                })

        tasks_with_stats.append({
            "title": g["title"],
            "text": g["text"],
            "task_type": g["task_type"],
            "solution": g["solution"],
            "max_points": g["max_points"],
            "avg_points": avg,
            "success_rate": success,
            "student_count": n,
            "wrong_answers": wrong_answers,
        })

    analysis = await analyze_class_weaknesses(tasks_with_stats)

    # Cache result
    await db.execute(
        "INSERT OR REPLACE INTO class_analyses (exam_id, analysis_text) VALUES (?, ?)",
        (exam_id, analysis),
    )
    await db.commit()

    return {"analysis": analysis, "cached": False}


@router.get("/{exam_id}/statistics")
async def get_exam_statistics(
    exam_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    """Comprehensive class statistics for an exam."""
    cursor = await db.execute("SELECT * FROM exams WHERE id = ?", (exam_id,))
    exam = await cursor.fetchone()
    if not exam:
        raise HTTPException(status_code=404, detail="Klassenarbeit nicht gefunden")
    exam = dict(exam)

    # Parse custom grading scale
    scale_json = exam.get("grading_scale")
    custom_scale = None
    if scale_json:
        try:
            custom_scale = parse_scale(json.loads(scale_json) if isinstance(scale_json, str) else scale_json)
        except Exception:
            pass

    # Get all submitted/graded sessions
    cursor = await db.execute(
        """SELECT es.id as session_id, es.total_points, es.max_points,
                  s.name as student_name
           FROM exam_sessions es
           JOIN students s ON s.id = es.student_id
           WHERE es.exam_id = ? AND es.status IN ('submitted', 'graded')
           ORDER BY s.name""",
        (exam_id,),
    )
    sessions = [dict(row) for row in await cursor.fetchall()]

    if not sessions:
        return {"class_stats": None, "task_stats": []}

    # Calculate grades and collect scores
    scores = []
    percents = []
    grade_counts = {}
    for s in sessions:
        total = s["total_points"] or 0
        max_pts = s["max_points"] or 1
        grade, label, pct = calculate_grade(total, max_pts, custom_scale)
        scores.append(total)
        percents.append(pct)
        grade_counts[grade] = grade_counts.get(grade, 0) + 1

    # Ensure all grades 1-6 are present
    for g in ["1", "2", "3", "4", "5", "6"]:
        grade_counts.setdefault(g, 0)

    n = len(scores)
    if not percents:
        return {"class_stats": None, "task_stats": []}

    sorted_scores = sorted(scores)
    sorted_pct = sorted(percents)
    avg_percent = sum(percents) / n
    median_percent = sorted_pct[n // 2] if n % 2 == 1 else (sorted_pct[n // 2 - 1] + sorted_pct[n // 2]) / 2
    pass_count = sum(1 for p in percents if p >= 45)  # Note 4 or better (IHK default)

    # Score distribution bins (in percent)
    bins = [
        {"bin": "0-20%", "min": 0, "max": 20, "count": 0},
        {"bin": "21-40%", "min": 21, "max": 40, "count": 0},
        {"bin": "41-60%", "min": 41, "max": 60, "count": 0},
        {"bin": "61-80%", "min": 61, "max": 80, "count": 0},
        {"bin": "81-100%", "min": 81, "max": 100, "count": 0},
    ]
    for p in percents:
        for b in bins:
            if b["min"] <= p <= b["max"]:
                b["count"] += 1
                break

    class_stats = {
        "student_count": n,
        "average_percent": round(avg_percent, 1),
        "median_percent": round(median_percent, 1),
        "min_percent": round(min(percents), 1),
        "max_percent": round(max(percents), 1),
        "pass_rate": round((pass_count / n) * 100, 1),
        "grade_distribution": grade_counts,
        "score_distribution": [{"bin": b["bin"], "count": b["count"]} for b in bins],
    }

    # Task-level statistics
    cursor = await db.execute(
        """SELECT t.id as task_id, t.title, t.task_type, t.points as max_points,
                  COUNT(a.id) as answer_count,
                  AVG(COALESCE(a.points_awarded, 0)) as avg_points,
                  SUM(CASE WHEN a.points_awarded >= t.points THEN 1 ELSE 0 END) as full_marks_count,
                  SUM(CASE WHEN a.points_awarded = 0 OR a.points_awarded IS NULL THEN 1 ELSE 0 END) as zero_count
           FROM exam_tasks et
           JOIN tasks t ON t.id = et.task_id
           LEFT JOIN answers a ON a.task_id = t.id
               AND a.session_id IN (
                   SELECT id FROM exam_sessions WHERE exam_id = ? AND status IN ('submitted', 'graded')
               )
           WHERE et.exam_id = ?
           GROUP BY t.id, t.title, t.task_type, t.points
           ORDER BY et.position""",
        (exam_id, exam_id),
    )
    task_stats = []
    for row in await cursor.fetchall():
        r = dict(row)
        ac = r["answer_count"] or 1
        success_rate = ((r["avg_points"] or 0) / r["max_points"]) * 100 if r["max_points"] > 0 else 0
        task_stats.append({
            "task_id": r["task_id"],
            "title": r["title"],
            "task_type": r["task_type"],
            "max_points": r["max_points"],
            "avg_points": round(r["avg_points"] or 0, 1),
            "success_rate": round(success_rate, 1),
            "full_marks_count": r["full_marks_count"] or 0,
            "zero_count": r["zero_count"] or 0,
            "answer_count": r["answer_count"] or 0,
        })

    return {"class_stats": class_stats, "task_stats": task_stats}


@router.delete("/{exam_id}/sessions/{session_id}")
async def delete_student_session(
    exam_id: int,
    session_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    """Delete a single student session and all its answers."""
    cursor = await db.execute(
        "SELECT id FROM exam_sessions WHERE id = ? AND exam_id = ?", (session_id, exam_id)
    )
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="Sitzung nicht gefunden")
    await db.execute("DELETE FROM answers WHERE session_id = ?", (session_id,))
    await db.execute("DELETE FROM exam_sessions WHERE id = ?", (session_id,))
    # Invalidate class analysis cache
    await db.execute("DELETE FROM class_analyses WHERE exam_id = ?", (exam_id,))
    await db.commit()
    return {"message": "Sitzung gelöscht"}


@router.delete("/{exam_id}/class-analysis")
async def delete_class_analysis(
    exam_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    await db.execute("DELETE FROM class_analyses WHERE exam_id = ?", (exam_id,))
    await db.commit()
    return {"message": "Analyse gelöscht"}
