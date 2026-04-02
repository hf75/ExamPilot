import json
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from routers.auth import verify_token

router = APIRouter()

# Active connections per exam
_connections: dict[int, list[WebSocket]] = {}


async def broadcast(exam_id: int, event: str, data: dict = None):
    """Broadcast event to all connected clients for an exam."""
    if exam_id not in _connections:
        return
    message = json.dumps({"event": event, "data": data or {}})
    disconnected = []
    for ws in _connections[exam_id]:
        try:
            await ws.send_text(message)
        except Exception:
            disconnected.append(ws)
    for ws in disconnected:
        _connections[exam_id].remove(ws)


@router.websocket("/ws/exam/{exam_id}")
async def exam_websocket(websocket: WebSocket, exam_id: int):
    await websocket.accept()

    # First message must be auth token
    try:
        import asyncio as _aio
        raw = await _aio.wait_for(websocket.receive_text(), timeout=10)
        msg = json.loads(raw)
        token = msg.get("token", "")
        payload = verify_token(token)
        if payload.get("role") != "teacher":
            await websocket.send_text(json.dumps({"event": "error", "data": {"message": "Nicht autorisiert"}}))
            await websocket.close(code=4003, reason="Forbidden")
            return
    except Exception:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.send_text(json.dumps({"event": "authenticated"}))

    if exam_id not in _connections:
        _connections[exam_id] = []
    _connections[exam_id].append(websocket)

    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text(json.dumps({"event": "pong"}))
    except WebSocketDisconnect:
        if exam_id in _connections and websocket in _connections[exam_id]:
            _connections[exam_id].remove(websocket)
