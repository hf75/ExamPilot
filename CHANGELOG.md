# Changelog

Alle wichtigen Änderungen an ExamPilot werden hier dokumentiert.

## [1.0.0] - 2026-03-21

### Erster Release

#### Aufgabentypen (16)
- Multiple Choice, Wahr/Falsch, Kurzantwort, Numerisch
- Zuordnung, Reihenfolge, Lückentext, Freitext/Essay
- Zeichnung (Canvas), Beschreibung (Info-only)
- Web-App (interaktive iFrame-Aufgaben)
- Feynman-Erklärung (Chat-Dialog mit KI)
- Branching-Szenario (Entscheidungssimulation)
- Programmierung (JavaScript, Python, SQL, HTML/CSS, TypeScript, Blockly)
- Foto-Aufgabe (Kamera + Claude Vision)

#### Prüfungssystem
- Klassenarbeiten erstellen, aktivieren, überwachen
- Auto-Save während der Prüfung
- Timer mit automatischer Abgabe
- Zufällige Aufgabenreihenfolge pro Schüler
- Aufgaben markieren ("Nochmal anschauen")
- Passwortschutz für Klassenarbeiten
- Konfigurierbarer Notenschlüssel (IHK, Linear, eigener)

#### KI-Features
- Automatische Bewertung (6 auto-gradable + 9 KI-gradable Typen)
- Aufgaben-Generierung aus Thema + Schwierigkeit
- Dokument-Import (PDF/DOCX) mit Bild-Übernahme
- Ad-hoc Klassenarbeiten aus Dokumenten
- KI-Schwächenanalyse der Klasse
- Personalisiertes Lernmaterial nach Prüfung
- "Erkläre mir das" KI-Nachhilfe bei jeder Aufgabe
- Moodle XML Import/Export

#### Lern-Duelle
- Klassisches Duell und Battle Royale Modus
- Echtzeit-WebSocket-Multiplayer
- QR-Code zum Beitreten per Handy
- Leaderboard mit Streak-Bonus
- Lehrer-Live-View zum Beamen

#### Lehrer-Tools
- Aufgaben-Pools mit Suche und Organisation
- Aufgaben/Klassenarbeiten duplizieren
- Aufgaben zwischen Pools verschieben
- Live-Monitor (Echtzeit-Fortschritt)
- Klassenstatistiken (Notenspiegel, Aufgaben-Ranking)
- Export: PDF (Einzelschüler + Übersicht), CSV für Excel
- Druckfreundliche Ergebnisseiten

#### Visualisierung
- Mermaid-Diagramme in Aufgabentexten (ER, Flowchart, UML, etc.)
- Bilder aus PDFs/DOCX werden in Aufgaben eingebettet
- KI entscheidet: Originalbild behalten oder Mermaid-Diagramm generieren

#### Programmierung
- 6 Sprachen: JavaScript, Python, SQL, HTML/CSS, TypeScript, Blockly
- In-Browser-Ausführung (kein Server nötig)
- Automatische Testfälle mit Pass/Fail-Anzeige
- Blockly: Visuelles Programmieren mit Drag & Drop
- KI-Fallback wenn keine Testfälle definiert

#### Infrastruktur
- API-Key über Umgebungsvariable oder .env-Datei
- Platzhalter-Erkennung (kein versehentliches Key-Leaking)
- Portable EXE-Distribution (PyInstaller)
- SQLite mit WAL-Modus (keine externe DB nötig)
- Start-Skripte für Windows, Linux, macOS
