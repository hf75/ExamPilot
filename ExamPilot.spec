# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec file for ExamPilot

import os

block_cipher = None

# Paths
backend_dir = os.path.join(os.path.dirname(SPEC), 'backend')
frontend_dist = os.path.join(os.path.dirname(SPEC), 'frontend', 'dist')

a = Analysis(
    [os.path.join(backend_dir, 'main.py')],
    pathex=[backend_dir],
    binaries=[],
    datas=[
        # Bundle the frontend build
        (frontend_dist, os.path.join('frontend', 'dist')),
    ],
    hiddenimports=[
        # uvicorn internals
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'uvicorn.lifespan.off',
        # FastAPI / Starlette
        'multipart',
        'multipart.multipart',
        # aiosqlite
        'aiosqlite',
        # anthropic
        'anthropic',
        # bcrypt
        'bcrypt',
        # App modules
        'config',
        'database',
        'models',
        'routers',
        'routers.auth',
        'routers.tasks',
        'routers.exams',
        'routers.student',
        'routers.results',
        'routers.export',
        'routers.websocket',
        'services',
        'services.claude_service',
        'services.docx_parser',
        'services.export_service',
        'services.grading',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='ExamPilot',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    icon=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='ExamPilot',
)
