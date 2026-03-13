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

load_dotenv(APP_DIR / ".env")

BASE_DIR = APP_DIR
DB_PATH = APP_DIR / "exam_tool.db"

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = "claude-sonnet-4-6"
CLAUDE_MAX_TOKENS = 1000

TEACHER_PASSWORD_HASH_KEY = "teacher_password_hash"

SECRET_KEY = os.getenv("SECRET_KEY", "exam-pilot-secret-key-change-me")
TOKEN_EXPIRE_HOURS = 12
