import bcrypt
import jwt
import datetime
import time
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import aiosqlite

from config import SECRET_KEY, TOKEN_EXPIRE_HOURS, TEACHER_PASSWORD_HASH_KEY, API_KEY_SETTINGS_KEY, get_active_api_key
from database import get_db
from models import LoginRequest, SetupPasswordRequest, TokenResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])
security = HTTPBearer()

# Simple rate limiter: {ip: [timestamps]}
_rate_limits: dict[str, list[float]] = defaultdict(list)
MAX_ATTEMPTS = 10  # per window
RATE_WINDOW = 300  # 5 minutes
_MAX_RATE_IPS = 5000


def _check_rate_limit(request: Request):
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    # Clean old entries for this IP
    _rate_limits[ip] = [t for t in _rate_limits[ip] if now - t < RATE_WINDOW]
    if len(_rate_limits[ip]) >= MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Zu viele Versuche. Bitte 5 Minuten warten.")
    _rate_limits[ip].append(now)
    # Periodic cleanup: remove stale IPs to prevent memory growth
    if len(_rate_limits) > _MAX_RATE_IPS:
        stale = [k for k, v in _rate_limits.items() if not v or now - max(v) > RATE_WINDOW]
        for k in stale:
            del _rate_limits[k]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def create_token() -> str:
    payload = {
        "role": "teacher",
        "exp": datetime.datetime.now(datetime.timezone.utc)
        + datetime.timedelta(hours=TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


def verify_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token abgelaufen")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Ungültiger Token")


async def require_teacher(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    payload = verify_token(credentials.credentials)
    if payload.get("role") != "teacher":
        raise HTTPException(status_code=403, detail="Keine Lehrerrechte")
    return True


@router.get("/status")
async def auth_status(db: aiosqlite.Connection = Depends(get_db)):
    cursor = await db.execute(
        "SELECT value FROM settings WHERE key = ?", (TEACHER_PASSWORD_HASH_KEY,)
    )
    row = await cursor.fetchone()
    return {"password_set": row is not None}


@router.post("/setup")
async def setup_password(
    req: SetupPasswordRequest, db: aiosqlite.Connection = Depends(get_db)
):
    cursor = await db.execute(
        "SELECT value FROM settings WHERE key = ?", (TEACHER_PASSWORD_HASH_KEY,)
    )
    row = await cursor.fetchone()
    if row is not None:
        raise HTTPException(status_code=400, detail="Passwort bereits gesetzt")

    hashed = hash_password(req.password)
    await db.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?)",
        (TEACHER_PASSWORD_HASH_KEY, hashed),
    )
    await db.commit()
    token = create_token()
    return TokenResponse(token=token)


@router.post("/login")
async def login(req: LoginRequest, request: Request, db: aiosqlite.Connection = Depends(get_db)):
    _check_rate_limit(request)
    cursor = await db.execute(
        "SELECT value FROM settings WHERE key = ?", (TEACHER_PASSWORD_HASH_KEY,)
    )
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(
            status_code=400, detail="Kein Passwort gesetzt. Bitte zuerst einrichten."
        )

    if not verify_password(req.password, row[0]):
        raise HTTPException(status_code=401, detail="Falsches Passwort")

    token = create_token()
    return TokenResponse(token=token)


@router.get("/settings")
async def get_settings(
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    """Get all teacher settings (excluding sensitive values)."""
    cursor = await db.execute(
        "SELECT key, value FROM settings WHERE key NOT IN (?, ?)",
        (TEACHER_PASSWORD_HASH_KEY, API_KEY_SETTINGS_KEY),
    )
    rows = await cursor.fetchall()
    result = {row[0]: row[1] for row in rows}

    # Add masked API key info
    active_key = get_active_api_key()
    if active_key:
        result["api_key_masked"] = active_key[:8] + "..." + active_key[-4:]
        result["api_key_set"] = True
    else:
        result["api_key_masked"] = ""
        result["api_key_set"] = False

    # Add tunnel info
    from services.tunnel_service import get_tunnel_url, is_tunnel_enabled, is_cloudflared_installed
    result["tunnel_enabled"] = is_tunnel_enabled()
    result["tunnel_url"] = get_tunnel_url()
    result["tunnel_installed"] = is_cloudflared_installed()
    return result


@router.put("/settings")
async def update_settings(
    body: dict,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    """Update teacher settings (key-value pairs)."""
    for key, value in body.items():
        if key == TEACHER_PASSWORD_HASH_KEY:
            continue  # Never allow password hash to be set via this endpoint
        await db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            (key, str(value)),
        )
    await db.commit()
    return {"message": "Einstellungen gespeichert"}


@router.post("/reset-all")
async def reset_all(
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    """Delete all data except the teacher password. For development use."""
    await db.execute("DELETE FROM answers")
    await db.execute("DELETE FROM exam_sessions")
    await db.execute("DELETE FROM students")
    await db.execute("DELETE FROM exam_tasks")
    await db.execute("DELETE FROM exams")
    await db.execute("DELETE FROM tasks")
    await db.execute("DELETE FROM task_pools")
    # Re-create default pool
    await db.execute("INSERT INTO task_pools (name) VALUES ('Allgemein')")
    await db.commit()
    return {"message": "Alle Daten wurden gelöscht"}
