import csv
import io
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse, Response
import aiosqlite

from database import get_db
from routers.auth import require_teacher, verify_token
from services.export_service import generate_student_pdf, generate_overview_pdf
from services.grading import calculate_grade, parse_scale


def _safe_filename(name: str) -> str:
    """Encode filename for Content-Disposition header (RFC 5987)."""
    return f"UTF-8''{quote(name)}"

router = APIRouter(prefix="/api/exams", tags=["export"])


def require_teacher_or_token(token: str = Query(None)):
    """Allow auth via query param for PDF downloads opened in new tabs."""
    if token:
        verify_token(token)
        return True
    raise HTTPException(status_code=401, detail="Nicht autorisiert")


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

    # Parse custom grading scale for PDF
    gs_json = exam.get("grading_scale")
    pdf_scale = None
    if gs_json:
        try:
            import json as _json
            pdf_scale = parse_scale(_json.loads(gs_json) if isinstance(gs_json, str) else gs_json)
        except Exception:
            pass
    buffer = generate_overview_pdf(exam["title"], exam.get("class_name", ""), results, pdf_scale)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename*={_safe_filename('Ergebnisse_' + exam['title'] + '.pdf')}"},
    )


@router.get("/{exam_id}/export/{session_id}/pdf")
async def export_student_pdf(
    exam_id: int,
    session_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    _auth: bool = Depends(require_teacher_or_token),
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

    cursor = await db.execute(
        """SELECT a.*, t.title as task_title, t.text as task_text, t.points as max_points
           FROM answers a
           JOIN tasks t ON t.id = a.task_id
           WHERE a.session_id = ?""",
        (session_id,),
    )
    answers = [dict(row) for row in await cursor.fetchall()]

    # Parse custom grading scale for student PDF
    student_gs = session.get("exam_grading_scale")
    student_scale = None
    if student_gs:
        try:
            import json as _json
            student_scale = parse_scale(_json.loads(student_gs) if isinstance(student_gs, str) else student_gs)
        except Exception:
            pass
    buffer = generate_student_pdf(
        session["student_name"],
        session["exam_title"],
        answers,
        session["total_points"],
        session["max_points"],
        student_scale,
    )
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename*={_safe_filename('Ergebnis_' + session['student_name'] + '.pdf')}"
        },
    )


@router.get("/{exam_id}/export/csv")
async def export_results_csv(
    exam_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    _auth: bool = Depends(require_teacher_or_token),
):
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
            import json
            custom_scale = parse_scale(json.loads(scale_json) if isinstance(scale_json, str) else scale_json)
        except Exception:
            pass

    cursor = await db.execute(
        """SELECT es.id as session_id, es.total_points, es.max_points, es.status,
                  es.started_at, es.submitted_at, s.name as student_name
           FROM exam_sessions es
           JOIN students s ON s.id = es.student_id
           WHERE es.exam_id = ? AND es.status IN ('submitted', 'graded')
           ORDER BY s.name""",
        (exam_id,),
    )
    sessions = [dict(row) for row in await cursor.fetchall()]

    output = io.StringIO()
    # BOM for Excel UTF-8 compatibility
    output.write("\ufeff")
    writer = csv.writer(output, delimiter=";")
    writer.writerow(["Name", "Punkte", "Max. Punkte", "Prozent", "Note", "Notenbezeichnung", "Status", "Abgabezeitpunkt"])

    for s in sessions:
        if s["total_points"] is not None and s["max_points"]:
            grade, label, percent = calculate_grade(s["total_points"], s["max_points"], custom_scale)
        else:
            grade, label, percent = "-", "-", 0

        status_label = {"submitted": "Abgegeben", "graded": "Bewertet"}.get(s["status"], s["status"])
        writer.writerow([
            s["student_name"],
            s["total_points"] or 0,
            s["max_points"] or 0,
            percent,
            grade,
            label,
            status_label,
            s["submitted_at"] or "",
        ])

    csv_content = output.getvalue()
    return Response(
        content=csv_content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename*={_safe_filename('Ergebnisse_' + exam['title'] + '.csv')}"},
    )
