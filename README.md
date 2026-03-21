# ExamPilot

**KI-gestützte Prüfungsplattform für Berufsschulen**

ExamPilot ist eine Open-Source-Webanwendung für digitale Prüfungen, interaktive Lern-Duelle und KI-basierte Bewertung. Entwickelt für den Schulalltag an Berufsschulen — aber geeignet für jede Bildungseinrichtung.

---

## Highlights

- **16 Aufgabentypen** — von Multiple Choice bis Programmierung, Foto-Aufgaben und interaktive Szenarien
- **KI-Bewertung** — Claude bewertet Freitext, Code, Zeichnungen und Fotos automatisch
- **Lern-Duelle** — Echtzeit-Multiplayer-Quiz mit Leaderboard (Kahoot-Alternative mit KI)
- **Personalisiertes Lernmaterial** — Nach der Prüfung generiert die KI individuelles Übungsmaterial
- **Mermaid-Diagramme** — ER-Diagramme, Flowcharts, UML direkt im Aufgabentext
- **In-Browser Code-Ausführung** — JavaScript, Python, SQL, TypeScript, Blockly ohne Server
- **Zero Infrastructure** — SQLite-Datenbank, kein externer Server nötig
- **Portable** — Als EXE auf USB-Stick verteilen (PyInstaller)

---

## Aufgabentypen

| Typ | Bewertung | Beschreibung |
|-----|-----------|-------------|
| Multiple Choice | Auto | Einfach-/Mehrfachauswahl mit Teilpunkten |
| Wahr/Falsch | Auto | Boolean mit Feedback |
| Kurzantwort | KI | Freitext, semantisch bewertet |
| Numerisch | Auto | Zahlenwert mit Toleranz |
| Zuordnung | Auto | Paare verbinden |
| Reihenfolge | Auto | Sequenz sortieren |
| Lückentext | Auto | Fill-in-the-blank (Text/MC/Numerisch) |
| Freitext/Essay | KI | Längere Texte, KI-bewertet |
| Zeichnung | KI (Vision) | Canvas-basiert, Claude Vision bewertet |
| Web-App | KI | Interaktive iFrame-Aufgaben |
| Feynman-Erklärung | KI | Schüler erklärt Konzept im Chat-Dialog |
| Branching-Szenario | KI | Interaktive Entscheidungssimulation |
| Programmierung | Auto/KI | JS, Python, SQL, HTML, TypeScript, Blockly |
| Foto-Aufgabe | KI (Vision) | Kamera-Foto, Claude Vision bewertet |
| Beschreibung | — | Nur Infotext, keine Antwort |

---

## Schnellstart

### Voraussetzungen

- Python 3.11+
- Node.js 18+
- [Anthropic API-Key](https://console.anthropic.com/)

### Installation

```bash
# Repository klonen
git clone https://github.com/YOUR_USERNAME/ExamPilot.git
cd ExamPilot

# API-Key konfigurieren (Option A: Umgebungsvariable)
export ANTHROPIC_API_KEY="sk-ant-..."

# ODER Option B: .env-Datei im backend/ Ordner bearbeiten
cp .env.example backend/.env
# Dann backend/.env mit einem Texteditor öffnen und Key eintragen

# Starten
./start.sh        # Linux/macOS
start.bat          # Windows
```

Die App startet auf **http://localhost:8000**.

### Schüler verbinden

Schüler öffnen `http://DEINE-IP:8000` im Browser (Handy/Tablet/PC).

---

## Tech-Stack

| Komponente | Technologie |
|-----------|-------------|
| Backend | Python, FastAPI, SQLite (async) |
| Frontend | React 19, Vite, React Router |
| KI | Claude API (Anthropic) |
| Echtzeit | WebSockets |
| PDF-Export | ReportLab |
| Dokumenten-Import | PyMuPDF, python-docx |
| Code-Ausführung | Pyodide (Python), sql.js (SQL), Blockly |
| Diagramme | Mermaid.js |

---

## Features im Detail

### Für Lehrer

- **Aufgaben-Pools** — Organisiere Aufgaben in thematischen Pools
- **KI-Generierung** — Aufgaben aus Thema oder Dokument (PDF/DOCX) erstellen lassen
- **Moodle-Import/Export** — XML-kompatibel mit bestehenden Moodle-Aufgaben
- **Klassenarbeiten** — Zusammenstellen, aktivieren, live überwachen
- **Live-Monitor** — Echtzeit-Fortschritt aller Schüler
- **Notenschlüssel-Editor** — IHK, Linear, eigener Schlüssel pro Klassenarbeit
- **Klassenstatistiken** — Notenspiegel, Aufgaben-Ranking, Durchschnitt
- **KI-Schwächenanalyse** — Automatische Analyse der Klassenleistung
- **Export** — PDF (Einzelschüler + Übersicht), CSV für Excel
- **Aufgabenreihenfolge mischen** — Gegen Abschreiben
- **Dokument-Import mit Bildern** — KI übernimmt Fotos/Diagramme aus PDFs

### Für Schüler

- **Einfacher Beitritt** — Name eingeben, Klassenarbeit auswählen, los
- **Auto-Save** — Antworten werden automatisch gespeichert
- **Aufgaben markieren** — "Nochmal anschauen"-Flag für die Prüfung
- **Sofortergebnisse** — Note, Feedback und Musterlösung nach Abgabe
- **Einspruch einlegen** — Bewertung anfechten mit Begründung
- **KI-Nachhilfe** — "Erkläre mir das" Button bei jeder Aufgabe
- **Persönliches Lernmaterial** — KI generiert Übungsmaterial basierend auf Schwächen
- **Lern-Duelle** — Kompetitives Quiz mit Classmates

### Lern-Duelle

- **Klassisches Duell** und **Battle Royale** Modus
- QR-Code zum schnellen Beitreten per Handy
- Echtzeit-Leaderboard mit Streak-Bonus
- Lehrer-Live-View zum Beamen
- Automatische Bewertung (nur auto-gradable Typen)

### Programmierung (6 Sprachen)

- **JavaScript** — Nativ im Browser
- **Python** — Pyodide (CPython als WebAssembly)
- **SQL** — sql.js (SQLite als WebAssembly)
- **TypeScript** — CDN-Transpiler
- **HTML/CSS** — Live-Vorschau
- **Blockly** — Visuelles Programmieren mit Drag & Drop

Alle mit automatischen Testfällen, 15-Sekunden-Timeout gegen Endlosschleifen, und KI-Fallback wenn keine Tests definiert sind.

---

## Architektur

```
ExamPilot/
├── backend/                 # Python FastAPI
│   ├── main.py              # Entry Point
│   ├── config.py            # Konfiguration
│   ├── database.py          # SQLite Schema + Migrationen
│   ├── models.py            # Pydantic Models
│   ├── routers/             # API-Endpunkte
│   │   ├── auth.py          # Lehrer-Login (JWT)
│   │   ├── tasks.py         # Aufgaben-CRUD
│   │   ├── exams.py         # Klassenarbeiten
│   │   ├── student.py       # Schüler-Interface
│   │   ├── results.py       # Ergebnisse + Statistiken
│   │   ├── export.py        # PDF/CSV-Export
│   │   ├── duel.py          # Duel REST API
│   │   └── duel_ws.py       # Duel WebSocket
│   └── services/            # Business-Logik
│       ├── claude_service.py # KI-Bewertung + Generierung
│       ├── auto_grader.py   # Lokale Bewertung
│       ├── duel_engine.py   # Spiellogik
│       ├── doc_import.py    # PDF/DOCX-Import
│       └── grading.py       # Notenschlüssel
├── frontend/                # React + Vite
│   └── src/components/
│       ├── Questions/       # 16 Aufgabentyp-Komponenten
│       ├── Teacher/         # Lehrer-Dashboard
│       ├── Student/         # Schüler-Interface
│       └── Duel/            # Duel-Komponenten
├── start.sh                 # Linux/macOS Start
├── start.bat                # Windows Start
└── .env.example             # API-Key Vorlage
```

---

## API-Key Konfiguration

ExamPilot benötigt einen [Anthropic API-Key](https://console.anthropic.com/) für KI-Features.

**Option 1: Umgebungsvariable (empfohlen)**
```bash
# Linux/macOS: In ~/.bashrc oder ~/.zshrc
export ANTHROPIC_API_KEY="sk-ant-..."

# Windows: Dauerhaft setzen
setx ANTHROPIC_API_KEY "sk-ant-..."
```

**Option 2: .env-Datei**
```bash
cp .env.example backend/.env
# backend/.env bearbeiten und Key eintragen
```

Die App funktioniert auch ohne API-Key — alle auto-bewerteten Aufgabentypen (Multiple Choice, Numerisch, etc.) und Lern-Duelle laufen ohne KI.

---

## Portable Version (Windows)

```bash
# Windows: Portable EXE erstellen
build_portable.bat
# Erstellt dist/ExamPilot/ — auf USB-Stick kopieren oder als ZIP weitergeben
```

---

## Screenshots

*Coming soon*

---

## Mitwirken

Beiträge sind willkommen! Bitte erstelle ein Issue bevor du einen Pull Request einreichst.

1. Fork erstellen
2. Feature-Branch: `git checkout -b feature/mein-feature`
3. Committen: `git commit -m "Add: Mein Feature"`
4. Pushen: `git push origin feature/mein-feature`
5. Pull Request erstellen

---

## Roadmap

- [ ] Englische Sprachunterstützung (i18n)
- [ ] Vergessenskurve / Spaced Repetition
- [ ] Sokratischer Spiegel (Denkprozess-Analyse)
- [ ] Parallelwelt-Prüfung (Transfer-Kompetenz)
- [ ] KI-Mündliche Prüfung (Speech API)
- [ ] Kompetenz-Radar (Spider-Diagramm über mehrere Prüfungen)
- [ ] BPMN-Diagramm-Editor
- [ ] Musik-Notation (visuelles Noten setzen)
- [ ] Multi-Tenant (mehrere Lehrer-Accounts)

---

## Lizenz

MIT License — siehe [LICENSE](LICENSE)

---

## Danksagung

Entwickelt mit Hilfe von [Claude](https://claude.ai) (Anthropic).
