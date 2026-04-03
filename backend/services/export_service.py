import base64
import io
import re
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
    KeepTogether,
    Image,
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
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


def _escape(text: str) -> str:
    """Escape HTML special chars for ReportLab Paragraph."""
    if not text:
        return ""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


_IMG_PATTERN = re.compile(r'!\[img_\d+\]\((data:image/[^)]+)\)')
_MAX_IMG_WIDTH = 160 * mm  # max width in PDF


def _render_text_with_images(text: str, style) -> list:
    """Split text on embedded base64 images, return list of Paragraph and Image flowables."""
    parts = _IMG_PATTERN.split(text)
    elements = []
    for i, part in enumerate(parts):
        if i % 2 == 0:
            # Text part
            cleaned = part.strip()
            if cleaned:
                elements.append(Paragraph(_escape(cleaned), style))
        else:
            # data:image/... URI
            try:
                header, b64_data = part.split(",", 1)
                img_bytes = base64.b64decode(b64_data)
                img_buf = io.BytesIO(img_bytes)
                img = ImageReader(img_buf)
                iw, ih = img.getSize()
                # Scale down to fit page width, keep aspect ratio
                if iw > _MAX_IMG_WIDTH:
                    scale = _MAX_IMG_WIDTH / iw
                    iw = _MAX_IMG_WIDTH
                    ih = ih * scale
                # Cap height too
                max_h = 120 * mm
                if ih > max_h:
                    scale = max_h / ih
                    ih = max_h
                    iw = iw * scale
                elements.append(Spacer(1, 2 * mm))
                elements.append(Image(img_buf, width=iw, height=ih))
                elements.append(Spacer(1, 2 * mm))
            except Exception:
                elements.append(Paragraph("[Bild konnte nicht geladen werden]", style))
    return elements


def generate_student_pdf(student_name, exam_title, answers, total_points, max_points,
                         grading_scale=None, class_name="", exam_date="", solution_mode="none"):
    """Generate a print-ready PDF for a single student's results.

    solution_mode: "none" (no solutions), "correct" (show solution for wrong answers),
                   "all" (show all solutions)
    """
    font, font_bold = _register_fonts()
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        topMargin=15 * mm, bottomMargin=20 * mm,
        leftMargin=18 * mm, rightMargin=18 * mm,
    )

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle("DocTitle", fontName=font_bold, fontSize=16, spaceAfter=2 * mm))
    styles.add(ParagraphStyle("Normal2", fontName=font, fontSize=10, leading=13))
    styles.add(ParagraphStyle("Bold2", fontName=font_bold, fontSize=10, leading=13))
    styles.add(ParagraphStyle("Small", fontName=font, fontSize=8.5, textColor=colors.HexColor("#64748b"), leading=11))
    styles.add(ParagraphStyle("SmallBold", fontName=font_bold, fontSize=8.5, textColor=colors.HexColor("#64748b"), leading=11))
    styles.add(ParagraphStyle("TaskTitle", fontName=font_bold, fontSize=11, leading=14))
    styles.add(ParagraphStyle("Solution", fontName=font, fontSize=9, textColor=colors.HexColor("#166534"),
                               leading=12, leftIndent=8, borderPadding=4))
    styles.add(ParagraphStyle("Feedback", fontName=font, fontSize=9, textColor=colors.HexColor("#475569"),
                               leading=12, leftIndent=8))
    styles.add(ParagraphStyle("RightAlign", fontName=font, fontSize=8.5, alignment=TA_RIGHT,
                               textColor=colors.HexColor("#94a3b8")))

    elements = []

    # === HEADER ===
    elements.append(Paragraph(_escape(exam_title), styles["DocTitle"]))

    # Subheader: class + date
    sub_parts = []
    if class_name:
        sub_parts.append(f"Klasse: {_escape(class_name)}")
    if exam_date:
        sub_parts.append(f"Datum: {_escape(exam_date)}")
    else:
        sub_parts.append(f"Datum: {datetime.now().strftime('%d.%m.%Y')}")
    if sub_parts:
        elements.append(Paragraph(" | ".join(sub_parts), styles["Small"]))
    elements.append(Spacer(1, 4 * mm))

    # === RESULT BOX ===
    grade, grade_label, percent = calculate_grade(total_points or 0, max_points or 1, grading_scale)
    result_data = [
        [
            Paragraph(f"<b>Schueler/in:</b> {_escape(student_name)}", styles["Normal2"]),
            Paragraph(f"<b>Punkte:</b> {total_points or 0} / {max_points or 0}", styles["Normal2"]),
            Paragraph(f"<b>Note:</b> {grade} ({_escape(grade_label)})", styles["Normal2"]),
            Paragraph(f"<b>{percent}%</b>", styles["Normal2"]),
        ]
    ]
    result_table = Table(result_data, colWidths=[170, 120, 120, 50])
    result_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f1f5f9")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    elements.append(result_table)
    elements.append(Spacer(1, 6 * mm))

    # === ANSWERS ===
    for i, answer in enumerate(answers):
        task_title = answer.get("task_title", f"Aufgabe {i + 1}")
        task_text = answer.get("task_text", "")
        student_answer = answer.get("student_answer", "")
        pts = answer.get("points_awarded")
        max_pts = answer.get("max_points", 0)
        feedback = answer.get("feedback", "")
        solution = answer.get("solution", "")
        is_correct = answer.get("is_correct", False)
        task_type = answer.get("task_type", "essay")

        # Points color
        pts_display = f"{pts if pts is not None else '?'}/{max_pts}"
        pts_color = "#166534" if is_correct else "#b91c1c" if pts is not None else "#64748b"

        task_elements = []

        # Task header with number and points
        task_elements.append(Paragraph(
            f"<b>Aufgabe {i + 1}: {_escape(task_title)}</b>"
            f'  <font color="{pts_color}">({pts_display} Punkte)</font>',
            styles["TaskTitle"]
        ))
        task_elements.append(Spacer(1, 1.5 * mm))

        # Task text with embedded images
        if task_text and task_type != "description":
            text_elements = _render_text_with_images(task_text, styles["Small"])
            task_elements.extend(text_elements)
            task_elements.append(Spacer(1, 1.5 * mm))

        # Student answer
        if student_answer and task_type not in ("description",):
            if student_answer.startswith("data:image"):
                # Drawing/photo answer: render as image
                task_elements.append(Paragraph("<b>Antwort:</b>", styles["Normal2"]))
                try:
                    header, b64_data = student_answer.split(",", 1)
                    img_bytes = base64.b64decode(b64_data)
                    img_buf = io.BytesIO(img_bytes)
                    img = ImageReader(img_buf)
                    iw, ih = img.getSize()
                    if iw > _MAX_IMG_WIDTH:
                        scale = _MAX_IMG_WIDTH / iw
                        iw, ih = _MAX_IMG_WIDTH, ih * scale
                    max_h = 100 * mm
                    if ih > max_h:
                        scale = max_h / ih
                        iw, ih = iw * scale, max_h
                    task_elements.append(Image(img_buf, width=iw, height=ih))
                except Exception:
                    task_elements.append(Paragraph("[Bild konnte nicht geladen werden]", styles["Small"]))
            else:
                answer_text = student_answer
                if task_type in ("multichoice", "matching", "ordering", "cloze"):
                    answer_text = student_answer[:300]
                elif len(answer_text) > 500:
                    answer_text = answer_text[:500] + "..."
                task_elements.append(Paragraph(
                    f"<b>Antwort:</b> {_escape(answer_text)}", styles["Normal2"]
                ))
        elif task_type == "description":
            task_elements.append(Paragraph("<i>Keine Antwort erforderlich</i>", styles["Small"]))
        else:
            task_elements.append(Paragraph("<b>Antwort:</b> <i>Keine Antwort</i>", styles["Normal2"]))

        # Feedback
        if feedback:
            task_elements.append(Spacer(1, 1 * mm))
            task_elements.append(Paragraph(f"<b>Bewertung:</b> {_escape(feedback)}", styles["Feedback"]))

        # Solution (if enabled)
        show_solution = (
            (solution_mode == "all") or
            (solution_mode == "correct" and not is_correct)
        )
        if show_solution and solution:
            task_elements.append(Spacer(1, 1 * mm))
            sol_text = solution[:500] + "..." if len(solution) > 500 else solution
            task_elements.append(Paragraph(
                f"<b>Musterloesung:</b> {_escape(sol_text)}", styles["Solution"]
            ))

        task_elements.append(Spacer(1, 2 * mm))
        task_elements.append(HRFlowable(width="100%", thickness=0.3, color=colors.HexColor("#e2e8f0")))
        task_elements.append(Spacer(1, 3 * mm))

        # Keep task together on one page if possible
        elements.append(KeepTogether(task_elements))

    # === SIGNATURE SECTION ===
    elements.append(Spacer(1, 12 * mm))
    sig_data = [
        [
            Paragraph("_" * 40, styles["Normal2"]),
            "",
            Paragraph("_" * 40, styles["Normal2"]),
        ],
        [
            Paragraph("Datum, Unterschrift Lehrer/in", styles["Small"]),
            "",
            Paragraph("Unterschrift Schueler/in", styles["Small"]),
        ],
    ]
    sig_table = Table(sig_data, colWidths=[200, 60, 200])
    sig_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
    ]))
    elements.append(sig_table)

    # Footer note
    elements.append(Spacer(1, 8 * mm))
    elements.append(Paragraph(
        f"Erstellt mit ExamPilot am {datetime.now().strftime('%d.%m.%Y %H:%M')}",
        styles["RightAlign"]
    ))

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
    styles.add(ParagraphStyle("RightAlign", fontName=font, fontSize=8.5, alignment=TA_RIGHT,
                               textColor=colors.HexColor("#94a3b8")))

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

    # Footer
    elements.append(Spacer(1, 10 * mm))
    elements.append(Paragraph(
        f"Erstellt mit ExamPilot am {datetime.now().strftime('%d.%m.%Y %H:%M')}",
        styles["RightAlign"]
    ))

    doc.build(elements)
    buffer.seek(0)
    return buffer
