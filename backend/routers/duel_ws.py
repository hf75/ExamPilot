"""WebSocket endpoint for Lern-Duelle."""

import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from services.duel_engine import (
    get_room, add_player, remove_player, start_game,
    submit_answer, advance_round, send_to_host, serialize_lobby,
    select_pair, random_pair, end_game_early,
)

logger = logging.getLogger("uvicorn.error")

router = APIRouter()


@router.websocket("/ws/duel/{room_code}")
async def duel_websocket(websocket: WebSocket, room_code: str):
    client = websocket.client
    client_info = f"{client.host}:{client.port}" if client else "unknown"
    logger.info("Duel WS connect attempt: room=%s client=%s", room_code, client_info)

    await websocket.accept()
    logger.info("Duel WS accepted: room=%s client=%s", room_code, client_info)

    room = get_room(room_code)
    if not room:
        logger.warning("Duel WS room not found: %s (client=%s)", room_code, client_info)
        await websocket.send_text(json.dumps({"event": "error", "data": {"message": "Raum nicht gefunden oder bereits geschlossen"}}))
        await websocket.close(code=4004, reason="Room not found")
        return

    logger.info("Duel WS room found: %s phase=%s players=%d (client=%s)",
                room_code, room.phase, len(room.players), client_info)

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
                logger.warning("Duel WS bad JSON from %s: %s", client_info, raw[:100])
                continue

            action = msg.get("action", "")
            logger.info("Duel WS action=%s room=%s client=%s player_id=%s",
                        action, room_code, client_info, player_id)

            if action == "host_connect":
                is_host = True
                room.host_ws = websocket
                await websocket.send_text(json.dumps({
                    "event": "host_connected",
                    "data": serialize_lobby(room),
                }))
                logger.info("Duel WS host connected: room=%s", room_code)

            elif action == "join":
                name = msg.get("name", "").strip()
                if not name:
                    logger.warning("Duel WS join with empty name: room=%s", room_code)
                    await websocket.send_text(json.dumps({
                        "event": "error", "data": {"message": "Name fehlt"},
                    }))
                    continue
                if room.phase != "lobby":
                    logger.warning("Duel WS join rejected, phase=%s: room=%s name=%s",
                                   room.phase, room_code, name)
                    await websocket.send_text(json.dumps({
                        "event": "error", "data": {"message": "Spiel läuft bereits"},
                    }))
                    continue
                logger.info("Duel WS adding player: room=%s name=%s", room_code, name)
                player = await add_player(room, name, websocket)
                player_id = player.id
                logger.info("Duel WS player joined: room=%s name=%s id=%s", room_code, name, player_id)

            elif action == "start_game":
                if is_host:
                    logger.info("Duel WS start_game: room=%s", room_code)
                    await start_game(room)

            elif action == "answer":
                if player_id:
                    answer = str(msg.get("answer", ""))
                    logger.info("Duel WS answer: room=%s player=%s", room_code, player_id)
                    await submit_answer(room, player_id, answer)

            elif action == "select_pair":
                if is_host:
                    p1 = msg.get("player1_id", "")
                    p2 = msg.get("player2_id", "")
                    await select_pair(room, p1, p2)

            elif action == "random_pair":
                if is_host:
                    await random_pair(room)

            elif action == "end_game":
                if is_host:
                    await end_game_early(room)

            elif action == "next_round":
                if is_host:
                    await advance_round(room)

    except WebSocketDisconnect:
        logger.info("Duel WS disconnect: room=%s client=%s player_id=%s is_host=%s",
                     room_code, client_info, player_id, is_host)
        if is_host:
            room.host_ws = None
        if player_id:
            await remove_player(room, player_id)
    except Exception as e:
        logger.error("Duel WS error in room %s client=%s: %s", room_code, client_info, e, exc_info=True)
        if is_host:
            room.host_ws = None
        if player_id:
            await remove_player(room, player_id)
