@echo off
echo ============================================
echo   ExamPilot - Starte...
echo ============================================
echo.

cd /d "%~dp0"

REM Check if .env exists and has API key
if not exist ".env" (
    echo ANTHROPIC_API_KEY=your-api-key-here> ".env"
    echo SECRET_KEY=change-this-to-a-random-secret-key>> ".env"
    echo.
    echo WICHTIG: Bitte trage deinen Anthropic API-Key
    echo in der Datei .env ein und starte erneut!
    echo.
    pause
    exit /b 1
)

findstr /C:"your-api-key-here" ".env" >nul 2>&1
if not errorlevel 1 (
    echo WICHTIG: Bitte trage deinen Anthropic API-Key
    echo in der Datei .env ein und starte erneut!
    echo.
    echo Oeffne die Datei .env mit einem Texteditor
    echo und ersetze "your-api-key-here" mit deinem Key.
    echo.
    pause
    exit /b 1
)

echo Server startet auf http://localhost:8000
echo Schueler verbinden sich mit: http://DEINE-IP:8000
echo.
echo Zum Beenden dieses Fenster schliessen.
echo.

ExamPilot.exe
pause
