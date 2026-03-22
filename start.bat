@echo off
echo ============================================
echo   ExamPilot - Starte...
echo ============================================
echo.

cd /d "%~dp0"

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo FEHLER: Python wurde nicht gefunden!
    echo Bitte Python 3.11+ installieren: https://www.python.org/downloads/
    pause
    exit /b 1
)

REM Check if venv exists, if not create it
if not exist "backend\venv" (
    echo Erstelle virtuelle Umgebung...
    cd backend
    python -m venv venv
    call venv\Scripts\activate.bat
    pip install -r requirements.txt
    cd ..
) else (
    call backend\venv\Scripts\activate.bat
)

REM Check if .env exists, create template if not
if not exist "backend\.env" (
    echo ANTHROPIC_API_KEY=your-api-key-here> backend\.env
    echo SECRET_KEY=change-this-to-a-random-secret-key>> backend\.env
)

REM Check if API key is configured (env var or .env)
set "HAS_KEY=0"
if defined ANTHROPIC_API_KEY (
    set "HAS_KEY=1"
)
if "%HAS_KEY%"=="0" (
    findstr /C:"your-api-key-here" "backend\.env" >nul 2>&1
    if errorlevel 1 set "HAS_KEY=1"
)
if "%HAS_KEY%"=="0" (
    echo.
    echo WICHTIG: Kein API-Key konfiguriert!
    echo Option 1: setx ANTHROPIC_API_KEY "sk-ant-..."
    echo Option 2: Key in backend\.env eintragen
    echo.
)

REM Build frontend if dist doesn't exist
if not exist "frontend\dist" (
    echo Baue Frontend...
    cd frontend
    call npm install
    call npm run build
    cd ..
)

echo.

cd backend
python main.py
pause
