import json
import tempfile
import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional
import aiosqlite

from database import get_db
from models import TaskCreate, TaskUpdate, TaskOut
from routers.auth import require_teacher
from services.claude_service import generate_tasks as ai_generate_tasks, ai_edit_task, generate_webapp

MAX_UPLOAD_SIZE = 20 * 1024 * 1024  # 20 MB


async def _check_file_size(file: UploadFile, max_size: int = MAX_UPLOAD_SIZE):
    """Read file content and enforce size limit."""
    content = await file.read()
    if len(content) > max_size:
        raise HTTPException(
            status_code=400,
            detail=f"Datei zu groß ({len(content) // 1024 // 1024} MB). Maximum: {max_size // 1024 // 1024} MB."
        )
    return content


class GenerateRequest(BaseModel):
    topic: str
    count: int = 5
    difficulty: str = "mittel"
    instructions: str = ""
    allowed_types: list[str] = []


class GenerateWebAppRequest(BaseModel):
    description: str
    grader_info: str = ""


class AiEditRequest(BaseModel):
    prompt: str

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def _row_to_task(row) -> dict:
    """Convert a DB row to a task dict with parsed question_data."""
    d = dict(row)
    qd = d.get("question_data", "{}")
    try:
        d["question_data"] = json.loads(qd) if isinstance(qd, str) else qd
    except (json.JSONDecodeError, TypeError):
        d["question_data"] = {}
    return d


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    pool_id: Optional[int] = None,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    if pool_id is not None:
        cursor = await db.execute(
            "SELECT * FROM tasks WHERE pool_id = ? ORDER BY created_at DESC", (pool_id,)
        )
    else:
        cursor = await db.execute("SELECT * FROM tasks ORDER BY created_at DESC")
    rows = await cursor.fetchall()
    return [_row_to_task(row) for row in rows]


@router.post("", response_model=TaskOut)
async def create_task(
    task: TaskCreate,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    # Validate pool_id exists
    if task.pool_id is not None:
        cursor = await db.execute("SELECT id FROM task_pools WHERE id = ?", (task.pool_id,))
        if not await cursor.fetchone():
            raise HTTPException(status_code=400, detail="Ungültiger Pool")

    qdata_json = json.dumps(task.question_data or {}, ensure_ascii=False)
    cursor = await db.execute(
        """INSERT INTO tasks (title, text, hint, solution, topic, task_type, points, parent_task_id, source, question_data, pool_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (task.title, task.text, task.hint, task.solution, task.topic, task.task_type,
         task.points, task.parent_task_id, task.source, qdata_json, task.pool_id),
    )
    await db.commit()
    task_id = cursor.lastrowid
    cursor = await db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
    row = await cursor.fetchone()
    return _row_to_task(row)


@router.put("/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: int,
    task: TaskUpdate,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    updates = {k: v for k, v in task.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="Keine Änderungen angegeben")

    # Serialize question_data to JSON string for storage
    if "question_data" in updates:
        updates["question_data"] = json.dumps(updates["question_data"], ensure_ascii=False)

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [task_id]
    await db.execute(f"UPDATE tasks SET {set_clause} WHERE id = ?", values)
    await db.commit()

    cursor = await db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Aufgabe nicht gefunden")
    return _row_to_task(row)


@router.delete("/{task_id}")
async def delete_task(
    task_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    cursor = await db.execute("SELECT id FROM tasks WHERE id = ?", (task_id,))
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="Aufgabe nicht gefunden")

    await db.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    await db.commit()
    return {"message": "Aufgabe gelöscht"}


@router.post("/{task_id}/duplicate", response_model=TaskOut)
async def duplicate_task(
    task_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    cursor = await db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Aufgabe nicht gefunden")
    task = dict(row)

    cursor = await db.execute(
        """INSERT INTO tasks (title, text, hint, solution, topic, task_type, points, parent_task_id, source, question_data, pool_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            task["title"] + " (Kopie)",
            task["text"],
            task["hint"],
            task["solution"],
            task["topic"],
            task["task_type"],
            task["points"],
            task_id,
            task["source"],
            task["question_data"],
            task["pool_id"],
        ),
    )
    await db.commit()
    new_id = cursor.lastrowid
    cursor = await db.execute("SELECT * FROM tasks WHERE id = ?", (new_id,))
    return _row_to_task(await cursor.fetchone())


@router.put("/{task_id}/move")
async def move_task(
    task_id: int,
    body: dict,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    pool_id = body.get("pool_id")
    if pool_id is None:
        raise HTTPException(status_code=400, detail="pool_id erforderlich")

    cursor = await db.execute("SELECT id FROM task_pools WHERE id = ?", (pool_id,))
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="Ziel-Pool nicht gefunden")

    cursor = await db.execute("SELECT id FROM tasks WHERE id = ?", (task_id,))
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="Aufgabe nicht gefunden")

    await db.execute("UPDATE tasks SET pool_id = ? WHERE id = ?", (pool_id, task_id))
    await db.commit()
    return {"message": "Aufgabe verschoben"}


@router.post("/import-document")
async def import_document_endpoint(
    file: UploadFile = File(...),
    allowed_types: str = Form(""),
    coding_language: str = Form(""),
    _: bool = Depends(require_teacher),
):
    """Import tasks from PDF or DOCX via AI analysis."""
    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ("pdf", "docx"):
        raise HTTPException(status_code=400, detail="Nur PDF- oder DOCX-Dateien erlaubt")

    from services.doc_import import import_document

    types_list = [t.strip() for t in allowed_types.split(",") if t.strip()] if allowed_types.strip() else None

    content = await _check_file_size(file)

    suffix = f".{ext}"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        tasks = await import_document(tmp_path, filename, types_list, coding_language)
        return {"tasks": tasks}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Dokumentimport fehlgeschlagen: {str(e)}")
    finally:
        os.unlink(tmp_path)


@router.post("/generate")
async def generate_tasks_endpoint(
    req: GenerateRequest,
    _: bool = Depends(require_teacher),
):
    try:
        tasks = await ai_generate_tasks(req.topic, req.count, req.difficulty, req.instructions, req.allowed_types)
        return {"tasks": tasks}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"KI-Generierung fehlgeschlagen: {str(e)}")


@router.post("/generate-webapp")
async def generate_webapp_endpoint(
    req: GenerateWebAppRequest,
    _: bool = Depends(require_teacher),
):
    try:
        app_html = await generate_webapp(req.description, req.grader_info)
        return {"app_html": app_html}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Web-App-Generierung fehlgeschlagen: {str(e)}")


@router.post("/{task_id}/ai-edit")
async def ai_edit_task_endpoint(
    task_id: int,
    req: AiEditRequest,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    cursor = await db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Aufgabe nicht gefunden")

    task = _row_to_task(row)
    try:
        updated = await ai_edit_task(
            task["title"], task["text"], task["hint"], task["points"], req.prompt,
            task_type=task.get("task_type", "essay"),
            question_data=task.get("question_data"),
            solution=task.get("solution", ""),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"KI-Bearbeitung fehlgeschlagen: {str(e)}")

    # If AI changed task to webapp, generate the app_html
    if updated.get("task_type") == "webapp":
        qd = updated.get("question_data", {})
        if not qd.get("app_html"):
            desc = qd.get("app_description", "") or updated.get("text", task["text"])
            grader = qd.get("grader_info", "")
            try:
                app_html = await generate_webapp(desc, grader)
                qd["app_html"] = app_html
                updated["question_data"] = qd
            except Exception:
                # Fallback to essay
                updated["task_type"] = "essay"

    # Apply changes
    qdata_json = json.dumps(updated.get("question_data", task.get("question_data", {})), ensure_ascii=False)
    await db.execute(
        "UPDATE tasks SET title = ?, text = ?, hint = ?, solution = ?, points = ?, task_type = ?, question_data = ? WHERE id = ?",
        (
            updated.get("title", task["title"]),
            updated.get("text", task["text"]),
            updated.get("hint", task["hint"]),
            updated.get("solution", task.get("solution", "")),
            updated.get("points", task["points"]),
            updated.get("task_type", task["task_type"]),
            qdata_json,
            task_id,
        ),
    )
    await db.commit()

    cursor = await db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
    row = await cursor.fetchone()
    return _row_to_task(row)


@router.post("/import-moodle-xml")
async def import_moodle_xml_endpoint(
    file: UploadFile = File(...),
    _: bool = Depends(require_teacher),
):
    """Import tasks from a Moodle XML file."""
    if not file.filename or not file.filename.endswith(".xml"):
        raise HTTPException(status_code=400, detail="Nur .xml-Dateien erlaubt")

    from services.moodle_xml import parse_moodle_xml

    try:
        content = await _check_file_size(file)
        xml_str = content.decode("utf-8", errors="replace")
        tasks = parse_moodle_xml(xml_str)
        return {"tasks": tasks}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"XML-Import fehlgeschlagen: {str(e)}")


@router.get("/export-moodle-xml")
async def export_moodle_xml_endpoint(
    pool_id: Optional[int] = None,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    """Export tasks as Moodle XML, optionally filtered by pool."""
    from services.moodle_xml import export_moodle_xml

    if pool_id is not None:
        cursor = await db.execute(
            "SELECT * FROM tasks WHERE pool_id = ? ORDER BY created_at DESC", (pool_id,)
        )
    else:
        cursor = await db.execute("SELECT * FROM tasks ORDER BY created_at DESC")
    rows = await cursor.fetchall()
    tasks = [_row_to_task(row) for row in rows]
    xml_str = export_moodle_xml(tasks)
    return Response(
        content=xml_str,
        media_type="application/xml",
        headers={"Content-Disposition": "attachment; filename=exam_tasks.xml"},
    )
