# Mitwirken bei ExamPilot

Vielen Dank für dein Interesse an ExamPilot! Hier findest du alles, um loszulegen.

## Entwicklungsumgebung einrichten

### Voraussetzungen
- Python 3.11+
- Node.js 18+
- Git

### Setup

```bash
git clone https://github.com/YOUR_USERNAME/ExamPilot.git
cd ExamPilot

# Backend
cd backend
python -m venv venv
source venv/bin/activate  # Linux/macOS
# venv\Scripts\activate   # Windows
pip install -r requirements.txt
cd ..

# Frontend
cd frontend
npm install
cd ..

# API-Key (optional, für KI-Features)
cp .env.example backend/.env
# backend/.env bearbeiten
```

### Entwicklung starten

```bash
# Terminal 1: Backend (mit Auto-Reload)
cd backend
python main.py

# Terminal 2: Frontend (Vite Dev Server)
cd frontend
npm run dev
```

- Backend: http://localhost:8000
- Frontend Dev: http://localhost:5173 (Proxy zum Backend)

### Produktion testen

```bash
cd frontend && npm run build && cd ..
cd backend && python main.py
# Alles auf http://localhost:8000
```

## Projektstruktur

```
backend/
├── routers/        # API-Endpunkte (ein Router pro Feature)
├── services/       # Business-Logik (KI, Bewertung, Import)
├── main.py         # FastAPI App
├── config.py       # Konfiguration
├── database.py     # SQLite Schema + Migrationen
└── models.py       # Pydantic Request/Response Models

frontend/src/
├── components/
│   ├── Questions/  # Ein Component pro Aufgabentyp
│   ├── Teacher/    # Lehrer-Dashboard
│   ├── Student/    # Schüler-Interface
│   ├── Duel/       # Lern-Duell
│   └── shared/     # Login etc.
├── api/client.js   # API-Client mit Auth
├── App.jsx         # Router
└── index.css       # Alle Styles (eine Datei)
```

## Konventionen

### Code-Stil
- **Python**: PEP 8, async/await für I/O
- **JavaScript**: React Hooks, funktionale Komponenten
- **CSS**: Eine Datei (`index.css`), CSS-Variablen für Theming

### Neuen Aufgabentyp hinzufügen

1. `backend/models.py` — Typ zu `VALID_TASK_TYPES` hinzufügen
2. `backend/services/auto_grader.py` — Auto-Grading wenn möglich
3. `backend/services/claude_service.py` — KI-Bewertung + Generierung
4. `backend/services/doc_import.py` — Dokument-Import-Beschreibung
5. `backend/routers/student.py` — Grading-Dispatch
6. `frontend/src/components/Questions/MeinTyp.jsx` — Schüler-Komponente
7. `frontend/src/components/Questions/QuestionRenderer.jsx` — Import + registrieren
8. `frontend/src/components/Teacher/TaskEditor.jsx` — TASK_TYPES + Config-Komponente
9. `frontend/src/components/Teacher/TaskPool.jsx` — TASK_TYPES + GENERATABLE_TYPES
10. `frontend/src/components/Teacher/ExamBuilder.jsx` — GENERATABLE_TYPES + TYPE_LABELS
11. `frontend/src/components/Teacher/Results.jsx` — TASK_TYPES
12. `frontend/src/components/Student/ExamView.jsx` — Split-Layout wenn nötig

### Commits
- Deutsch oder Englisch, konsistente Sprache pro Commit
- Kurze, beschreibende Commit-Messages
- Ein Feature pro Commit

## Pull Requests

1. Erstelle ein **Issue** bevor du anfängst (zur Abstimmung)
2. Erstelle einen **Feature-Branch** von `main`
3. Halte PRs fokussiert — ein Feature/Bugfix pro PR
4. Teste manuell (es gibt noch keine automatisierten Tests)
5. Beschreibe im PR was sich ändert und warum

## Bekannte Einschränkungen

- Keine automatisierten Tests (Beiträge willkommen!)
- Einzelner Lehrer-Account (Multi-Tenant geplant)
- Nur Deutsch (i18n geplant)
- Frontend-Bundle > 500KB (Code-Splitting geplant)
