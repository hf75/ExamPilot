from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
import aiosqlite

from database import get_db
from routers.auth import require_teacher, verify_token
from services.export_service import generate_student_pdf, generate_overview_pdf

router = APIRouter(prefix="/api/exams", tags=["export"])


def require_teacher_or_token(token: str = Query(None)):
    """Allow auth via query param for PDF downloads opened in new tabs."""
    if token:
        verify_token(token)
        return True
    return None


@router.get("/{exam_id}/export/pdf")
async def export_overview_pdf(
    exam_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    _auth: bool = Depends(require_teacher_or_token),
):
    cursor = await db.execute("SELECT * FROM exams WHERE id = ?", (exam_id,))
    exam = await cursor.fetchone()
    if not exam:
        raise HTTPException(status_code=404, detail="Klassenarbeit nicht gefunden")
    exam = dict(exam)

    cursor = await db.execute(
        """SELECT es.total_points, es.max_points, s.name as student_name
           FROM exam_sessions es
           JOIN students s ON s.id = es.student_id
           WHERE es.exam_id = ? AND es.status IN ('submitted', 'graded')
           ORDER BY s.name""",
        (exam_id,),
    )
    results = [dict(row) for row in await cursor.fetchall()]

    buffer = generate_overview_pdf(exam["title"], exam.get("class_name", ""), results)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="Ergebnisse_{exam["title"]}.pdf"'},
    )


@router.get("/{exam_id}/export/{session_id}/pdf")
async def export_student_pdf(
    exam_id: int,
    session_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    _auth: bool = Depends(require_teacher_or_token),
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
        """SELECT a.*, t.title as task_title, t.text as task_text, t.points as max_points
           FROM answers a
           JOIN tasks t ON t.id = a.task_id
           WHERE a.session_id = ?""",
        (session_id,),
    )
    answers = [dict(row) for row in await cursor.fetchall()]

    buffer = generate_student_pdf(
        session["student_name"],
        session["exam_title"],
        answers,
        session["total_points"],
        session["max_points"],
    )
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="Ergebnis_{session["student_name"]}.pdf"'
        },
    )
