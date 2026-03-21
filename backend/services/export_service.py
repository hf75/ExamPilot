import io
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

from services.grading import calculate_grade


def _register_fonts():
    """Try to register a Unicode-capable font, fall back to Helvetica."""
    try:
        pdfmetrics.registerFont(TTFont("DejaVu", "DejaVuSans.ttf"))
        pdfmetrics.registerFont(TTFont("DejaVu-Bold", "DejaVuSans-Bold.ttf"))
        return "DejaVu", "DejaVu-Bold"
    except Exception:
        return "Helvetica", "Helvetica-Bold"


def generate_student_pdf(student_name, exam_title, answers, total_points, max_points, grading_scale=None):
    """Generate PDF for a single student's results."""
    font, font_bold = _register_fonts()
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=20 * mm, bottomMargin=20 * mm)

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle("Title2", parent=styles["Title"], fontName=font_bold, fontSize=16))
    styles.add(ParagraphStyle("Normal2", parent=styles["Normal"], fontName=font, fontSize=10))
    styles.add(ParagraphStyle("Bold2", parent=styles["Normal"], fontName=font_bold, fontSize=10))
    styles.add(ParagraphStyle("Small", parent=styles["Normal"], fontName=font, fontSize=9, textColor=colors.grey))

    elements = []

    # Header
    elements.append(Paragraph(exam_title, styles["Title2"]))
    elements.append(Spacer(1, 4 * mm))

    grade, grade_label, percent = calculate_grade(total_points or 0, max_points or 1, grading_scale)
    header_data = [
        ["Schueler:", student_name, "Punkte:", f"{total_points or 0} / {max_points or 0}"],
        ["", "", "Prozent:", f"{percent}%"],
        ["", "", "Note:", f"{grade} ({grade_label})"],
    ]
    header_table = Table(header_data, colWidths=[60, 200, 50, 100])
    header_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), font),
        ("FONTNAME", (0, 0), (0, -1), font_bold),
        ("FONTNAME", (2, 0), (2, -1), font_bold),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    elements.append(header_table)
    elements.append(Spacer(1, 8 * mm))

    # Answers
    for i, answer in enumerate(answers):
        task_title = answer.get("task_title", f"Aufgabe {i + 1}")
        task_text = answer.get("task_text", "")
        student_answer = answer.get("student_answer", "Keine Antwort")
        pts = answer.get("points_awarded", 0)
        max_pts = answer.get("max_points", 0)
        feedback = answer.get("feedback", "")

        elements.append(Paragraph(
            f"<b>{task_title}</b> ({pts or 0}/{max_pts} Punkte)", styles["Bold2"]
        ))
        elements.append(Spacer(1, 2 * mm))
        elements.append(Paragraph(task_text[:500], styles["Normal2"]))
        elements.append(Spacer(1, 2 * mm))
        elements.append(Paragraph(f"<b>Antwort:</b> {student_answer[:500]}", styles["Normal2"]))
        if feedback:
            elements.append(Spacer(1, 1 * mm))
            elements.append(Paragraph(f"Feedback: {feedback}", styles["Small"]))
        elements.append(Spacer(1, 5 * mm))

    doc.build(elements)
    buffer.seek(0)
    return buffer


def generate_overview_pdf(exam_title, class_name, results, grading_scale=None):
    """Generate PDF overview of all students' results."""
    font, font_bold = _register_fonts()
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=20 * mm, bottomMargin=20 * mm)

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle("Title2", parent=styles["Title"], fontName=font_bold, fontSize=16))
    styles.add(ParagraphStyle("Normal2", parent=styles["Normal"], fontName=font, fontSize=10))

    elements = []

    elements.append(Paragraph(f"{exam_title}", styles["Title2"]))
    if class_name:
        elements.append(Paragraph(f"Klasse: {class_name}", styles["Normal2"]))
    elements.append(Spacer(1, 8 * mm))

    # Table header
    table_data = [["Name", "Punkte", "Prozent", "Note"]]
    for r in results:
        grade, grade_label, percent = calculate_grade(
            r.get("total_points", 0) or 0,
            r.get("max_points", 1) or 1,
            grading_scale,
        )
        table_data.append([
            r.get("student_name", ""),
            f"{r.get('total_points', 0) or 0} / {r.get('max_points', 0) or 0}",
            f"{percent}%",
            f"{grade} ({grade_label})",
        ])

    table = Table(table_data, colWidths=[180, 80, 60, 100])
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), font_bold),
        ("FONTNAME", (0, 1), (-1, -1), font),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#f8fafc"), colors.white]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(table)

    doc.build(elements)
    buffer.seek(0)
    return buffer
