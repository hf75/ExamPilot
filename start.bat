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

REM Check if .env exists
if not exist "backend\.env" (
    echo.
    echo WICHTIG: Bitte trage deinen Anthropic API-Key in backend\.env ein!
    echo Erstelle .env Datei...
    echo ANTHROPIC_API_KEY=your-api-key-here> backend\.env
    echo SECRET_KEY=change-this-to-a-random-secret-key>> backend\.env
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
echo ============================================
echo   Server startet auf http://localhost:8000
echo   Schueler verbinden sich mit:
echo   http://DEINE-IP:8000
echo ============================================
echo.

cd backend
python main.py
pause
