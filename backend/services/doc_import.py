"""
Document import via AI:
- PDF: Render pages as images via PyMuPDF, send to Claude multimodal
- DOCX: Extract text + images directly via python-docx, send to Claude
No external tools (LibreOffice, pandoc) required.
"""

import json
import base64
import asyncio
import io

from anthropic import Anthropic
from config import ANTHROPIC_API_KEY, CLAUDE_MODEL

# Rate limiting
_semaphore = asyncio.Semaphore(2)

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = Anthropic(api_key=ANTHROPIC_API_KEY)
    return _client


def _parse_json_response(text: str) -> list:
    """Extract JSON array from Claude's response."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)
    return json.loads(text)


TASK_PROMPT = """Analysiere dieses Dokument und erstelle daraus strukturierte Prüfungsaufgaben.

Verwende passende Aufgabentypen:
- multichoice: Multiple Choice (question_data: {"single": true, "shuffle": true, "answers": [{"text": "...", "fraction": 100, "feedback": "..."}]})
- truefalse: Wahr/Falsch (question_data: {"correct_answer": true, "feedback_true": "...", "feedback_false": "..."})
- shortanswer: Kurzantwort (question_data: {"answers": [{"text": "Erwartete Antwort", "fraction": 100}]})
- numerical: Zahlenwert (question_data: {"answers": [{"value": 42, "tolerance": 0.1, "fraction": 100}]})
- matching: Zuordnung (question_data: {"shuffle": true, "pairs": [{"question": "...", "answer": "..."}]})
- ordering: Reihenfolge (question_data: {"items": ["Erster", "Zweiter", "Dritter"]})
- cloze: Lückentext (question_data: {"gaps": [{"type": "shortanswer", "answers": [{"text": "...", "fraction": 100}]}]})
- essay: Freitext (question_data: {"grader_info": "Erwartete Lösung und Kriterien"})
- webapp: Interaktive Web-App (question_data: {"app_description": "Beschreibung der App", "grader_info": "Bewertungskriterien"}) — nur wenn das Thema sich für eine interaktive Anwendung eignet (z.B. Kalkulationen, Zuordnungen, Spreadsheets)
- description: Nur Beschreibung/Info (question_data: {})

Wähle den Aufgabentyp basierend auf dem Inhalt:
- Wenn das Dokument bereits Aufgaben enthält, übernimm den passenden Typ
- Wenn es Lernstoff/Text ist, erstelle verschiedene Aufgabentypen dazu

WICHTIG für den Aufgabentext:
- Formuliere die Aufgaben in klarem, eigenständigem Deutsch
- Übernimm KEINE Formatierungsartefakte aus dem Quelldokument (z.B. Dateinamen wie "verzeichnisliste.txt", HTML/Markdown-Tags, Code-Blöcke die nur Formatierung sind)
- Wenn das Dokument auf Dateien, Bilder oder externe Ressourcen verweist, beschreibe den relevanten Inhalt direkt im Aufgabentext statt auf die Datei zu verweisen
- Der Aufgabentext muss für sich allein verständlich sein, ohne das Quelldokument

Antworte als JSON-Array:
[
  {
    "title": "Aufgabentitel",
    "text": "Aufgabentext",
    "hint": "Optionaler Hinweis für den Schüler während der Prüfung",
    "solution": "Ausführliche Musterlösung — diese wird nach der Prüfung angezeigt und zur Bewertung genutzt",
    "topic": "Themengebiet",
    "task_type": "multichoice|truefalse|shortanswer|...",
    "points": 1-5,
    "question_data": { ... }
  }
]

WICHTIG: Jede Aufgabe MUSS eine ausführliche "solution" (Musterlösung) enthalten.
- Bei Multiple Choice: Erkläre warum die richtige Antwort korrekt ist
- Bei Kurzantwort/Numerisch: Gib die korrekte Antwort mit Erklärung
- Bei Essay/Freitext: Beschreibe was eine vollständige Antwort enthalten sollte
- Bei Zuordnung/Reihenfolge: Erkläre die korrekte Zuordnung/Reihenfolge"""

SYSTEM_PROMPT = """Du bist ein erfahrener Lehrer. Analysiere das hochgeladene Dokument und erstelle daraus strukturierte Prüfungsaufgaben in verschiedenen Formaten.
Antworte IMMER als valides JSON-Array. Keine zusätzliche Erklärung."""


async def _post_process_tasks(tasks: list) -> None:
    """Validate tasks and generate app_html for any webapp tasks."""
    from services.claude_service import generate_webapp

    for task in tasks:
        if not isinstance(task, dict):
            continue
        task.setdefault("title", "Unbenannte Aufgabe")
        task.setdefault("text", "")
        task.setdefault("hint", "")
        task.setdefault("solution", "")
        task.setdefault("topic", "")
        task.setdefault("task_type", "essay")
        task.setdefault("points", 1)
        task.setdefault("question_data", {})

        # Generate app_html for webapp tasks
        if task["task_type"] == "webapp":
            qd = task["question_data"]
            desc = qd.get("app_description", "") or task.get("text", "")
            grader = qd.get("grader_info", "")
            try:
                app_html = await generate_webapp(desc, grader)
                qd["app_html"] = app_html
            except Exception:
                # Fallback to essay if webapp generation fails
                task["task_type"] = "essay"
                qd["grader_info"] = grader


def _extract_docx(file_path: str) -> list[dict]:
    """Extract text and images from a DOCX file. Returns list of content blocks for Claude."""
    import docx

    doc = docx.Document(file_path)
    content = []

    # Extract full text
    paragraphs = []
    for para in doc.paragraphs:
        if para.text.strip():
            paragraphs.append(para.text)

    # Also extract text from tables
    for table in doc.tables:
        table_rows = []
        for row in table.rows:
            cells = [cell.text.strip() for cell in row.cells]
            table_rows.append(" | ".join(cells))
        if table_rows:
            paragraphs.append("\n".join(table_rows))

    if paragraphs:
        content.append({
            "type": "text",
            "text": "--- Dokumentinhalt ---\n\n" + "\n\n".join(paragraphs),
        })

    # Extract embedded images
    image_count = 0
    for rel in doc.part.rels.values():
        if "image" in rel.reltype:
            try:
                img_data = rel.target_part.blob
                # Detect image type
                if img_data[:8] == b'\x89PNG\r\n\x1a\n':
                    media_type = "image/png"
                elif img_data[:2] == b'\xff\xd8':
                    media_type = "image/jpeg"
                else:
                    continue  # Skip unsupported formats

                b64 = base64.b64encode(img_data).decode("utf-8")
                image_count += 1
                content.append({
                    "type": "text",
                    "text": f"--- Eingebettetes Bild {image_count} ---",
                })
                content.append({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": b64,
                    },
                })
            except Exception:
                continue

    return content


def _extract_pdf(file_path: str) -> list[dict]:
    """Render PDF pages as images. Returns list of content blocks for Claude."""
    import fitz

    doc = fitz.open(file_path)
    content = []

    # Limit to 20 pages
    page_count = min(len(doc), 20)

    for i in range(page_count):
        page = doc[i]
        pix = page.get_pixmap(dpi=200)
        img_bytes = pix.tobytes("png")
        b64 = base64.b64encode(img_bytes).decode("utf-8")

        content.append({
            "type": "text",
            "text": f"--- Seite {i + 1} ---",
        })
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": b64,
            },
        })

    doc.close()
    return content


async def import_document(file_path: str, original_filename: str) -> list[dict]:
    """
    Import tasks from a document (PDF or DOCX).
    - DOCX: Extracts text + images directly via python-docx
    - PDF: Renders pages as images via PyMuPDF
    Sends content to Claude for task extraction.
    Returns list of task dicts with question_data.
    """
    ext = original_filename.rsplit(".", 1)[-1].lower() if "." in original_filename else ""

    if ext == "docx":
        content = _extract_docx(file_path)
    else:
        content = _extract_pdf(file_path)

    if not content:
        raise ValueError("Keine Inhalte im Dokument gefunden.")

    # Append task generation prompt
    content.append({"type": "text", "text": TASK_PROMPT})

    async with _semaphore:
        response = await asyncio.to_thread(
            _get_client().messages.create,
            model=CLAUDE_MODEL,
            max_tokens=64000,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": content}],
        )

    tasks = _parse_json_response(response.content[0].text)

    # Validate and post-process
    await _post_process_tasks(tasks)

    return tasks


async def import_document_with_instructions(
    file_path: str, original_filename: str, instructions: str
) -> list[dict]:
    """
    Like import_document, but with custom teacher instructions for task generation.
    The instructions guide what kind of tasks to create.
    """
    ext = original_filename.rsplit(".", 1)[-1].lower() if "." in original_filename else ""

    if ext == "docx":
        content = _extract_docx(file_path)
    else:
        content = _extract_pdf(file_path)

    if not content:
        raise ValueError("Keine Inhalte im Dokument gefunden.")

    # Build a customized prompt with teacher instructions
    custom_prompt = TASK_PROMPT
    if instructions.strip():
        custom_prompt += f"\n\nWICHTIG — Anweisungen des Lehrers:\n{instructions.strip()}\n\nHalte dich unbedingt an diese Anweisungen bei der Erstellung der Aufgaben."

    content.append({"type": "text", "text": custom_prompt})

    async with _semaphore:
        response = await asyncio.to_thread(
            _get_client().messages.create,
            model=CLAUDE_MODEL,
            max_tokens=64000,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": content}],
        )

    tasks = _parse_json_response(response.content[0].text)

    # Validate and post-process
    await _post_process_tasks(tasks)

    return tasks
