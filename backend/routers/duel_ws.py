"""WebSocket endpoint for Lern-Duelle."""

import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from services.duel_engine import (
    get_room, add_player, remove_player, start_game,
    submit_answer, advance_round, send_to_host, serialize_lobby,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/duel/{room_code}")
async def duel_websocket(websocket: WebSocket, room_code: str):
    await websocket.accept()

    room = get_room(room_code)
    if not room:
        await websocket.send_text(json.dumps({"event": "error", "data": {"message": "Raum nicht gefunden oder bereits geschlossen"}}))
        await websocket.close(code=4004, reason="Room not found")
        return

    player_id = None
    is_host = False

    try:
        while True:
            raw = await websocket.receive_text()
            if raw == "ping":
                await websocket.send_text(json.dumps({"event": "pong"}))
                continue

            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            action = msg.get("action", "")

            if action == "host_connect":
                is_host = True
                room.host_ws = websocket
                await websocket.send_text(json.dumps({
                    "event": "host_connected",
                    "data": serialize_lobby(room),
                }))

            elif action == "join":
                name = msg.get("name", "").strip()
                if not name:
                    await websocket.send_text(json.dumps({
                        "event": "error", "data": {"message": "Name fehlt"},
                    }))
                    continue
                if room.phase != "lobby":
                    await websocket.send_text(json.dumps({
                        "event": "error", "data": {"message": "Spiel läuft bereits"},
                    }))
                    continue
                player = await add_player(room, name, websocket)
                player_id = player.id

            elif action == "start_game":
                if is_host:
                    await start_game(room)

            elif action == "answer":
                if player_id:
                    answer = str(msg.get("answer", ""))
                    await submit_answer(room, player_id, answer)

            elif action == "next_round":
                if is_host:
                    await advance_round(room)

    except WebSocketDisconnect:
        if is_host:
            room.host_ws = None
        if player_id:
            await remove_player(room, player_id)
    except Exception as e:
        logger.error("Duel WebSocket error in room %s: %s", room_code, e, exc_info=True)
        if is_host:
            room.host_ws = None
        if player_id:
            await remove_player(room, player_id)
