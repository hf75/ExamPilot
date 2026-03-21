@echo off
echo ============================================
echo   ExamPilot - Starte...
echo ============================================
echo.

cd /d "%~dp0"

REM Check if .env exists, create template if not
if not exist ".env" (
    echo ANTHROPIC_API_KEY=your-api-key-here> ".env"
    echo SECRET_KEY=change-this-to-a-random-secret-key>> ".env"
)

REM Check if API key is configured (either in .env or as system env var)
set "HAS_KEY=0"

REM Check system environment variable
if defined ANTHROPIC_API_KEY (
    echo API-Key gefunden (Umgebungsvariable).
    set "HAS_KEY=1"
)

REM Check .env file for a real key (not placeholder)
if "%HAS_KEY%"=="0" (
    findstr /C:"your-api-key-here" ".env" >nul 2>&1
    if errorlevel 1 (
        REM .env does NOT contain placeholder, so it has a real key
        echo API-Key gefunden (.env Datei).
        set "HAS_KEY=1"
    )
)

if "%HAS_KEY%"=="0" (
    echo WICHTIG: Kein API-Key konfiguriert!
    echo.
    echo Option 1: Umgebungsvariable setzen:
    echo   setx ANTHROPIC_API_KEY "sk-ant-..."
    echo.
    echo Option 2: Key in .env Datei eintragen:
    echo   Oeffne .env mit einem Texteditor und
    echo   ersetze "your-api-key-here" mit deinem Key.
    echo.
    pause
    exit /b 1
)

echo.
echo Server startet auf http://localhost:8000
echo Schueler verbinden sich mit: http://DEINE-IP:8000
echo.
echo Zum Beenden dieses Fenster schliessen.
echo.

ExamPilot.exe
pause
