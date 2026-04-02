import json
import logging
import os
import tempfile
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from typing import Optional, List
import aiosqlite
from pydantic import BaseModel

logger = logging.getLogger("uvicorn.error")

from database import get_db
from models import ExamCreate, ExamUpdate, ExamOut
from routers.auth import require_teacher
from services.claude_service import feynman_respond, scenario_respond

router = APIRouter(prefix="/api/exams", tags=["exams"])


def _parse_exam_row(row):
    """Convert DB row to dict, parsing grading_scale JSON."""
    d = dict(row)
    gs = d.get("grading_scale")
    if gs and isinstance(gs, str):
        try:
            d["grading_scale"] = json.loads(gs)
        except (json.JSONDecodeError, TypeError):
            d["grading_scale"] = None
    return d


@router.get("", response_model=list[ExamOut])
async def list_exams(
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    cursor = await db.execute("SELECT * FROM exams ORDER BY created_at DESC")
    rows = await cursor.fetchall()
    return [_parse_exam_row(row) for row in rows]


@router.post("", response_model=ExamOut)
async def create_exam(
    exam: ExamCreate,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    grading_scale_json = json.dumps(exam.grading_scale, ensure_ascii=False) if exam.grading_scale else None
    cursor = await db.execute(
        """INSERT INTO exams (title, description, class_name, date, duration_minutes, password, shuffle_tasks, grading_scale)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (exam.title, exam.description, exam.class_name, exam.date, exam.duration_minutes, exam.password or None, exam.shuffle_tasks or False, grading_scale_json),
    )
    await db.commit()
    exam_id = cursor.lastrowid
    cursor = await db.execute("SELECT * FROM exams WHERE id = ?", (exam_id,))
    row = await cursor.fetchone()
    return _parse_exam_row(row)


@router.put("/{exam_id}", response_model=ExamOut)
async def update_exam(
    exam_id: int,
    exam: ExamUpdate,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    updates = {k: v for k, v in exam.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="Keine Änderungen angegeben")

    # Serialize grading_scale to JSON for storage
    if "grading_scale" in updates:
        updates["grading_scale"] = json.dumps(updates["grading_scale"], ensure_ascii=False)

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [exam_id]
    await db.execute(f"UPDATE exams SET {set_clause} WHERE id = ?", values)
    await db.commit()

    cursor = await db.execute("SELECT * FROM exams WHERE id = ?", (exam_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Klassenarbeit nicht gefunden")
    return _parse_exam_row(row)


@router.delete("/{exam_id}")
async def delete_exam(
    exam_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    cursor = await db.execute("SELECT id FROM exams WHERE id = ?", (exam_id,))
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="Klassenarbeit nicht gefunden")

    # Delete related data that has no ON DELETE CASCADE
    session_cursor = await db.execute(
        "SELECT id FROM exam_sessions WHERE exam_id = ?", (exam_id,)
    )
    session_ids = [row[0] for row in await session_cursor.fetchall()]
    if session_ids:
        placeholders = ",".join("?" * len(session_ids))
        await db.execute(
            f"DELETE FROM answers WHERE session_id IN ({placeholders})", session_ids
        )
        await db.execute("DELETE FROM exam_sessions WHERE exam_id = ?", (exam_id,))

    # exam_tasks are deleted via ON DELETE CASCADE
    await db.execute("DELETE FROM exams WHERE id = ?", (exam_id,))
    await db.commit()
    return {"message": "Klassenarbeit gelöscht"}


@router.post("/{exam_id}/duplicate", response_model=ExamOut)
async def duplicate_exam(
    exam_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    cursor = await db.execute("SELECT * FROM exams WHERE id = ?", (exam_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Klassenarbeit nicht gefunden")
    exam = dict(row)

    cursor = await db.execute(
        """INSERT INTO exams (title, description, class_name, duration_minutes, password, shuffle_tasks, grading_scale)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (
            exam["title"] + " (Kopie)",
            exam["description"],
            exam["class_name"],
            exam["duration_minutes"],
            exam["password"],
            exam.get("shuffle_tasks", False),
            exam.get("grading_scale"),
        ),
    )
    new_exam_id = cursor.lastrowid

    # Copy exam_tasks
    cursor = await db.execute(
        "SELECT task_id, position FROM exam_tasks WHERE exam_id = ? ORDER BY position",
        (exam_id,),
    )
    for et_row in await cursor.fetchall():
        await db.execute(
            "INSERT INTO exam_tasks (exam_id, task_id, position) VALUES (?, ?, ?)",
            (new_exam_id, et_row[0], et_row[1]),
        )

    await db.commit()
    cursor = await db.execute("SELECT * FROM exams WHERE id = ?", (new_exam_id,))
    return _parse_exam_row(await cursor.fetchone())


@router.get("/{exam_id}/tasks")
async def get_exam_tasks(
    exam_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    cursor = await db.execute(
        """SELECT t.*, et.position FROM exam_tasks et
           JOIN tasks t ON t.id = et.task_id
           WHERE et.exam_id = ?
           ORDER BY et.position""",
        (exam_id,),
    )
    rows = await cursor.fetchall()
    return [dict(row) for row in rows]


@router.post("/{exam_id}/tasks")
async def add_task_to_exam(
    exam_id: int,
    body: dict,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    # Block changes on active/closed exams
    cursor = await db.execute("SELECT status FROM exams WHERE id = ?", (exam_id,))
    exam_row = await cursor.fetchone()
    if not exam_row:
        raise HTTPException(status_code=404, detail="Klassenarbeit nicht gefunden")
    if exam_row[0] != "draft":
        raise HTTPException(status_code=400, detail="Aufgaben können nur im Entwurfsmodus geändert werden")

    task_id = body.get("task_id")
    if not task_id:
        raise HTTPException(status_code=400, detail="task_id erforderlich")

    cursor = await db.execute(
        "SELECT COALESCE(MAX(position), 0) + 1 FROM exam_tasks WHERE exam_id = ?",
        (exam_id,),
    )
    row = await cursor.fetchone()
    next_pos = row[0]

    await db.execute(
        "INSERT INTO exam_tasks (exam_id, task_id, position) VALUES (?, ?, ?)",
        (exam_id, task_id, next_pos),
    )
    await db.commit()
    return {"message": "Aufgabe hinzugefügt", "position": next_pos}


@router.delete("/{exam_id}/tasks/{task_id}")
async def remove_task_from_exam(
    exam_id: int,
    task_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    # Block changes on active/closed exams
    cursor = await db.execute("SELECT status FROM exams WHERE id = ?", (exam_id,))
    exam_row = await cursor.fetchone()
    if exam_row and exam_row[0] != "draft":
        raise HTTPException(status_code=400, detail="Aufgaben können nur im Entwurfsmodus geändert werden")

    await db.execute(
        "DELETE FROM exam_tasks WHERE exam_id = ? AND task_id = ?",
        (exam_id, task_id),
    )
    await db.commit()
    return {"message": "Aufgabe entfernt"}


@router.get("/{exam_id}/preview")
async def preview_exam(
    exam_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    """Return a fake session-like object for teacher preview. No data is saved."""
    cursor = await db.execute("SELECT * FROM exams WHERE id = ?", (exam_id,))
    exam = await cursor.fetchone()
    if not exam:
        raise HTTPException(status_code=404, detail="Klassenarbeit nicht gefunden")
    exam = dict(exam)

    cursor = await db.execute(
        """SELECT t.*, et.position FROM exam_tasks et
           JOIN tasks t ON t.id = et.task_id
           WHERE et.exam_id = ?
           ORDER BY et.position""",
        (exam_id,),
    )
    rows = await cursor.fetchall()
    tasks = []
    for row in rows:
        t = dict(row)
        qd = t.get("question_data", "{}")
        try:
            t["question_data"] = json.loads(qd) if isinstance(qd, str) else qd
        except (json.JSONDecodeError, TypeError):
            t["question_data"] = {}
        tasks.append(t)

    return {
        "exam_title": exam["title"],
        "student_name": "Vorschau (Lehrer)",
        "status": "in_progress",
        "duration_minutes": exam.get("duration_minutes"),
        "started_at": None,
        "tasks": tasks,
        "answers": [],
    }


class PreviewFeynmanRequest(BaseModel):
    task_id: int
    messages: list[dict]


class PreviewScenarioRequest(BaseModel):
    task_id: int
    transcript: list[dict]
    chosen_option: int | None = None


@router.post("/preview/feynman-chat")
async def preview_feynman_chat(
    req: PreviewFeynmanRequest,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    """Feynman chat for teacher preview — no session required."""
    cursor = await db.execute("SELECT * FROM tasks WHERE id = ?", (req.task_id,))
    task_row = await cursor.fetchone()
    if not task_row:
        raise HTTPException(status_code=404, detail="Aufgabe nicht gefunden")
    task = dict(task_row)

    if task["task_type"] != "feynman":
        raise HTTPException(status_code=400, detail="Keine Feynman-Aufgabe")

    qd = task.get("question_data", "{}")
    try:
        question_data = json.loads(qd) if isinstance(qd, str) else (qd or {})
    except (json.JSONDecodeError, TypeError):
        question_data = {}

    concept = question_data.get("concept", "")
    context = question_data.get("context", "")
    max_turns = question_data.get("max_turns", 10)

    student_messages = [m for m in req.messages if m.get("role") == "student"]
    if len(student_messages) > max_turns:
        raise HTTPException(status_code=400, detail="Maximale Anzahl Nachrichten erreicht")

    is_last_turn = len(student_messages) >= max_turns

    response = await feynman_respond(
        concept=concept,
        context=context,
        task_text=task["text"],
        messages=req.messages,
        is_last_turn=is_last_turn,
    )

    return {"response": response}


@router.post("/preview/scenario-next")
async def preview_scenario_next(
    req: PreviewScenarioRequest,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    """Scenario branching for teacher preview — no session required."""
    cursor = await db.execute("SELECT * FROM tasks WHERE id = ?", (req.task_id,))
    task_row = await cursor.fetchone()
    if not task_row:
        raise HTTPException(status_code=404, detail="Aufgabe nicht gefunden")
    task = dict(task_row)

    if task["task_type"] != "scenario":
        raise HTTPException(status_code=400, detail="Keine Szenario-Aufgabe")

    qd = task.get("question_data", "{}")
    try:
        question_data = json.loads(qd) if isinstance(qd, str) else (qd or {})
    except (json.JSONDecodeError, TypeError):
        question_data = {}

    scenario_description = question_data.get("scenario_description", "")
    context = question_data.get("context", "")
    max_decisions = question_data.get("max_decisions", 5)

    decisions_made = len([e for e in req.transcript if e.get("role") == "decision"])
    if decisions_made > max_decisions:
        raise HTTPException(status_code=400, detail="Maximale Entscheidungen erreicht")

    is_last_decision = decisions_made >= max_decisions

    result = await scenario_respond(
        scenario_description=scenario_description,
        context=context,
        task_text=task["text"],
        transcript=req.transcript,
        is_last_decision=is_last_decision,
    )

    return result


@router.post("/generate-adhoc")
async def generate_adhoc_exam(
    files: List[UploadFile] = File(...),
    title: str = Form(...),
    description: str = Form(""),
    class_name: str = Form(""),
    date: str = Form(""),
    duration_minutes: Optional[str] = Form(None),
    instructions: str = Form(""),
    allowed_types: str = Form(""),
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    """
    Ad-hoc exam creation: Upload documents + provide instructions,
    get a complete exam with AI-generated tasks.
    """
    from services.doc_import import import_document_with_instructions

    # Parse allowed_types from comma-separated string
    types_list = [t.strip() for t in allowed_types.split(",") if t.strip()] if allowed_types.strip() else None

    # Parse duration_minutes (FormData sends empty string for empty fields)
    dur_mins = None
    if duration_minutes and duration_minutes.strip():
        try:
            dur_mins = int(duration_minutes)
        except ValueError:
            pass

    # Validate files
    for f in files:
        ext = (f.filename or "").rsplit(".", 1)[-1].lower() if f.filename and "." in f.filename else ""
        if ext not in ("pdf", "docx"):
            raise HTTPException(status_code=400, detail=f"Nur PDF/DOCX erlaubt: {f.filename}")

    # 1. Create the exam
    cursor = await db.execute(
        """INSERT INTO exams (title, description, class_name, date, duration_minutes)
           VALUES (?, ?, ?, ?, ?)""",
        (title, description, class_name, date, dur_mins),
    )
    exam_id = cursor.lastrowid

    # 2. Process each document and collect tasks
    all_tasks = []
    errors = []

    for f in files:
        ext = (f.filename or "").rsplit(".", 1)[-1].lower()
        suffix = f".{ext}"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await f.read()
            tmp.write(content)
            tmp_path = tmp.name

        try:
            tasks = await import_document_with_instructions(
                tmp_path, f.filename or "document", instructions, types_list
            )
            for task in tasks:
                task["source"] = f.filename
            all_tasks.extend(tasks)
        except Exception as e:
            logger.error("Ad-hoc import failed for %s: %s", f.filename, e, exc_info=True)
            errors.append({"file": f.filename, "error": str(e)})
        finally:
            os.unlink(tmp_path)

    if not all_tasks and errors:
        # Clean up the empty exam
        await db.execute("DELETE FROM exams WHERE id = ?", (exam_id,))
        await db.commit()
        raise HTTPException(
            status_code=500,
            detail=f"Keine Aufgaben erstellt. Fehler: {errors}"
        )

    # 3. Create default pool for adhoc tasks
    cursor = await db.execute("SELECT id FROM task_pools LIMIT 1")
    pool_row = await cursor.fetchone()
    default_pool_id = pool_row[0] if pool_row else None

    # 4. Save tasks and link to exam
    position = 1
    for task in all_tasks:
        if not isinstance(task, dict):
            continue
        qdata_json = json.dumps(task.get("question_data", {}), ensure_ascii=False)
        cursor = await db.execute(
            """INSERT INTO tasks (title, text, hint, solution, topic, task_type, points, source, question_data, pool_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                task.get("title", "Aufgabe"),
                task.get("text", ""),
                task.get("hint", ""),
                task.get("solution", ""),
                task.get("topic", ""),
                task.get("task_type", "essay"),
                task.get("points", 1),
                task.get("source", "Ad-hoc"),
                qdata_json,
                default_pool_id,
            ),
        )
        task_id = cursor.lastrowid
        await db.execute(
            "INSERT INTO exam_tasks (exam_id, task_id, position) VALUES (?, ?, ?)",
            (exam_id, task_id, position),
        )
        position += 1

    await db.commit()

    # Return the created exam
    cursor = await db.execute("SELECT * FROM exams WHERE id = ?", (exam_id,))
    exam = dict(await cursor.fetchone())

    return {
        "exam": exam,
        "task_count": len(all_tasks),
        "errors": errors,
    }
