import json
from fastapi import APIRouter, Depends, HTTPException
import aiosqlite

from database import get_db
from models import ExamCreate, ExamUpdate, ExamOut
from routers.auth import require_teacher

router = APIRouter(prefix="/api/exams", tags=["exams"])


@router.get("", response_model=list[ExamOut])
async def list_exams(
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    cursor = await db.execute("SELECT * FROM exams ORDER BY created_at DESC")
    rows = await cursor.fetchall()
    return [dict(row) for row in rows]


@router.post("", response_model=ExamOut)
async def create_exam(
    exam: ExamCreate,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    cursor = await db.execute(
        """INSERT INTO exams (title, description, class_name, date, duration_minutes)
           VALUES (?, ?, ?, ?, ?)""",
        (exam.title, exam.description, exam.class_name, exam.date, exam.duration_minutes),
    )
    await db.commit()
    exam_id = cursor.lastrowid
    cursor = await db.execute("SELECT * FROM exams WHERE id = ?", (exam_id,))
    row = await cursor.fetchone()
    return dict(row)


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

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [exam_id]
    await db.execute(f"UPDATE exams SET {set_clause} WHERE id = ?", values)
    await db.commit()

    cursor = await db.execute("SELECT * FROM exams WHERE id = ?", (exam_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Klassenarbeit nicht gefunden")
    return dict(row)


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
