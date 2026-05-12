@echo off
setlocal
echo ============================================
echo   ExamPilot - Portable Build erstellen
echo ============================================
echo.

cd /d "%~dp0"
set "ROOT=%~dp0"
set "VENV=%LOCALAPPDATA%\ExamPilot\build-venv"
set "PYTHON_EXE=%VENV%\Scripts\python.exe"
set "ACTIVATE_BAT=%VENV%\Scripts\activate.bat"
set "PYI_WORK=%TEMP%\ExamPilot-pyinstaller-%RANDOM%-%RANDOM%"
set "DISTPATH=%ROOT%dist"
echo %ROOT% | findstr /I "OneDrive" >nul 2>&1
if not errorlevel 1 (
    echo Hinweis: OneDrive-Pfad erkannt. Build-Ausgabe wird lokal abgelegt.
    set "DISTPATH=%LOCALAPPDATA%\ExamPilot\portable-dist-%RANDOM%-%RANDOM%"
)

REM === Check prerequisites ===
python --version >nul 2>&1
if errorlevel 1 (
    echo FEHLER: Python wurde nicht gefunden!
    pause
    exit /b 1
)

REM === Setup or repair venv ===
set "RECREATE_VENV=0"
if not exist "%PYTHON_EXE%" set "RECREATE_VENV=1"
if exist "%ACTIVATE_BAT%" (
    findstr /C:"VIRTUAL_ENV=%VENV%" "%ACTIVATE_BAT%" >nul 2>&1
    if errorlevel 1 set "RECREATE_VENV=1"
)

if "%RECREATE_VENV%"=="1" (
    echo Erstelle virtuelle Umgebung...
    python -m venv --clear "%VENV%"
    if errorlevel 1 (
        echo FEHLER: Virtuelle Umgebung konnte nicht erstellt werden!
        pause
        exit /b 1
    )
)

REM === Install backend dependencies and PyInstaller ===
echo Installiere Python-Abhaengigkeiten...
"%PYTHON_EXE%" -m pip install -r "backend\requirements.txt" >nul 2>&1
if errorlevel 1 (
    echo FEHLER: Python-Abhaengigkeiten konnten nicht installiert werden!
    pause
    exit /b 1
)

echo Installiere PyInstaller...
"%PYTHON_EXE%" -m pip install pyinstaller >nul 2>&1
if errorlevel 1 (
    echo FEHLER: PyInstaller konnte nicht installiert werden!
    pause
    exit /b 1
)

REM === Build frontend ===
echo Baue Frontend...
cd frontend
call npm install
if errorlevel 1 (
    echo FEHLER: npm install fehlgeschlagen!
    cd ..
    pause
    exit /b 1
)
call npm run build
if errorlevel 1 (
    echo FEHLER: Frontend Build fehlgeschlagen!
    cd ..
    pause
    exit /b 1
)
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
"%PYTHON_EXE%" -m PyInstaller --clean --noconfirm --workpath "%PYI_WORK%" --distpath "%DISTPATH%" ExamPilot.spec

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
echo   %DISTPATH%\ExamPilot\
echo.
echo   Diesen Ordner auf einen USB-Stick kopieren
echo   oder als ZIP weitergeben.
echo.
echo   Starten: ExamPilot.exe ausfuehren.
echo   API-Key ueber Einstellungen im Browser eingeben.
echo ============================================
echo.
pause
