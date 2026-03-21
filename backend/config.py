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

SECRET_KEY = _resolve_env("SECRET_KEY", "exam-pilot-secret-key-change-me")
TOKEN_EXPIRE_HOURS = 12
