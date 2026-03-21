#!/bin/bash
echo "============================================"
echo "  ExamPilot - Starte..."
echo "============================================"
echo ""

# Navigate to script directory
cd "$(dirname "$0")"

# Check if Python is available (try python3 first, then python)
PYTHON=""
if command -v python3 &>/dev/null; then
    PYTHON="python3"
elif command -v python &>/dev/null; then
    PYTHON="python"
else
    echo "FEHLER: Python wurde nicht gefunden!"
    echo "Bitte Python 3.11+ installieren:"
    echo "  macOS: brew install python"
    echo "  Linux: sudo apt install python3 python3-venv python3-pip"
    exit 1
fi

echo "Verwende: $PYTHON ($($PYTHON --version))"

# Check if venv exists, if not create it
if [ ! -d "backend/venv" ]; then
    echo "Erstelle virtuelle Umgebung..."
    cd backend
    $PYTHON -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    cd ..
else
    source backend/venv/bin/activate
fi

# Check if .env exists, create template if not
if [ ! -f "backend/.env" ]; then
    echo "ANTHROPIC_API_KEY=your-api-key-here" > backend/.env
    echo "SECRET_KEY=change-this-to-a-random-secret-key" >> backend/.env
fi

# Check if API key is configured (env var or .env)
HAS_KEY=0
if [ -n "$ANTHROPIC_API_KEY" ]; then
    HAS_KEY=1
fi
if [ "$HAS_KEY" = "0" ] && ! grep -q "your-api-key-here" backend/.env 2>/dev/null; then
    HAS_KEY=1
fi
if [ "$HAS_KEY" = "0" ]; then
    echo ""
    echo "WICHTIG: Kein API-Key konfiguriert!"
    echo "Option 1: export ANTHROPIC_API_KEY=\"sk-ant-...\""
    echo "Option 2: Key in backend/.env eintragen"
    echo ""
fi

# Check if npm/node is available
if ! command -v npm &>/dev/null; then
    echo "WARNUNG: npm wurde nicht gefunden!"
    echo "  macOS: brew install node"
    echo "  Linux: sudo apt install nodejs npm"
    if [ ! -d "frontend/dist" ]; then
        echo "FEHLER: Frontend ist nicht gebaut und npm fehlt. Bitte Node.js installieren."
        exit 1
    fi
fi

# Build frontend if dist doesn't exist
if [ ! -d "frontend/dist" ]; then
    echo "Baue Frontend..."
    cd frontend
    npm install
    npm run build
    cd ..
fi

echo ""
echo "============================================"
echo "  Server startet auf http://localhost:8000"
echo "  Schueler verbinden sich mit:"
echo "  http://DEINE-IP:8000"
echo "============================================"
echo ""

cd backend
$PYTHON main.py
