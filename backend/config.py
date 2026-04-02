import sys
import os
from pathlib import Path
from dotenv import load_dotenv

# When running as PyInstaller bundle, use the exe's directory for data files
if getattr(sys, "frozen", False):
    # Directory where the .exe lives (user-writable, for DB + .env)
    APP_DIR = Path(sys.executable).resolve().parent
    # Directory where bundled resources live (inside _internal)
    BUNDLE_DIR = Path(sys._MEIPASS)
else:
    APP_DIR = Path(__file__).resolve().parent
    BUNDLE_DIR = APP_DIR

# Load .env but don't override existing system environment variables
load_dotenv(APP_DIR / ".env", override=False)

BASE_DIR = APP_DIR
DB_PATH = APP_DIR / "exam_tool.db"

# Placeholder values that indicate the key is not configured
_PLACEHOLDERS = {
    "your-api-key-here",
    "sk-ant-xxxxx",
    "change-this-to-a-random-secret-key",
    "",
}


def _resolve_env(name: str, fallback: str = "") -> str:
    """Get env var, treating placeholder values as unset."""
    value = os.getenv(name, "").strip()
    if value.lower() in {p.lower() for p in _PLACEHOLDERS}:
        return fallback
    return value


ANTHROPIC_API_KEY = _resolve_env("ANTHROPIC_API_KEY")
CLAUDE_MODEL = "claude-sonnet-4-6"
CLAUDE_MAX_TOKENS = 1000

TEACHER_PASSWORD_HASH_KEY = "teacher_password_hash"
API_KEY_SETTINGS_KEY = "anthropic_api_key"


def get_active_api_key() -> str:
    """Return the API key: DB setting takes priority over env variable."""
    import sqlite3
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.execute(
            "SELECT value FROM settings WHERE key = ?", (API_KEY_SETTINGS_KEY,)
        )
        row = cursor.fetchone()
        conn.close()
        if row and row[0] and row[0].strip():
            return row[0].strip()
    except Exception:
        pass
    return ANTHROPIC_API_KEY

def _get_or_create_secret_key() -> str:
    """Return SECRET_KEY from env, or auto-generate and persist one."""
    key = _resolve_env("SECRET_KEY")
    if key:
        return key
    # Auto-generate a secure key and persist it to .env
    import secrets
    key = secrets.token_urlsafe(32)
    env_path = APP_DIR / ".env"
    try:
        if env_path.exists():
            content = env_path.read_text(encoding="utf-8")
            if "SECRET_KEY" not in content:
                with open(env_path, "a", encoding="utf-8") as f:
                    f.write(f"\nSECRET_KEY={key}\n")
        else:
            env_path.write_text(f"SECRET_KEY={key}\n", encoding="utf-8")
    except OSError:
        pass  # Use in-memory key if file write fails
    return key


SECRET_KEY = _get_or_create_secret_key()
TOKEN_EXPIRE_HOURS = 12
