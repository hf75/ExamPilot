@echo off
echo ============================================
echo   ExamPilot - Portable Build erstellen
echo ============================================
echo.

cd /d "%~dp0"

REM === Check prerequisites ===
python --version >nul 2>&1
if errorlevel 1 (
    echo FEHLER: Python wurde nicht gefunden!
    pause
    exit /b 1
)

REM === Setup venv if needed ===
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

REM === Install PyInstaller ===
echo Installiere PyInstaller...
pip install pyinstaller >nul 2>&1

REM === Build frontend ===
echo Baue Frontend...
cd frontend
if not exist "node_modules" (
    call npm install
)
call npm run build
cd ..

REM === Check frontend dist exists ===
if not exist "frontend\dist\index.html" (
    echo FEHLER: Frontend Build fehlgeschlagen!
    pause
    exit /b 1
)

REM === Run PyInstaller ===
echo.
echo Erstelle portable EXE mit PyInstaller...
echo (Das kann ein paar Minuten dauern)
echo.
pyinstaller --clean --noconfirm ExamPilot.spec

if errorlevel 1 (
    echo.
    echo FEHLER: PyInstaller Build fehlgeschlagen!
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Build erfolgreich!
echo.
echo   Der portable Ordner ist:
echo   dist\ExamPilot\
echo.
echo   Diesen Ordner auf einen USB-Stick kopieren
echo   oder als ZIP weitergeben.
echo.
echo   Starten: ExamPilot.exe ausfuehren.
echo   API-Key ueber Einstellungen im Browser eingeben.
echo ============================================
echo.
pause
