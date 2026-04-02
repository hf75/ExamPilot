"""REST endpoints for Lern-Duelle (Learning Duels)."""

import os
import tempfile
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
import aiosqlite

from database import get_db
from models import DuelCreateRequest
from routers.auth import require_teacher
from services.duel_engine import (
    create_room, create_room_from_tasks, create_room_from_task_ids,
    get_room, remove_room, cleanup_stale_rooms, DUEL_TASK_TYPES,
)

router = APIRouter(prefix="/api/duels", tags=["duels"])


@router.post("/create")
async def create_duel_room(
    req: DuelCreateRequest,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    cleanup_stale_rooms()

    if req.mode not in ("duel", "royale", "1v1"):
        raise HTTPException(status_code=400, detail="Modus muss 'duel' oder 'royale' sein")
    if not req.pool_ids and not req.task_ids:
        raise HTTPException(status_code=400, detail="Mindestens einen Pool oder Aufgaben auswählen")

    if req.task_ids:
        room = await create_room_from_task_ids(req.mode, req.task_ids, req.timer_seconds, db)
    else:
        room = await create_room(req.mode, req.pool_ids, req.total_rounds, req.timer_seconds, db)
    if room is None:
        raise HTTPException(
            status_code=400,
            detail="Keine auto-bewertbaren Aufgaben gefunden",
        )

    return {
        "room_code": room.room_code,
        "mode": room.mode,
        "total_rounds": room.total_rounds,
        "timer_seconds": room.timer_seconds,
        "task_count": len(room.tasks),
    }


@router.post("/create-from-document")
async def create_duel_from_document(
    file: UploadFile = File(...),
    mode: str = Form("duel"),
    total_rounds: int = Form(5),
    timer_seconds: int = Form(20),
    _: bool = Depends(require_teacher),
):
    """Create a duel room with tasks generated on-the-fly from a document."""
    from services.doc_import import import_document

    cleanup_stale_rooms()

    if mode not in ("duel", "royale"):
        raise HTTPException(status_code=400, detail="Modus muss 'duel' oder 'royale' sein")

    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else ""
    if ext not in ("pdf", "docx"):
        raise HTTPException(status_code=400, detail="Nur PDF- und DOCX-Dateien werden unterstützt")

    # Save to temp file (max 20 MB)
    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Datei zu groß. Maximum: 20 MB.")
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}")
    try:
        tmp.write(content)
        tmp.close()

        # Generate tasks — only duel-compatible types
        tasks = await import_document(
            tmp.name, file.filename,
            allowed_types=list(DUEL_TASK_TYPES),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Fehler bei der Aufgabenerstellung: {e}")
    finally:
        os.unlink(tmp.name)

    room = create_room_from_tasks(mode, tasks, total_rounds, timer_seconds)
    if room is None:
        raise HTTPException(
            status_code=400,
            detail="Aus dem Dokument konnten keine Duell-Fragen erzeugt werden (nur Multiple Choice, Wahr/Falsch, Numerisch)",
        )

    return {
        "room_code": room.room_code,
        "mode": room.mode,
        "total_rounds": room.total_rounds,
        "timer_seconds": room.timer_seconds,
        "task_count": len(room.tasks),
    }


@router.get("/room/{room_code}")
async def get_room_info(room_code: str, _: bool = Depends(require_teacher)):
    room = get_room(room_code)
    if not room:
        raise HTTPException(status_code=404, detail="Raum nicht gefunden")
    return {
        "room_code": room.room_code,
        "mode": room.mode,
        "phase": room.phase,
        "player_count": len(room.players),
        "total_rounds": room.total_rounds,
    }


@router.get("/pools-for-duel")
async def get_pools_for_duel(
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    type_placeholders = ",".join("?" * len(DUEL_TASK_TYPES))
    cursor = await db.execute(
        f"""SELECT tp.id, tp.name, COUNT(t.id) as duel_task_count
            FROM task_pools tp
            LEFT JOIN tasks t ON t.pool_id = tp.id AND t.task_type IN ({type_placeholders})
            GROUP BY tp.id
            ORDER BY tp.name""",
        (*DUEL_TASK_TYPES,),
    )
    pools = [dict(row) for row in await cursor.fetchall()]
    return pools


@router.get("/room/{room_code}/preview")
async def preview_duel_questions(
    room_code: str,
    _: bool = Depends(require_teacher),
):
    """Return all questions with correct answers for teacher preview."""
    room = get_room(room_code)
    if not room:
        raise HTTPException(status_code=404, detail="Raum nicht gefunden")

    questions = []
    for task in room.tasks:
        qd = task.get("question_data", {})
        task_type = task.get("task_type", "")

        q = {
            "title": task.get("title", ""),
            "text": task.get("text", ""),
            "task_type": task_type,
            "options": None,
            "correct_indices": [],
            "correct_answer": None,
        }

        if task_type == "multichoice":
            answers = qd.get("answers", [])
            q["options"] = [{"text": a.get("text", ""), "index": i} for i, a in enumerate(answers)]
            q["correct_indices"] = [i for i, a in enumerate(answers) if a.get("fraction", 0) >= 100]
        elif task_type == "truefalse":
            q["options"] = [{"text": "Wahr", "index": "true"}, {"text": "Falsch", "index": "false"}]
            q["correct_answer"] = str(qd.get("correct_answer", True)).lower()
        elif task_type == "numerical":
            best = None
            for ans in qd.get("answers", []):
                if ans.get("fraction", 0) >= 100:
                    best = ans
                    break
            if best:
                q["correct_answer"] = str(best.get("value", ""))
                if best.get("tolerance", 0):
                    q["correct_answer"] += f" (±{best['tolerance']})"

        questions.append(q)

    return {"room_code": room.room_code, "total_rounds": room.total_rounds, "questions": questions}


@router.delete("/room/{room_code}/question/{question_index}")
async def delete_duel_question(
    room_code: str,
    question_index: int,
    _: bool = Depends(require_teacher),
):
    """Remove a question from a prepared duel room."""
    room = get_room(room_code)
    if not room:
        raise HTTPException(status_code=404, detail="Raum nicht gefunden")
    if room.phase != "lobby":
        raise HTTPException(status_code=400, detail="Spiel läuft bereits")
    if question_index < 0 or question_index >= len(room.tasks):
        raise HTTPException(status_code=400, detail="Ungültiger Fragenindex")
    if len(room.tasks) <= 1:
        raise HTTPException(status_code=400, detail="Mindestens eine Frage muss bleiben")

    removed = room.tasks.pop(question_index)
    room.total_rounds = len(room.tasks)
    return {"message": "Frage entfernt", "remaining": len(room.tasks)}


@router.get("/pool-questions/{pool_id}")
async def get_pool_duel_questions(
    pool_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    """Return all duel-compatible questions from a pool with correct answers."""
    import json as _json
    type_placeholders = ",".join("?" * len(DUEL_TASK_TYPES))
    cursor = await db.execute(
        f"""SELECT id, title, text, task_type, question_data
            FROM tasks
            WHERE pool_id = ? AND task_type IN ({type_placeholders})
            ORDER BY id""",
        (pool_id, *DUEL_TASK_TYPES),
    )
    rows = [dict(r) for r in await cursor.fetchall()]

    questions = []
    for task in rows:
        qd = task.get("question_data", "{}")
        if isinstance(qd, str):
            try:
                qd = _json.loads(qd)
            except Exception:
                qd = {}

        q = {
            "task_id": task["id"],
            "title": task.get("title", ""),
            "text": task.get("text", ""),
            "task_type": task["task_type"],
            "options": None,
            "correct_indices": [],
            "correct_answer": None,
        }

        if task["task_type"] == "multichoice":
            answers = qd.get("answers", [])
            q["options"] = [{"text": a.get("text", ""), "index": i} for i, a in enumerate(answers)]
            q["correct_indices"] = [i for i, a in enumerate(answers) if a.get("fraction", 0) >= 100]
        elif task["task_type"] == "truefalse":
            q["options"] = [{"text": "Wahr", "index": "true"}, {"text": "Falsch", "index": "false"}]
            q["correct_answer"] = str(qd.get("correct_answer", True)).lower()
        elif task["task_type"] == "numerical":
            best = next((a for a in qd.get("answers", []) if a.get("fraction", 0) >= 100), None)
            if best:
                q["correct_answer"] = str(best.get("value", ""))
                if best.get("tolerance", 0):
                    q["correct_answer"] += f" (±{best['tolerance']})"

        questions.append(q)

    return questions


@router.get("/server-info")
async def get_server_info():
    """Return LAN IP so the QR code can encode a reachable URL for phones."""
    import socket
    ip = "localhost"
    try:
        # Connect to an external address to determine which NIC is used
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
    except Exception:
        pass
    from services.tunnel_service import get_tunnel_url
    return {"ip": ip, "port": 8000, "tunnel_url": get_tunnel_url()}


@router.delete("/room/{room_code}")
async def close_room(
    room_code: str,
    _: bool = Depends(require_teacher),
):
    room = get_room(room_code)
    if not room:
        raise HTTPException(status_code=404, detail="Raum nicht gefunden")
    remove_room(room_code)
    return {"message": "Raum geschlossen"}
