"""
Cloudflare Tunnel service for HTTPS access without admin rights.
Downloads cloudflared on first use, starts a Quick Tunnel as subprocess.
"""

import asyncio
import logging
import os
import platform
import re
import sqlite3
import subprocess
import sys
import urllib.request
from pathlib import Path

from config import APP_DIR, DB_PATH

logger = logging.getLogger("uvicorn.error")

SETTINGS_KEY = "tunnel_enabled"
CLOUDFLARED_DIR = APP_DIR / "cloudflared"

# Download URLs per platform
_DOWNLOAD_URLS = {
    ("Windows", "AMD64"): "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe",
    ("Windows", "x86_64"): "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe",
    ("Linux", "x86_64"): "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64",
    ("Darwin", "x86_64"): "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz",
    ("Darwin", "arm64"): "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz",
}

_process: subprocess.Popen | None = None
_tunnel_url: str | None = None


def _get_binary_path() -> Path:
    if platform.system() == "Windows":
        return CLOUDFLARED_DIR / "cloudflared.exe"
    return CLOUDFLARED_DIR / "cloudflared"


def _get_download_url() -> str | None:
    key = (platform.system(), platform.machine())
    return _DOWNLOAD_URLS.get(key)


def is_tunnel_enabled() -> bool:
    """Check the DB setting for tunnel_enabled."""
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.execute("SELECT value FROM settings WHERE key = ?", (SETTINGS_KEY,))
        row = cursor.fetchone()
        conn.close()
        return row is not None and row[0].lower() in ("true", "1", "yes")
    except Exception:
        return False


def get_tunnel_url() -> str | None:
    """Return the current tunnel URL, or None if not running."""
    return _tunnel_url


def is_cloudflared_installed() -> bool:
    return _get_binary_path().exists()


def _download_cloudflared() -> bool:
    """Download cloudflared binary. Returns True on success."""
    url = _get_download_url()
    if not url:
        logger.error("Tunnel: Keine Download-URL für %s/%s", platform.system(), platform.machine())
        return False

    binary_path = _get_binary_path()
    CLOUDFLARED_DIR.mkdir(parents=True, exist_ok=True)

    logger.info("Tunnel: Lade cloudflared herunter von %s ...", url)
    try:
        urllib.request.urlretrieve(url, str(binary_path))
        # Make executable on Unix
        if platform.system() != "Windows":
            os.chmod(str(binary_path), 0o755)
        logger.info("Tunnel: cloudflared heruntergeladen nach %s", binary_path)
        return True
    except Exception as e:
        logger.error("Tunnel: Download fehlgeschlagen: %s", e)
        return False


async def start_tunnel(port: int = 8000) -> str | None:
    """Start a Cloudflare Quick Tunnel. Returns the public URL or None."""
    global _process, _tunnel_url

    if _process is not None:
        logger.warning("Tunnel: Bereits gestartet (%s)", _tunnel_url)
        return _tunnel_url

    binary = _get_binary_path()
    if not binary.exists():
        logger.info("Tunnel: cloudflared nicht gefunden, starte Download...")
        success = await asyncio.to_thread(_download_cloudflared)
        if not success:
            return None

    cmd = [str(binary), "tunnel", "--url", f"http://localhost:{port}"]
    logger.info("Tunnel: Starte %s", " ".join(cmd))

    try:
        _process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
    except Exception as e:
        logger.error("Tunnel: Konnte cloudflared nicht starten: %s", e)
        _process = None
        return None

    # Read stderr in background to find the URL (cloudflared logs to stderr)
    url_future = asyncio.get_event_loop().create_future()

    async def _read_stderr():
        loop = asyncio.get_event_loop()
        while _process and _process.poll() is None:
            line = await loop.run_in_executor(None, _process.stderr.readline)
            if not line:
                break
            line = line.strip()
            if line:
                logger.info("Tunnel: %s", line)
            match = re.search(r"https://[a-z0-9\-]+\.trycloudflare\.com", line)
            if match and not url_future.done():
                url_future.set_result(match.group(0))

        # If process exited without URL
        if not url_future.done():
            url_future.set_result(None)

    asyncio.create_task(_read_stderr())

    # Wait up to 30 seconds for the URL
    try:
        _tunnel_url = await asyncio.wait_for(url_future, timeout=30)
    except asyncio.TimeoutError:
        logger.error("Tunnel: Timeout - keine URL nach 30 Sekunden erhalten")
        stop_tunnel()
        return None

    if _tunnel_url:
        logger.info("Tunnel: Aktiv unter %s", _tunnel_url)
    else:
        logger.error("Tunnel: cloudflared beendet ohne URL")
        stop_tunnel()

    return _tunnel_url


def stop_tunnel():
    """Stop the tunnel process."""
    global _process, _tunnel_url
    if _process:
        try:
            _process.terminate()
            _process.wait(timeout=5)
        except Exception:
            try:
                _process.kill()
            except Exception:
                pass
        _process = None
    _tunnel_url = None
    logger.info("Tunnel: Gestoppt")
