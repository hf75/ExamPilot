import sys
import warnings
warnings.filterwarnings("ignore", message="Core Pydantic V1 functionality")

import uvicorn
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from config import BUNDLE_DIR
from database import init_db
from routers import auth, tasks, exams, student, results, export, websocket, pools, duel, duel_ws


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="ExamPilot", version="1.0.0", lifespan=lifespan)

# CORS for development (React dev server on :5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router)
app.include_router(tasks.router)
app.include_router(exams.router)
app.include_router(student.router)
app.include_router(results.router)
app.include_router(export.router)
app.include_router(websocket.router)
app.include_router(pools.router)
app.include_router(duel.router)
app.include_router(duel_ws.router)

# Serve frontend static files in production
# In frozen mode: frontend/dist is bundled inside BUNDLE_DIR
# In dev mode: it's at ../frontend/dist relative to backend/
if getattr(sys, "frozen", False):
    frontend_dist = BUNDLE_DIR / "frontend" / "dist"
else:
    frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"

if frontend_dist.exists():
    # Serve static assets (JS, CSS, images)
    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="assets")

    # SPA catch-all: serve index.html for all non-API/non-WS routes
    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        # Never intercept API or WebSocket routes
        if full_path.startswith("api/") or full_path.startswith("ws/"):
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=404, content={"detail": "Not found"})
        # If the path points to an existing file, serve it
        file_path = frontend_dist / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        # index.html must never be cached — it references hashed JS/CSS bundles
        return FileResponse(
            frontend_dist / "index.html",
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
        )


if __name__ == "__main__":
    if getattr(sys, "frozen", False):
        # PyInstaller: run directly, no reload
        uvicorn.run(app, host="0.0.0.0", port=8000)
    else:
        uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
