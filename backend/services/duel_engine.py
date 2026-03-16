"""In-memory game engine for Lern-Duelle (Learning Duels)."""

import json
import asyncio
import random
import string
import time
import uuid
from dataclasses import dataclass, field
from typing import Optional
from fastapi import WebSocket

from services.auto_grader import grade_auto

# Auto-gradable types suitable for timed quizzes
DUEL_TASK_TYPES = ("multichoice", "truefalse", "numerical")


@dataclass
class Player:
    id: str
    name: str
    ws: Optional[WebSocket] = None
    score: int = 0
    streak: int = 0
    alive: bool = True
    current_answer: Optional[str] = None
    answer_time: Optional[float] = None
    correct_this_round: Optional[bool] = None


@dataclass
class GameRoom:
    room_code: str
    mode: str  # "duel" or "royale"
    phase: str = "lobby"
    host_ws: Optional[WebSocket] = None
    players: dict = field(default_factory=dict)  # id -> Player
    tasks: list = field(default_factory=list)
    current_round: int = 0
    total_rounds: int = 5
    timer_seconds: int = 20
    timer_task: Optional[asyncio.Task] = None
    question_start_time: float = 0.0
    pool_ids: list = field(default_factory=list)
    base_points: int = 100
    created_at: float = field(default_factory=time.time)


_rooms: dict[str, GameRoom] = {}


def generate_room_code() -> str:
    while True:
        code = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
        if code not in _rooms:
            return code


async def create_room(mode: str, pool_ids: list[int], total_rounds: int,
                      timer_seconds: int, db) -> GameRoom:
    code = generate_room_code()
    room = GameRoom(
        room_code=code,
        mode=mode,
        pool_ids=pool_ids,
        total_rounds=max(3, min(20, total_rounds)),
        timer_seconds=max(10, min(60, timer_seconds)),
    )

    # Load tasks from pools
    placeholders = ",".join("?" * len(pool_ids))
    type_placeholders = ",".join("?" * len(DUEL_TASK_TYPES))
    cursor = await db.execute(
        f"""SELECT id, title, text, task_type, question_data, points
            FROM tasks
            WHERE pool_id IN ({placeholders})
            AND task_type IN ({type_placeholders})
            ORDER BY RANDOM()
            LIMIT ?""",
        (*pool_ids, *DUEL_TASK_TYPES, room.total_rounds),
    )
    rows = [dict(r) for r in await cursor.fetchall()]

    if len(rows) < room.total_rounds:
        room.total_rounds = len(rows)
    if len(rows) == 0:
        return None

    for row in rows:
        qd = row.get("question_data")
        if isinstance(qd, str):
            try:
                qd = json.loads(qd)
            except Exception:
                qd = {}
        row["question_data"] = qd or {}
    room.tasks = rows

    _rooms[code] = room
    return room


def create_room_from_tasks(mode: str, tasks: list[dict], total_rounds: int,
                           timer_seconds: int) -> GameRoom | None:
    """Create a room with pre-generated tasks (not from DB)."""
    # Filter to duel-compatible types only
    duel_tasks = [t for t in tasks if t.get("task_type") in DUEL_TASK_TYPES]
    if not duel_tasks:
        return None

    code = generate_room_code()
    clamped_rounds = max(3, min(20, total_rounds))
    room = GameRoom(
        room_code=code,
        mode=mode,
        total_rounds=min(clamped_rounds, len(duel_tasks)),
        timer_seconds=max(10, min(60, timer_seconds)),
    )

    # Shuffle and limit
    random.shuffle(duel_tasks)
    room.tasks = duel_tasks[:room.total_rounds]

    # Ensure question_data is parsed
    for task in room.tasks:
        qd = task.get("question_data")
        if isinstance(qd, str):
            try:
                qd = json.loads(qd)
            except Exception:
                qd = {}
        task["question_data"] = qd or {}

    _rooms[code] = room
    return room


def get_room(room_code: str) -> Optional[GameRoom]:
    return _rooms.get(room_code.upper())


def remove_room(room_code: str):
    _rooms.pop(room_code.upper(), None)


async def _send(ws: WebSocket, event: str, data: dict):
    try:
        await ws.send_text(json.dumps({"event": event, "data": data}))
    except Exception:
        pass


async def broadcast_to_room(room: GameRoom, event: str, data: dict):
    tasks = []
    for p in room.players.values():
        if p.ws:
            tasks.append(_send(p.ws, event, data))
    if room.host_ws:
        tasks.append(_send(room.host_ws, event, data))
    if tasks:
        await asyncio.gather(*tasks)


async def send_to_host(room: GameRoom, event: str, data: dict):
    if room.host_ws:
        await _send(room.host_ws, event, data)


async def send_to_player(player: Player, event: str, data: dict):
    if player.ws:
        await _send(player.ws, event, data)


def serialize_lobby(room: GameRoom) -> dict:
    return {
        "room_code": room.room_code,
        "mode": room.mode,
        "phase": room.phase,
        "total_rounds": room.total_rounds,
        "timer_seconds": room.timer_seconds,
        "players": [{"id": p.id, "name": p.name} for p in room.players.values()],
        "player_count": len(room.players),
    }


async def add_player(room: GameRoom, name: str, ws: WebSocket) -> Player:
    # Check if player with same name already exists (reconnect)
    for p in room.players.values():
        if p.name == name:
            p.ws = ws
            await send_to_player(p, "joined", {
                "player_id": p.id,
                "room": serialize_lobby(room),
                "reconnected": True,
            })
            await broadcast_to_room(room, "player_joined", {
                "id": p.id, "name": p.name,
                "player_count": len(room.players),
            })
            return p

    player = Player(id=uuid.uuid4().hex[:12], name=name, ws=ws)
    room.players[player.id] = player
    await send_to_player(player, "joined", {
        "player_id": player.id,
        "room": serialize_lobby(room),
    })
    await broadcast_to_room(room, "player_joined", {
        "id": player.id, "name": player.name,
        "player_count": len(room.players),
    })
    return player


async def remove_player(room: GameRoom, player_id: str):
    player = room.players.get(player_id)
    if not player:
        return
    player.ws = None
    await broadcast_to_room(room, "player_left", {
        "id": player_id, "name": player.name,
        "player_count": len([p for p in room.players.values() if p.ws]),
    })


def _strip_question(task: dict) -> dict:
    """Strip correct answer info from question data for sending to clients."""
    qd = task.get("question_data", {})
    task_type = task.get("task_type", "")

    result = {
        "text": task.get("text", ""),
        "task_type": task_type,
        "title": task.get("title", ""),
    }

    if task_type == "multichoice":
        answers = qd.get("answers", [])
        result["options"] = [{"text": a.get("text", ""), "index": i}
                             for i, a in enumerate(answers)]
    elif task_type == "truefalse":
        result["options"] = [
            {"text": "Wahr", "index": "true"},
            {"text": "Falsch", "index": "false"},
        ]
    elif task_type == "numerical":
        result["options"] = None  # input field

    return result


def _get_correct_info(task: dict) -> dict:
    """Get correct answer info for REVEAL phase."""
    qd = task.get("question_data", {})
    task_type = task.get("task_type", "")

    if task_type == "multichoice":
        answers = qd.get("answers", [])
        correct_indices = [i for i, a in enumerate(answers) if a.get("fraction", 0) > 0]
        return {"correct_indices": correct_indices, "task_type": task_type}
    elif task_type == "truefalse":
        correct = str(qd.get("correct_answer", "true")).lower()
        return {"correct_answer": correct, "task_type": task_type}
    elif task_type == "numerical":
        return {"correct_answer": qd.get("answer", ""), "task_type": task_type}
    return {}


async def start_game(room: GameRoom):
    if room.phase != "lobby":
        return
    min_players = 2 if room.mode == "duel" else 2
    if len(room.players) < min_players:
        await send_to_host(room, "error", {"message": f"Mindestens {min_players} Spieler nötig"})
        return

    room.phase = "countdown"
    await broadcast_to_room(room, "game_starting", {"countdown": 3})

    await asyncio.sleep(3)
    await _send_question(room)


async def _send_question(room: GameRoom):
    if room.current_round >= room.total_rounds:
        await _end_game(room)
        return

    task = room.tasks[room.current_round]
    room.phase = "question"
    room.question_start_time = time.time()

    # Reset player answers
    for p in room.players.values():
        p.current_answer = None
        p.answer_time = None
        p.correct_this_round = None

    question_data = _strip_question(task)
    await broadcast_to_room(room, "new_question", {
        "round": room.current_round + 1,
        "total_rounds": room.total_rounds,
        "question": question_data,
        "timer_seconds": room.timer_seconds,
    })

    # Start timer
    room.timer_task = asyncio.create_task(_question_timer(room))


async def _question_timer(room: GameRoom):
    await asyncio.sleep(room.timer_seconds)
    if room.phase == "question":
        await _reveal_answers(room)


def calculate_score(correct: bool, answer_time: float, question_start: float,
                    timer_seconds: int, streak: int, base_points: int) -> int:
    if not correct:
        return 0
    elapsed = answer_time - question_start
    speed_ratio = max(0, 1 - elapsed / timer_seconds)
    speed_bonus = base_points * speed_ratio
    streak_mult = 1 + min(streak, 5) * 0.1
    return round((base_points + speed_bonus) * streak_mult)


async def submit_answer(room: GameRoom, player_id: str, answer: str):
    if room.phase != "question":
        return
    player = room.players.get(player_id)
    if not player or player.current_answer is not None:
        return
    if not player.alive:
        return

    player.current_answer = answer
    player.answer_time = time.time()

    # Grade immediately
    task = room.tasks[room.current_round]
    result = grade_auto(
        task["task_type"],
        task["question_data"],
        answer,
        task.get("points", 1),
    )
    player.correct_this_round = result["correct"]

    if result["correct"]:
        player.streak += 1
        points = calculate_score(
            True, player.answer_time, room.question_start_time,
            room.timer_seconds, player.streak, room.base_points,
        )
        player.score += points
    else:
        player.streak = 0
        if room.mode == "royale":
            player.alive = False

    # Notify everyone that someone answered
    alive_players = [p for p in room.players.values() if p.alive and p.ws]
    answered_count = sum(1 for p in alive_players if p.current_answer is not None)
    await broadcast_to_room(room, "player_answered", {
        "player_id": player_id,
        "player_name": player.name,
        "answered_count": answered_count,
        "total_players": len(alive_players),
    })

    # If all alive players answered, skip timer
    if answered_count >= len(alive_players):
        if room.timer_task:
            room.timer_task.cancel()
        await _reveal_answers(room)


async def _reveal_answers(room: GameRoom):
    # Guard against double-call race (timer + early-reveal can fire concurrently)
    if room.phase != "question":
        return
    room.phase = "reveal"
    # Cancel timer if still running to prevent duplicate invocation
    if room.timer_task and not room.timer_task.done():
        room.timer_task.cancel()
        room.timer_task = None

    task = room.tasks[room.current_round]
    correct_info = _get_correct_info(task)

    player_results = []
    eliminations = []
    for p in room.players.values():
        points_earned = 0
        if p.correct_this_round:
            points_earned = calculate_score(
                True, p.answer_time or room.question_start_time + room.timer_seconds,
                room.question_start_time, room.timer_seconds, p.streak, room.base_points,
            )
        elif p.current_answer is not None and room.mode == "royale" and not p.alive:
            eliminations.append({"player_id": p.id, "player_name": p.name})

        player_results.append({
            "id": p.id,
            "name": p.name,
            "answer": p.current_answer,
            "correct": p.correct_this_round or False,
            "points_earned": points_earned,
            "total_score": p.score,
            "streak": p.streak,
            "alive": p.alive,
        })

    await broadcast_to_room(room, "round_results", {
        "correct_info": correct_info,
        "players": player_results,
        "eliminations": eliminations,
        "round": room.current_round + 1,
        "total_rounds": room.total_rounds,
    })

    # Auto-advance after 4 seconds
    await asyncio.sleep(4)
    await _show_scoreboard(room)


async def _show_scoreboard(room: GameRoom):
    room.phase = "scoreboard"
    room.current_round += 1

    rankings = sorted(room.players.values(), key=lambda p: p.score, reverse=True)
    alive_count = sum(1 for p in rankings if p.alive)

    await broadcast_to_room(room, "scoreboard", {
        "rankings": [
            {"id": p.id, "name": p.name, "score": p.score,
             "streak": p.streak, "alive": p.alive}
            for p in rankings
        ],
        "round": room.current_round,
        "total_rounds": room.total_rounds,
        "alive_count": alive_count,
    })

    # Check end conditions
    if room.mode == "royale" and alive_count <= 1:
        await asyncio.sleep(3)
        await _end_game(room)
    elif room.current_round >= room.total_rounds:
        await asyncio.sleep(3)
        await _end_game(room)
    else:
        # Auto-advance to next round after showing scoreboard
        await asyncio.sleep(5)
        if room.phase == "scoreboard":
            room.phase = "countdown"
            await broadcast_to_room(room, "game_starting", {"countdown": 3})
            await asyncio.sleep(3)
            await _send_question(room)


async def _end_game(room: GameRoom):
    room.phase = "game_over"
    rankings = sorted(room.players.values(), key=lambda p: p.score, reverse=True)

    winner = None
    if rankings:
        if room.mode == "royale":
            alive = [p for p in rankings if p.alive]
            winner = alive[0] if alive else rankings[0]
        else:
            winner = rankings[0]

    await broadcast_to_room(room, "game_over", {
        "rankings": [
            {"id": p.id, "name": p.name, "score": p.score,
             "streak": p.streak, "alive": p.alive}
            for p in rankings
        ],
        "winner": {"id": winner.id, "name": winner.name, "score": winner.score} if winner else None,
        "mode": room.mode,
    })


async def advance_round(room: GameRoom):
    """Called by host to advance to next question from scoreboard."""
    if room.phase != "scoreboard":
        return
    await _send_question(room)


def cleanup_stale_rooms():
    cutoff = time.time() - 7200  # 2 hours
    stale = [code for code, room in _rooms.items() if room.created_at < cutoff]
    for code in stale:
        del _rooms[code]
