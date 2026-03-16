"""REST endpoints for Lern-Duelle (Learning Duels)."""

import os
import tempfile
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
import aiosqlite

from database import get_db
from models import DuelCreateRequest
from routers.auth import require_teacher
from services.duel_engine import (
    create_room, create_room_from_tasks, get_room, remove_room,
    cleanup_stale_rooms, DUEL_TASK_TYPES,
)

router = APIRouter(prefix="/api/duels", tags=["duels"])


@router.post("/create")
async def create_duel_room(
    req: DuelCreateRequest,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    cleanup_stale_rooms()

    if req.mode not in ("duel", "royale"):
        raise HTTPException(status_code=400, detail="Modus muss 'duel' oder 'royale' sein")
    if not req.pool_ids:
        raise HTTPException(status_code=400, detail="Mindestens ein Aufgabenpool nötig")

    room = await create_room(req.mode, req.pool_ids, req.total_rounds, req.timer_seconds, db)
    if room is None:
        raise HTTPException(
            status_code=400,
            detail="Keine auto-bewertbaren Aufgaben in den gewählten Pools gefunden",
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

    # Save to temp file
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}")
    try:
        content = await file.read()
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
async def get_room_info(room_code: str):
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
    return {"ip": ip, "port": 8000}


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
