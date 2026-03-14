from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
import aiosqlite

from database import get_db
from models import AnswerAdjust
from routers.auth import require_teacher
from services.grading import calculate_grade

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
            grade, label, percent = calculate_grade(s["total_points"], s["max_points"])
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
        """SELECT es.*, e.title as exam_title, s.name as student_name
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

    cursor = await db.execute(
        """SELECT a.*, t.title as task_title, t.text as task_text, t.points as max_points, t.hint, t.solution
           FROM answers a
           JOIN tasks t ON t.id = a.task_id
           WHERE a.session_id = ?""",
        (session_id,),
    )
    answers = [dict(row) for row in await cursor.fetchall()]

    grade, label, percent = calculate_grade(
        session.get("total_points", 0) or 0,
        session.get("max_points", 1) or 1,
    )

    return {
        "session": session,
        "answers": answers,
        "grade": grade,
        "grade_label": label,
        "percent": percent,
    }


@router.put("/{exam_id}/answers/{answer_id}/adjust")
async def adjust_answer(
    exam_id: int,
    answer_id: int,
    req: AnswerAdjust,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    cursor = await db.execute("SELECT * FROM answers WHERE id = ?", (answer_id,))
    answer = await cursor.fetchone()
    if not answer:
        raise HTTPException(status_code=404, detail="Antwort nicht gefunden")

    update_fields = "points_awarded = ?, manually_adjusted = TRUE, disputed = FALSE, dispute_reason = NULL"
    is_correct = req.points_awarded > 0
    update_fields += ", is_correct = ?"
    values = [req.points_awarded, is_correct]
    if req.feedback is not None:
        update_fields += ", feedback = ?"
        values.append(req.feedback)
    values.append(answer_id)

    await db.execute(f"UPDATE answers SET {update_fields} WHERE id = ?", values)

    # Recalculate session total
    answer_dict = dict(answer)
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

    await db.commit()
    return {"message": "Punkte angepasst", "new_total": total}
