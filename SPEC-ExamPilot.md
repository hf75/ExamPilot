# ExamPilot — Vollständige Projekt-Spezifikation

## Projektübersicht

Entwickle eine Web-Applikation namens **"ExamPilot"** für einen Berufsschullehrer, der Linux (Ubuntu Server) unterrichtet. Das Tool automatisiert die Durchführung und Korrektur von Klassenarbeiten.

**Kernidee:** Schüler arbeiten in einem Terminal-Simulator im Browser und beantworten Linux-Aufgaben. Die Bewertung erfolgt hybrid durch die Claude API — Claude simuliert realistische Terminal-Ausgaben UND bewertet die Antworten semantisch im selben Schritt.

**Sprache der App:** Deutsch (UI, Fehlermeldungen, Hilfetexte)

---

## Architektur

### Tech-Stack

| Komponente | Technologie | Begründung |
|---|---|---|
| Backend | **Python 3.11+ / FastAPI** | Async, WebSocket-Support, schnell |
| Frontend | **React (Vite)** | Terminal-Simulator, reaktive UI |
| Datenbank | **SQLite** | Kein separater DB-Server nötig, eine Datei |
| KI-Bewertung | **Anthropic Claude API** (claude-sonnet-4-20250514) | Semantische Bewertung + Terminal-Simulation |
| DOCX-Parsing | **python-docx** | Import bestehender Klassenarbeiten |
| PDF-Export | **ReportLab** oder **WeasyPrint** | Ergebnis-Export pro Schüler |
| Distribution | **PyInstaller** (optional) | Als .exe packbar für Windows |

### Systemarchitektur

```
┌─────────────────────────────────────────────────┐
│                  Lehrer-PC / Server              │
│                                                  │
│  ┌──────────────┐     ┌───────────────────────┐  │
│  │ FastAPI       │────▶│ SQLite DB             │  │
│  │ Backend       │     │ (exams, students,     │  │
│  │ :8000         │     │  results, tasks)      │  │
│  │               │────▶│                       │  │
│  └──────┬───────┘     └───────────────────────┘  │
│         │                                        │
│         │ API + WebSocket                        │
│         ▼                                        │
│  ┌──────────────┐     ┌───────────────────────┐  │
│  │ React         │     │ Claude API            │  │
│  │ Frontend      │     │ (Bewertung +          │  │
│  │ (static files)│     │  Terminal-Simulation)  │  │
│  └──────────────┘     └───────────────────────┘  │
└─────────────────────────────────────────────────┘
         ▲          ▲          ▲
         │          │          │
    ┌────┴───┐ ┌───┴────┐ ┌──┴───────┐
    │Schüler │ │Schüler │ │Schüler   │
    │Browser │ │Browser │ │Browser   │
    └────────┘ └────────┘ └──────────┘
```

### Netzwerk-Setup

- Backend läuft auf `0.0.0.0:8000` (erreichbar im Schulnetz)
- Schüler öffnen `http://<lehrer-ip>:8000` im Browser
- Kein Internet auf Schüler-PCs nötig (nur LAN-Zugang zum Lehrer-PC)
- Nur der Lehrer-PC braucht Internet (für Claude API)

---

## Datenmodell (SQLite)

### Tabellen

```sql
-- Aufgaben-Pool (wiederverwendbar)
CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,              -- z.B. "Aufgabe 1"
    text TEXT NOT NULL,               -- Aufgabenstellung
    hint TEXT,                        -- Erwartete Lösung / Hinweis für Claude
    topic TEXT,                       -- Themengebiet, z.B. "Dateiumleitung", "Berechtigungen"
    task_type TEXT DEFAULT 'command', -- 'command' | 'explanation' | 'mixed'
    points INTEGER DEFAULT 1,        -- Maximale Punktzahl
    parent_task_id INTEGER,          -- Für Unteraufgaben (z.B. 21A → parent=21)
    source TEXT,                      -- 'docx_import' | 'manual' | 'ai_generated'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_task_id) REFERENCES tasks(id)
);

-- Klassenarbeiten (Zusammenstellung von Aufgaben)
CREATE TABLE exams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,              -- z.B. "Klassenarbeit 1 - Linux"
    description TEXT,
    class_name TEXT,                  -- z.B. "WI25Z1"
    date TEXT,                        -- Prüfungsdatum
    duration_minutes INTEGER,         -- Zeitlimit (optional)
    status TEXT DEFAULT 'draft',      -- 'draft' | 'active' | 'closed'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Zuordnung: Welche Aufgaben gehören zu welcher Klassenarbeit
CREATE TABLE exam_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL,
    task_id INTEGER NOT NULL,
    position INTEGER NOT NULL,        -- Reihenfolge in der Prüfung
    FOREIGN KEY (exam_id) REFERENCES exams(id),
    FOREIGN KEY (task_id) REFERENCES tasks(id)
);

-- Schüler
CREATE TABLE students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    class_name TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Prüfungsteilnahmen
CREATE TABLE exam_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    submitted_at TIMESTAMP,
    status TEXT DEFAULT 'in_progress',  -- 'in_progress' | 'submitted' | 'graded'
    total_points REAL,
    max_points INTEGER,
    FOREIGN KEY (exam_id) REFERENCES exams(id),
    FOREIGN KEY (student_id) REFERENCES students(id)
);

-- Einzelne Antworten
CREATE TABLE answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    task_id INTEGER NOT NULL,
    student_answer TEXT,               -- Was der Schüler eingegeben hat
    simulated_output TEXT,             -- Simulierte Terminal-Ausgabe von Claude
    points_awarded REAL,
    is_correct BOOLEAN,
    feedback TEXT,                      -- Begründung von Claude
    graded_at TIMESTAMP,
    manually_adjusted BOOLEAN DEFAULT FALSE,  -- Lehrer hat manuell korrigiert
    FOREIGN KEY (session_id) REFERENCES exam_sessions(id),
    FOREIGN KEY (task_id) REFERENCES tasks(id)
);
```

---

## Feature-Beschreibung

### 1. Lehrer-Dashboard (geschützt durch Passwort)

#### 1.1 Aufgabenverwaltung

**DOCX-Import:**
- Datei-Upload über Drag & Drop
- Parsing-Logik für das Format des Lehrers (siehe "DOCX-Format" unten)
- Nach Import: Aufgaben in editierbarer Liste anzeigen
- Lehrer kann Punkte, Themengebiet und erwartete Lösung pro Aufgabe ergänzen
- Lehrer kann task_type festlegen (Befehl, Erklärung, gemischt)

**Manuelles Erstellen:**
- Formular: Titel, Aufgabentext, Punkte, Thema, erwartete Lösung, Typ
- Aufgaben werden im Pool gespeichert und sind wiederverwendbar

**KI-Generierung:**
- Lehrer gibt Themengebiet ein (z.B. "Dateiberechtigungen unter Linux")
- Optional: Schwierigkeitsgrad (leicht/mittel/schwer), Anzahl Aufgaben
- Claude API generiert passende Aufgaben im JSON-Format
- Lehrer kann generierte Aufgaben vor dem Speichern bearbeiten

**Aufgaben per Prompt anpassen:**
- Bei jeder Aufgabe gibt es einen "Mit KI bearbeiten"-Button
- Lehrer gibt Anweisung ein, z.B. "Mach die Aufgabe schwieriger" oder "Ändere den Dateipfad zu /var/log"
- Claude passt die Aufgabe an, Lehrer bestätigt

#### 1.2 Klassenarbeit zusammenstellen

- Neue Klassenarbeit erstellen: Titel, Klasse, Datum
- Aufgaben aus Pool per Drag & Drop hinzufügen
- Reihenfolge festlegen
- Punkte pro Aufgabe anpassen (überschreibt Pool-Default)
- Optional: Zeitlimit setzen
- Status: Entwurf → Aktiv (Schüler können beitreten) → Geschlossen

#### 1.3 Live-Übersicht während der Prüfung

- Welche Schüler sind angemeldet
- Fortschritt pro Schüler (wie viele Aufgaben beantwortet)
- WebSocket-basiert für Live-Updates

#### 1.4 Ergebnisse & Auswertung

**Gesamtübersicht:**
- Tabelle: Schüler | Punkte | Prozent | Note
- Notenschlüssel konfigurierbar (IHK-Schlüssel als Default)
- Sortierbar nach Name, Punkte, Note

**Detail pro Schüler:**
- Jede Aufgabe mit: Schüler-Antwort, simulierte Ausgabe, Punkte, Feedback
- Lehrer kann Punkte manuell überschreiben (z.B. Teilpunkte anpassen)
- "Manuell angepasst"-Flag wird gesetzt

**Export:**
- PDF-Export pro Schüler (Aufgabe, Antwort, Bewertung, Feedback)
- DOCX-Export pro Schüler (gleiches Format)
- Gesamtübersicht als PDF/DOCX exportierbar

**Sofort-Ergebnis für Schüler:**
- Nach Abgabe sieht der Schüler sein Ergebnis sofort
- Aufgabe, eigene Antwort, Punkte, Feedback von Claude
- Gesamtpunktzahl und Note

### 2. Schüler-Ansicht

#### 2.1 Anmeldung

- Schüler öffnet URL im Browser
- Wählt aktive Klassenarbeit aus Dropdown
- Gibt seinen Namen ein
- Einfach, kein Passwort nötig (Schulnetz ist vertrauenswürdig)

#### 2.2 Terminal-Simulator

**Aussehen:**
- Schwarzer Hintergrund, grüne/weiße Monospace-Schrift
- Prompt-Zeile: `student@ubuntu:~$ ` (simuliert)
- Aufgabentext wird oberhalb des Terminals angezeigt
- Navigation: Aufgabe vor/zurück, Aufgabenliste als Sidebar

**Verhalten:**
- Schüler tippt Befehl/Antwort ein und drückt Enter
- Request geht ans Backend → Claude API
- Claude liefert: simulierte Terminal-Ausgabe + Bewertung
- Terminal zeigt die simulierte Ausgabe an (wie ein echtes Terminal)
- Bewertung wird im Hintergrund gespeichert (Schüler sieht sie erst nach Abgabe)

**Wichtig für den Terminal-Simulator:**
- Befehls-History (Pfeil hoch/runter)
- Eingabe kann mehrzeilig sein (für Erklärungsaufgaben)
- Bei Erklärungsaufgaben: Textarea statt Terminal-Eingabezeile
- "clear"-Befehl leert das Terminal
- Aufgabe kann übersprungen und später bearbeitet werden
- Antworten werden automatisch gespeichert (kein Datenverlust bei Browserabsturz)

#### 2.3 Abgabe

- "Klassenarbeit abgeben"-Button
- Bestätigungs-Dialog: "Wirklich abgeben? Du kannst danach nichts mehr ändern."
- Nach Abgabe: Sofort-Ergebnis anzeigen (wenn vom Lehrer aktiviert)

### 3. Claude API Integration

#### 3.1 Hybrid-Bewertung (Kernfunktion)

Für jede Schüler-Eingabe wird EIN API-Call gemacht, der beides liefert:

**System-Prompt für die Bewertung:**

```
Du bist ein simuliertes Ubuntu 22.04 LTS Terminal UND gleichzeitig ein Linux-Prüfer.

DEINE DOPPELROLLE:
1. TERMINAL-SIMULATION: Simuliere die Ausgabe des Befehls so realistisch wie möglich.
   - Verwende realistische Dateinamen, Dateigrößen, Zeitstempel
   - Fehlermeldungen müssen exakt dem echten Ubuntu-Format entsprechen
   - Bei ungültigen Befehlen: zeige die echte Fehlermeldung
   - Der simulierte Zustand soll konsistent sein innerhalb einer Prüfung

2. BEWERTUNG: Bewerte ob die Antwort die Aufgabe korrekt löst.
   - Mehrere Lösungswege sind möglich (ls -la = ls -al)
   - Pipes, Umleitungen und Alternativen berücksichtigen
   - Teilpunkte vergeben wenn der Ansatz stimmt
   - Tippfehler die den Befehl brechen = Fehler

Antworte IMMER als JSON:
{
  "terminal_output": "simulierte Ausgabe wie im echten Terminal",
  "points": <0 bis max_points>,
  "correct": true/false,
  "feedback": "Kurze Begründung auf Deutsch (max 2 Sätze)"
}
```

**Für Erklärungsaufgaben (task_type = 'explanation'):**

```
Du bist ein Linux-Prüfer an einer Berufsschule.

Bewerte die folgende Textantwort eines Schülers.
- Fachliche Korrektheit ist am wichtigsten
- Formulierung muss nicht perfekt sein
- Alle relevanten Aspekte der Frage müssen abgedeckt sein

Antworte als JSON:
{
  "terminal_output": "",
  "points": <0 bis max_points>,
  "correct": true/false,
  "feedback": "Begründung mit Hinweis was fehlte oder falsch war"
}
```

#### 3.2 Aufgaben-Generierung

**Prompt-Template:**

```
Generiere {anzahl} Prüfungsaufgaben zum Thema "{thema}" für eine Berufsschulklasse
(Fachinformatiker, Linux Ubuntu Server).

Schwierigkeitsgrad: {schwierigkeit}

Erstelle einen Mix aus:
- Befehlsaufgaben (Schüler muss einen Linux-Befehl schreiben)
- Erklärungsaufgaben (Schüler muss ein Konzept erklären)

Antworte als JSON-Array:
[
  {
    "title": "Aufgabe 1",
    "text": "Aufgabenstellung...",
    "hint": "Erwartete Lösung / Lösungshinweis",
    "topic": "Themengebiet",
    "task_type": "command|explanation|mixed",
    "points": 1-5
  }
]
```

#### 3.3 Aufgaben per Prompt anpassen

```
Hier ist eine bestehende Prüfungsaufgabe:

Titel: {title}
Text: {text}
Erwartete Lösung: {hint}
Punkte: {points}

Anweisung des Lehrers: "{lehrer_prompt}"

Passe die Aufgabe entsprechend an. Antworte als JSON:
{
  "title": "...",
  "text": "...",
  "hint": "...",
  "points": ...
}
```

#### 3.4 API-Konfiguration

- API-Key wird beim ersten Start abgefragt und in einer `.env`-Datei gespeichert
- Modell: `claude-sonnet-4-20250514` (gutes Preis-Leistungs-Verhältnis)
- Max Tokens: 1000 pro Bewertungs-Call
- Rate-Limiting beachten: Requests queuen, nicht parallel feuern

---

## DOCX-Import: Parsing-Spezifikation

### Bekanntes Format (basierend auf Beispiel-Klassenarbeit)

Das DOCX-Format des Lehrers hat folgende Struktur:

**Header-Bereich:**
- Tabellarischer Header mit: Schulname, Fach ("Linux"), Klasse ("WI25Z1"), Datum
- Felder für Name, Punkte, Note (werden ignoriert beim Import)

**Aufgaben:**
- Jede Aufgabe beginnt mit "Aufgabe X" (als eigener Absatz / Überschrift)
- Aufgabentext folgt direkt danach als normaler Absatz
- Manche Aufgaben haben zusätzlichen Kontext (z.B. ls-Ausgaben, Dateiberechtigungen)
- Unteraufgaben sind mit "A.", "B.", "C.", "D." gekennzeichnet
- Antwortbereiche sind durch horizontale Linien (Tabellen/Rahmen) markiert

**Parsing-Algorithmus:**

```python
import docx
import re

def parse_exam_docx(filepath):
    doc = docx.Document(filepath)
    exam_info = {}
    tasks = []
    current_task = None
    current_subtask = None
    context_buffer = []

    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            continue

        # Header-Infos extrahieren (erste Tabelle)
        # ... (Klasse, Datum, Fach aus Header-Tabelle parsen)

        # Neue Hauptaufgabe erkennen
        match_task = re.match(r'^Aufgabe\s+(\d+)', text)
        if match_task:
            if current_task:
                tasks.append(current_task)
            current_task = {
                'number': int(match_task.group(1)),
                'title': text,
                'text': '',
                'subtasks': [],
                'context': '',
                'task_type': 'command',  # Default, kann später angepasst werden
                'points': 1
            }
            current_subtask = None
            context_buffer = []
            continue

        # Unteraufgabe erkennen (A., B., C., D.)
        match_sub = re.match(r'^([A-Z])\.\s+(.+)', text)
        if match_sub and current_task:
            subtask = {
                'letter': match_sub.group(1),
                'text': match_sub.group(2),
                'task_type': 'explanation',  # Unteraufgaben sind meist Erklärungen
                'points': 1
            }
            current_task['subtasks'].append(subtask)
            current_subtask = subtask
            continue

        # Kontext-Block erkennen (z.B. ls-Ausgaben, Berechtigungslisten)
        # Heuristik: Zeilen mit typischen ls -l Mustern oder Gruppenanzeigen
        if current_task and re.match(r'^[d\-][rwx\-]{9}', text):
            context_buffer.append(text)
            continue
        if current_task and re.match(r'^\w+\s*:\s*\w+', text) and 'Aufgabe' not in text:
            context_buffer.append(text)
            continue

        # Normaler Aufgabentext
        if current_task and not current_subtask:
            if context_buffer:
                current_task['context'] = '\n'.join(context_buffer)
                context_buffer = []
            if current_task['text']:
                current_task['text'] += '\n' + text
            else:
                current_task['text'] = text

    if current_task:
        tasks.append(current_task)

    return exam_info, tasks
```

**Wichtig:** Der Parser muss robust sein. Nicht jede Klassenarbeit wird exakt gleich formatiert sein. Nach dem Import soll der Lehrer alle Aufgaben reviewen und anpassen können.

### Nach dem Import

Dem Lehrer wird eine editierbare Liste angezeigt:
- Jede Aufgabe mit: Nummer, Text, erkannter Typ, Punkte (editierbar)
- Feld für "Erwartete Lösung / Hinweis" (leer, muss ergänzt werden)
- Feld für Themengebiet (leer oder automatisch aus Kontext erkannt)
- Checkbox: "Als Erklärungsaufgabe markieren"
- Unteraufgaben werden eingerückt angezeigt
- "Alle speichern"-Button importiert in den Aufgaben-Pool

---

## API-Endpunkte

### Lehrer-API (Authentifiziert)

```
POST   /api/auth/login              # Login mit Passwort
GET    /api/tasks                    # Alle Aufgaben im Pool
POST   /api/tasks                    # Neue Aufgabe erstellen
PUT    /api/tasks/{id}               # Aufgabe bearbeiten
DELETE /api/tasks/{id}               # Aufgabe löschen
POST   /api/tasks/import-docx        # DOCX hochladen & parsen
POST   /api/tasks/generate           # KI-Aufgaben generieren
POST   /api/tasks/{id}/ai-edit       # Aufgabe per Prompt anpassen

GET    /api/exams                    # Alle Klassenarbeiten
POST   /api/exams                    # Neue Klassenarbeit
PUT    /api/exams/{id}               # Bearbeiten (inkl. Status ändern)
DELETE /api/exams/{id}               # Löschen
GET    /api/exams/{id}/tasks         # Aufgaben einer Klassenarbeit
POST   /api/exams/{id}/tasks         # Aufgabe hinzufügen
PUT    /api/exams/{id}/tasks/order   # Reihenfolge ändern
DELETE /api/exams/{id}/tasks/{tid}   # Aufgabe entfernen

GET    /api/exams/{id}/results       # Gesamtübersicht Ergebnisse
GET    /api/exams/{id}/results/{sid} # Ergebnis eines Schülers
PUT    /api/answers/{id}/adjust      # Punkte manuell anpassen
GET    /api/exams/{id}/export/pdf    # PDF-Export Gesamtübersicht
GET    /api/exams/{id}/export/{sid}/pdf   # PDF einzelner Schüler
GET    /api/exams/{id}/export/{sid}/docx  # DOCX einzelner Schüler
```

### Schüler-API

```
GET    /api/student/exams            # Aktive Klassenarbeiten
POST   /api/student/join             # An Klassenarbeit teilnehmen (Name + Exam-ID)
GET    /api/student/session/{id}     # Prüfungs-Session laden
POST   /api/student/answer           # Antwort einreichen (→ Claude API Call)
POST   /api/student/submit/{id}      # Klassenarbeit abgeben
GET    /api/student/results/{id}     # Ergebnis nach Abgabe
```

### WebSocket

```
WS     /ws/exam/{exam_id}           # Live-Updates für Lehrer-Dashboard
                                     # Events: student_joined, answer_submitted,
                                     #         exam_submitted, grading_complete
```

---

## Frontend-Struktur (React)

```
src/
├── App.jsx                    # Router: Lehrer vs. Schüler
├── components/
│   ├── Terminal/
│   │   ├── Terminal.jsx       # Terminal-Simulator Hauptkomponente
│   │   ├── TerminalInput.jsx  # Eingabezeile mit Prompt
│   │   ├── TerminalOutput.jsx # Ausgabe-Bereich
│   │   └── terminal.css       # Styling (Monospace, grün auf schwarz)
│   ├── Teacher/
│   │   ├── Dashboard.jsx      # Hauptübersicht
│   │   ├── TaskPool.jsx       # Aufgabenverwaltung
│   │   ├── TaskEditor.jsx     # Einzelne Aufgabe bearbeiten
│   │   ├── DocxImport.jsx     # Import-Dialog mit Vorschau
│   │   ├── AiGenerator.jsx    # KI-Aufgaben generieren
│   │   ├── ExamBuilder.jsx    # Klassenarbeit zusammenstellen
│   │   ├── LiveMonitor.jsx    # Live-Übersicht während Prüfung
│   │   ├── Results.jsx        # Ergebnisübersicht
│   │   └── StudentResult.jsx  # Detail-Ergebnis eines Schülers
│   ├── Student/
│   │   ├── JoinExam.jsx       # Anmeldebildschirm
│   │   ├── ExamView.jsx       # Prüfungsansicht mit Terminal
│   │   ├── TaskNav.jsx        # Aufgaben-Navigation
│   │   └── ResultView.jsx     # Ergebnis nach Abgabe
│   └── shared/
│       ├── Login.jsx          # Lehrer-Login
│       └── NotFound.jsx
├── hooks/
│   ├── useWebSocket.js        # WebSocket-Hook für Live-Updates
│   └── useExamSession.js      # Session-Management für Schüler
└── api/
    └── client.js              # API-Client (fetch wrapper)
```

---

## Terminal-Simulator: Detailspezifikation

### Aussehen

```css
/* Kern-Styling */
.terminal {
    background: #1a1a2e;
    color: #e0e0e0;
    font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 14px;
    padding: 16px;
    border-radius: 8px;
    height: 400px;
    overflow-y: auto;
}

.terminal-prompt {
    color: #22d18e; /* Grüner Prompt */
}

.terminal-output {
    color: #c8d6e5;
    white-space: pre-wrap;
}

.terminal-error {
    color: #f05e6a;
}
```

### Verhalten

1. **Befehlsaufgaben:**
   - Prompt: `student@ubuntu:~$ `
   - Schüler tippt Befehl, drückt Enter
   - Ladeindikator während Claude-API-Call (simulierter Cursor-Blink)
   - Simulierte Ausgabe erscheint darunter
   - Nächste Prompt-Zeile erscheint
   - Schüler kann weitere Befehle eingeben (nur der letzte wird bewertet, oder der relevanteste)

2. **Erklärungsaufgaben:**
   - Statt Terminal: Textarea mit Platzhalter "Deine Antwort hier eingeben..."
   - Mindesthöhe 4 Zeilen
   - Zeichenzähler

3. **Gemischte Aufgaben (z.B. Aufgabe 21):**
   - Kontext-Block wird als nicht-editierbarer Terminal-Output angezeigt
   - Unteraufgaben (A, B, C, D) als separate Abschnitte mit je eigenem Eingabefeld

### Tastatur-Features

- **Pfeil hoch/runter:** Befehls-History (pro Aufgabe)
- **Tab:** Kein Autocomplete (wäre unfair in der Prüfung)
- **Strg+C:** Eingabe abbrechen / neue Zeile
- **Strg+L oder `clear`:** Terminal leeren

---

## Notenschlüssel (Default: IHK)

```python
IHK_GRADING_SCALE = [
    (92, "1", "sehr gut"),
    (81, "2", "gut"),
    (67, "3", "befriedigend"),
    (50, "4", "ausreichend"),
    (30, "5", "mangelhaft"),
    (0,  "6", "ungenügend"),
]

def calculate_grade(points, max_points, scale=IHK_GRADING_SCALE):
    percent = (points / max_points) * 100
    for threshold, grade, label in scale:
        if percent >= threshold:
            return grade, label, percent
    return "6", "ungenügend", percent
```

Der Notenschlüssel soll im Lehrer-Dashboard konfigurierbar sein.

---

## Sicherheit

- **Lehrer-Dashboard:** Passwort-geschützt (beim ersten Start festlegen, als Hash in DB)
- **Schüler:** Kein Passwort (nur Name), aber Session-Token verhindert Manipulation
- **API-Key:** Wird in `.env` gespeichert, nie ans Frontend geschickt
- **Rate-Limiting:** Max 2 Claude-API-Calls pro Sekunde (Queue im Backend)
- **Keine Schüler-Daten nach außen:** Alles bleibt auf dem Lehrer-PC

---

## Setup & Start

### Für Entwicklung

```bash
# Backend
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install fastapi uvicorn python-docx anthropic reportlab python-multipart
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Frontend
cd frontend
npm install
npm run dev
```

### Für Produktion

```bash
# Frontend bauen
cd frontend && npm run build

# Backend starten (serviert auch Frontend)
cd backend
python main.py
# → Öffnet http://0.0.0.0:8000
# → Schüler verbinden sich mit http://<lehrer-ip>:8000
```

### Als .exe (optional, später)

```bash
pip install pyinstaller
pyinstaller --onefile --add-data "frontend/dist:static" main.py
# → dist/main.exe (alles in einer Datei)
```

---

## Projektstruktur

```
ExamPilot/
├── backend/
│   ├── main.py                # FastAPI App, Startup, Static Files
│   ├── config.py              # Settings, .env laden
│   ├── database.py            # SQLite Setup, Migrations
│   ├── models.py              # Pydantic Models
│   ├── routers/
│   │   ├── auth.py            # Login
│   │   ├── tasks.py           # Aufgabenverwaltung
│   │   ├── exams.py           # Klassenarbeiten
│   │   ├── student.py         # Schüler-Endpunkte
│   │   └── export.py          # PDF/DOCX-Export
│   ├── services/
│   │   ├── claude_service.py  # Claude API Wrapper
│   │   ├── docx_parser.py     # DOCX Import
│   │   ├── grading.py         # Notenschlüssel
│   │   └── export_service.py  # PDF/DOCX Generierung
│   └── .env                   # ANTHROPIC_API_KEY=sk-...
├── frontend/
│   ├── src/                   # React App (siehe oben)
│   ├── package.json
│   └── vite.config.js
├── requirements.txt
├── README.md
└── start.bat                  # Doppelklick-Start für Windows
```

---

## Implementierungs-Reihenfolge (für Claude Code)

### Phase 1: Grundgerüst
1. FastAPI Backend mit SQLite Setup
2. Datenbank-Schema erstellen
3. Basis-React-App mit Routing (Lehrer/Schüler)
4. Lehrer-Login

### Phase 2: Aufgabenverwaltung
5. Aufgaben CRUD (erstellen, bearbeiten, löschen)
6. DOCX-Import mit Parser
7. Claude API Integration für Bewertung
8. Claude API Integration für Aufgaben-Generierung
9. Claude API Integration für Aufgaben per Prompt anpassen

### Phase 3: Prüfungsdurchführung
10. Klassenarbeit zusammenstellen
11. Terminal-Simulator (Frontend)
12. Schüler-Anmeldung und Session-Management
13. Hybrid-Bewertung (Terminal-Simulation + Bewertung)
14. Antworten speichern und Auto-Save

### Phase 4: Ergebnisse
15. Live-Monitor (WebSocket)
16. Ergebnisübersicht für Lehrer
17. Sofort-Ergebnis für Schüler
18. Manuelle Korrektur durch Lehrer
19. PDF/DOCX-Export

### Phase 5: Polish
20. Notenschlüssel konfigurierbar
21. Error-Handling und Edge-Cases
22. start.bat für einfachen Windows-Start
23. README mit Anleitung

---

## Beispiel: Kompletter Flow einer Aufgabe

**Aufgabe 5 aus der Klassenarbeit:**
> Schreiben Sie einen Befehl, der die Anzahl aller .docx Dateien im aktuellen Verzeichnis zählt.

**Schüler tippt:**
```
ls *.docx | wc -l
```

**Claude API Request:**
```json
{
  "task_text": "Schreiben Sie einen Befehl, der die Anzahl aller .docx Dateien im aktuellen Verzeichnis zählt.",
  "task_hint": "ls *.docx | wc -l oder find . -maxdepth 1 -name '*.docx' | wc -l",
  "student_answer": "ls *.docx | wc -l",
  "max_points": 2,
  "task_type": "command"
}
```

**Claude API Response:**
```json
{
  "terminal_output": "3",
  "points": 2,
  "correct": true,
  "feedback": "Korrekt. Der Befehl listet alle .docx-Dateien auf und zählt die Zeilen der Ausgabe."
}
```

**Im Terminal des Schülers:**
```
student@ubuntu:~$ ls *.docx | wc -l
3
student@ubuntu:~$
```

**Alternative korrekte Antwort:** `find . -maxdepth 1 -name "*.docx" | wc -l` → ebenfalls volle Punktzahl, weil Claude den semantischen Inhalt versteht.

---

## Hinweise für die Implementierung

- **python-docx** statt pandoc für den DOCX-Import verwenden (besser für strukturiertes Parsing)
- **Anthropic Python SDK** für API-Calls (`pip install anthropic`)
- **SQLite** mit `aiosqlite` für async-kompatibilität mit FastAPI
- **Frontend-Build** wird als Static Files vom FastAPI-Server ausgeliefert (kein separater Dev-Server in Produktion)
- **WebSocket** für Live-Updates: `fastapi.WebSocket`
- Terminal-Simulator: Kein xterm.js nötig, einfacher Custom-Ansatz reicht (div mit contenteditable input)
- **CORS** im Dev-Modus aktivieren (Frontend auf :5173, Backend auf :8000)
