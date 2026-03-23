"""LTI 1.3 integration endpoints for Moodle and other LMS platforms."""

import json
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse, JSONResponse
import aiosqlite

from database import get_db
from routers.auth import require_teacher
from services.lti_service import (
    get_tool_conf, get_launch_data_storage, get_launch_url,
    generate_keypair, get_public_jwks,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/lti", tags=["lti"])


# ---- OIDC / Launch flow ----

@router.get("/login")
@router.post("/login")
async def lti_login(request: Request):
    """OIDC Login Initiation — Moodle redirects here first."""
    try:
        from pylti1p3.oidc_login import OIDCLogin

        tool_conf = get_tool_conf()
        launch_data_storage = get_launch_data_storage()

        oidc_login = OIDCLogin(request, tool_conf, launch_data_storage=launch_data_storage)
        target_link_uri = get_launch_url(request)
        return RedirectResponse(
            oidc_login.enable_check_cookies(main_msg="Weiterleitung zu Moodle...").redirect(target_link_uri).get_redirect_url(),
            status_code=302,
        )
    except Exception as e:
        logger.error("LTI login failed: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail=f"LTI Login fehlgeschlagen: {e}")


@router.post("/launch")
async def lti_launch(request: Request, db: aiosqlite.Connection = Depends(get_db)):
    """Resource Link Launch — Moodle redirects here with the id_token."""
    try:
        from pylti1p3.message_launch import MessageLaunch

        tool_conf = get_tool_conf()
        launch_data_storage = get_launch_data_storage()

        message_launch = MessageLaunch(request, tool_conf, launch_data_storage=launch_data_storage)
        message_launch.validate()

        launch_data = message_launch.get_launch_data()

        # Extract user info
        lti_user_id = launch_data.get("sub", "")
        lti_user_name = launch_data.get("name", "") or launch_data.get("given_name", "Unknown")
        email = launch_data.get("email", "")

        # Extract custom parameters (exam_id)
        custom = launch_data.get("https://purl.imsglobal.org/spec/lti/claim/custom", {})
        exam_id = custom.get("exam_id")
        if not exam_id:
            # Try from resource_link title or fall back
            raise HTTPException(status_code=400, detail="Kein exam_id in den Custom-Parametern konfiguriert")
        exam_id = int(exam_id)

        # Verify exam exists and is active
        cursor = await db.execute(
            "SELECT id, title, password FROM exams WHERE id = ? AND status = 'active'", (exam_id,)
        )
        exam = await cursor.fetchone()
        if not exam:
            raise HTTPException(status_code=404, detail="Klassenarbeit nicht gefunden oder nicht aktiv")

        # Find or create student by lti_user_id
        cursor = await db.execute(
            "SELECT id FROM students WHERE lti_user_id = ?", (lti_user_id,)
        )
        student_row = await cursor.fetchone()
        if student_row:
            student_id = student_row[0]
            # Update name if changed
            await db.execute("UPDATE students SET name = ? WHERE id = ?", (lti_user_name, student_id))
        else:
            cursor = await db.execute(
                "INSERT INTO students (name, lti_user_id) VALUES (?, ?)",
                (lti_user_name, lti_user_id),
            )
            student_id = cursor.lastrowid

        # Find or create exam session
        cursor = await db.execute(
            "SELECT id FROM exam_sessions WHERE exam_id = ? AND student_id = ?",
            (exam_id, student_id),
        )
        existing = await cursor.fetchone()
        if existing:
            session_id = existing[0]
        else:
            cursor = await db.execute(
                "INSERT INTO exam_sessions (exam_id, student_id) VALUES (?, ?)",
                (exam_id, student_id),
            )
            session_id = cursor.lastrowid

        # Extract AGS claim for grade passback
        ags_claim = launch_data.get("https://purl.imsglobal.org/spec/lti-ags/claim/endpoint", {})
        ags_endpoint = ags_claim.get("lineitems", "")
        ags_lineitem = ags_claim.get("lineitem", "")

        # Find platform
        issuer = launch_data.get("iss", "")
        cursor = await db.execute("SELECT id FROM lti_platforms WHERE issuer = ?", (issuer,))
        platform_row = await cursor.fetchone()
        platform_id = platform_row[0] if platform_row else None

        # Store launch record
        if platform_id:
            resource_link = launch_data.get("https://purl.imsglobal.org/spec/lti/claim/resource_link", {})
            await db.execute(
                """INSERT INTO lti_launches (platform_id, lti_user_id, lti_user_name,
                   resource_link_id, exam_id, session_id, ags_lineitem_url, ags_endpoint)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (platform_id, lti_user_id, lti_user_name,
                 resource_link.get("id", ""), exam_id, session_id,
                 ags_lineitem, ags_endpoint),
            )

        await db.commit()

        # Redirect to the exam
        return RedirectResponse(f"/exam/{session_id}", status_code=302)

    except HTTPException:
        raise
    except Exception as e:
        logger.error("LTI launch failed: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail=f"LTI Launch fehlgeschlagen: {e}")


@router.get("/jwks")
async def lti_jwks(db: aiosqlite.Connection = Depends(get_db)):
    """Serve the tool's public JWKS for platform verification."""
    cursor = await db.execute("SELECT tool_public_key FROM lti_platforms LIMIT 1")
    row = await cursor.fetchone()
    if not row:
        return {"keys": []}
    return get_public_jwks(row[0])


# ---- Platform management (teacher settings) ----

@router.get("/platforms")
async def list_platforms(
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    cursor = await db.execute(
        "SELECT id, issuer, client_id, deployment_id, created_at FROM lti_platforms ORDER BY created_at DESC"
    )
    return [dict(row) for row in await cursor.fetchall()]


@router.post("/platforms")
async def register_platform(
    body: dict,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    """Register a new LMS platform (e.g., Moodle instance)."""
    required = ["issuer", "client_id", "auth_login_url", "auth_token_url", "keyset_url"]
    for field in required:
        if not body.get(field):
            raise HTTPException(status_code=400, detail=f"Feld '{field}' fehlt")

    private_key, public_key = generate_keypair()

    cursor = await db.execute(
        """INSERT INTO lti_platforms (issuer, client_id, deployment_id,
           auth_login_url, auth_token_url, keyset_url, tool_private_key, tool_public_key)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            body["issuer"],
            body["client_id"],
            body.get("deployment_id", "1"),
            body["auth_login_url"],
            body["auth_token_url"],
            body["keyset_url"],
            private_key,
            public_key,
        ),
    )
    await db.commit()

    return {
        "id": cursor.lastrowid,
        "message": "Plattform registriert",
        "tool_config": {
            "launch_url": "/api/lti/launch",
            "login_url": "/api/lti/login",
            "jwks_url": "/api/lti/jwks",
            "redirect_uris": ["/api/lti/launch"],
        },
    }


@router.delete("/platforms/{platform_id}")
async def delete_platform(
    platform_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    await db.execute("DELETE FROM lti_platforms WHERE id = ?", (platform_id,))
    await db.commit()
    return {"message": "Plattform entfernt"}


@router.get("/platforms/{platform_id}/config")
async def get_platform_tool_config(
    platform_id: int,
    request: Request,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    """Returns the configuration info the teacher needs to paste into Moodle."""
    cursor = await db.execute("SELECT * FROM lti_platforms WHERE id = ?", (platform_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Plattform nicht gefunden")

    base_url = str(request.base_url).rstrip("/")

    return {
        "tool_name": "ExamPilot",
        "launch_url": f"{base_url}/api/lti/launch",
        "login_initiation_url": f"{base_url}/api/lti/login",
        "jwks_url": f"{base_url}/api/lti/jwks",
        "redirect_uris": [f"{base_url}/api/lti/launch"],
        "custom_parameters": "exam_id=EXAM_ID_HIER_EINTRAGEN",
        "description": "ExamPilot - KI-gestützte Prüfungsplattform",
    }


# ---- Grade passback ----

@router.post("/grade-passback/{exam_id}")
async def grade_passback(
    exam_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    """Send grades back to the LMS for all LTI-launched sessions of an exam."""
    cursor = await db.execute(
        """SELECT ll.*, es.total_points, es.max_points
           FROM lti_launches ll
           JOIN exam_sessions es ON es.id = ll.session_id
           WHERE ll.exam_id = ? AND ll.ags_lineitem_url IS NOT NULL AND ll.ags_lineitem_url != ''""",
        (exam_id,),
    )
    launches = [dict(row) for row in await cursor.fetchall()]

    if not launches:
        return {"message": "Keine LTI-Sitzungen mit Grade-Passback gefunden", "sent": 0}

    sent = 0
    errors = []
    for launch in launches:
        try:
            from services.lti_service import send_grade
            max_pts = launch["max_points"] or 1
            total = launch["total_points"] or 0
            score = min(1.0, total / max_pts)
            await send_grade(launch, score)
            sent += 1
        except Exception as e:
            errors.append(f"{launch['lti_user_name']}: {e}")

    return {"message": f"{sent} Noten gesendet", "sent": sent, "errors": errors}
