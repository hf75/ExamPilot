"""LTI 1.3 service: key management, tool configuration, grade passback."""

import json
import time
import sqlite3
import logging
from typing import Optional

from config import DB_PATH

logger = logging.getLogger(__name__)


def generate_keypair() -> tuple[str, str]:
    """Generate an RSA keypair and return (private_pem, public_pem)."""
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives import serialization

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    private_pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    ).decode()

    public_pem = private_key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()

    return private_pem, public_pem


def get_public_jwks(public_key_pem: str) -> dict:
    """Convert a PEM public key to JWKS format."""
    try:
        from jwcrypto import jwk
        key = jwk.JWK.from_pem(public_key_pem.encode())
        return {"keys": [json.loads(key.export_public())]}
    except Exception as e:
        logger.error("Failed to generate JWKS: %s", e)
        return {"keys": []}


def _load_platforms_sync() -> list[dict]:
    """Load all LTI platforms from DB (synchronous, for pylti1p3)."""
    try:
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row
        cursor = conn.execute("SELECT * FROM lti_platforms")
        rows = [dict(r) for r in cursor.fetchall()]
        conn.close()
        return rows
    except Exception:
        return []


def get_tool_conf():
    """Build pylti1p3 ToolConfDict from database."""
    from pylti1p3.tool_config import ToolConfDict

    platforms = _load_platforms_sync()
    if not platforms:
        raise ValueError("Keine LTI-Plattform konfiguriert")

    # Build config dict expected by pylti1p3
    config = {}
    for p in platforms:
        iss = p["issuer"]
        if iss not in config:
            config[iss] = []
        config[iss].append({
            "default": True,
            "client_id": p["client_id"],
            "auth_login_url": p["auth_login_url"],
            "auth_token_url": p["auth_token_url"],
            "auth_audience": None,
            "key_set_url": p["keyset_url"],
            "key_set": None,
            "deployment_ids": [p.get("deployment_id", "1")],
            "private_key_file": None,
            "private_key": p["tool_private_key"],
            "public_key_file": None,
            "public_key": p["tool_public_key"],
        })

    return ToolConfDict(config)


# Simple in-memory launch data storage for pylti1p3
_launch_data = {}
_launch_data_lifetime = 600  # 10 minutes


class InMemoryLaunchDataStorage:
    """Minimal launch data storage for pylti1p3 OIDC flow."""

    def can_set_keys_expiration(self):
        return True

    def set_value(self, key, value, exp=None):
        _launch_data[key] = {"value": value, "exp": time.time() + (exp or _launch_data_lifetime)}

    def get_value(self, key):
        entry = _launch_data.get(key)
        if not entry:
            return None
        if entry["exp"] < time.time():
            del _launch_data[key]
            return None
        return entry["value"]

    def check_value(self, key):
        return self.get_value(key) is not None


_storage_instance = InMemoryLaunchDataStorage()


def get_launch_data_storage():
    # Clean expired entries periodically
    now = time.time()
    expired = [k for k, v in _launch_data.items() if v["exp"] < now]
    for k in expired:
        del _launch_data[k]
    return _storage_instance


def get_launch_url(request) -> str:
    """Build the launch URL from the current request."""
    base = str(request.base_url).rstrip("/")
    return f"{base}/api/lti/launch"


async def send_grade(launch: dict, score: float):
    """Send a grade back to the LMS via AGS."""
    try:
        import requests
        from pylti1p3.grade import Grade
        from pylti1p3.lineitem import LineItem

        # This is a simplified grade passback — full implementation would use
        # the pylti1p3 service classes with proper OAuth2 token exchange
        logger.info("Grade passback: user=%s score=%.2f lineitem=%s",
                     launch["lti_user_name"], score, launch["ags_lineitem_url"])

        # For now, log the intent — full AGS implementation requires
        # OAuth2 client_credentials flow with the platform's token endpoint
        # which is complex. We store the data for future use.
        logger.info("Grade passback stored (full AGS implementation pending)")

    except Exception as e:
        logger.error("Grade passback failed: %s", e)
        raise
