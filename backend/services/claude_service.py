import json
import asyncio
from anthropic import Anthropic

from config import ANTHROPIC_API_KEY, CLAUDE_MODEL, CLAUDE_MAX_TOKENS

# Rate limiting: simple semaphore for max 2 concurrent calls
_semaphore = asyncio.Semaphore(2)

client = None


def get_client():
    global client
    if client is None:
        client = Anthropic(api_key=ANTHROPIC_API_KEY)
    return client


def _parse_json_response(text: str) -> dict | list:
    """Extract JSON from Claude's response, handling markdown code blocks."""
    text = text.strip()
    # Remove markdown code blocks
    if text.startswith("```"):
        lines = text.split("\n")
        lines = lines[1:]  # Remove opening ```json
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)
    return json.loads(text)


async def grade_answer(
    task_text: str,
    task_hint: str,
    task_type: str,
    student_answer: str,
    max_points: int,
    question_data: dict | None = None,
) -> dict:
    """Grade essay or shortanswer using Claude. Returns {points, correct, feedback}."""

    if task_type == "shortanswer":
        reference_answers = ""
        if question_data and question_data.get("answers"):
            refs = [a["text"] for a in question_data["answers"] if a.get("text")]
            if refs:
                reference_answers = f"\nReferenzantworten: {', '.join(refs)}"

        system_prompt = f"""Du bist ein Prüfer an einer Berufsschule.

Bewerte die folgende Kurzantwort eines Schülers.
- Prüfe ob die Antwort inhaltlich korrekt ist
- Kleine Schreibfehler oder abweichende Formulierungen sind akzeptabel, solange der Inhalt stimmt
- Bewerte semantisch, nicht nur per exaktem Textvergleich{reference_answers}

Antworte als JSON:
{{
  "points": <0 bis {max_points}>,
  "correct": true/false,
  "feedback": "Kurze Begründung auf Deutsch (max 2 Sätze)"
}}"""
    else:
        grader_info = ""
        if question_data and question_data.get("grader_info"):
            grader_info = f"\nBewertungshinweis: {question_data['grader_info']}"

        system_prompt = f"""Du bist ein Prüfer an einer Berufsschule.

Bewerte die folgende Textantwort eines Schülers.
- Fachliche Korrektheit ist am wichtigsten
- Formulierung muss nicht perfekt sein
- Alle relevanten Aspekte der Frage müssen abgedeckt sein{grader_info}

Antworte als JSON:
{{
  "points": <0 bis {max_points}>,
  "correct": true/false,
  "feedback": "Begründung mit Hinweis was fehlte oder falsch war"
}}"""

    user_message = f"""Aufgabe: {task_text}

Erwartete Lösung / Hinweis: {task_hint or "Keine Angabe"}

Antwort des Schülers: {student_answer}

Maximale Punktzahl: {max_points}"""

    async with _semaphore:
        response = await asyncio.to_thread(
            get_client().messages.create,
            model=CLAUDE_MODEL,
            max_tokens=CLAUDE_MAX_TOKENS,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )

    result = _parse_json_response(response.content[0].text)

    # Ensure points are within range
    result["points"] = max(0, min(max_points, result.get("points", 0)))

    return result


async def generate_tasks(topic: str, count: int, difficulty: str) -> list:
    """Generate exam tasks using Claude."""

    system_prompt = """Du bist ein erfahrener Lehrer an einer Berufsschule.
Erstelle praxisnahe Prüfungsaufgaben in verschiedenen Fragetypen.
Antworte IMMER als JSON-Array."""

    user_message = f"""Generiere {count} Prüfungsaufgaben zum Thema "{topic}".
Schwierigkeitsgrad: {difficulty}

Verwende einen Mix aus diesen Fragetypen:
- multichoice (Multiple Choice mit Antwortoptionen)
- truefalse (Wahr/Falsch-Aussagen)
- shortanswer (Kurzantwort)
- numerical (Zahlenwert mit Toleranz)
- matching (Zuordnung von Paaren)
- essay (Freitext / längere Erklärung)
- ordering (Reihenfolge sortieren)

Antworte als JSON-Array:
[
  {{
    "title": "Aufgabe 1",
    "text": "Aufgabenstellung...",
    "hint": "Erwartete Lösung / Lösungshinweis",
    "topic": "{topic}",
    "task_type": "multichoice|truefalse|shortanswer|numerical|matching|essay|ordering",
    "points": 1-5,
    "question_data": {{ ... }}
  }}
]

question_data Struktur je nach Typ:
- multichoice: {{"single": true, "shuffle": true, "answers": [{{"text": "Option A", "fraction": 100, "feedback": "Richtig!"}}, {{"text": "Option B", "fraction": 0, "feedback": "Falsch"}}]}}
- truefalse: {{"correct_answer": true, "feedback_true": "Richtig!", "feedback_false": "Falsch."}}
- shortanswer: {{"answers": [{{"text": "Erwartete Antwort", "fraction": 100}}]}}
- numerical: {{"answers": [{{"value": 42, "tolerance": 0.1, "fraction": 100}}]}}
- matching: {{"shuffle": true, "pairs": [{{"question": "Begriff", "answer": "Definition"}}]}}
- essay: {{"grader_info": "Erwartete Lösung und Bewertungskriterien"}}
- ordering: {{"items": ["Erster Schritt", "Zweiter Schritt", "Dritter Schritt"]}}"""

    async with _semaphore:
        response = await asyncio.to_thread(
            get_client().messages.create,
            model=CLAUDE_MODEL,
            max_tokens=64000,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )

    return _parse_json_response(response.content[0].text)


async def ai_edit_task(
    title: str, text: str, hint: str, points: int, prompt: str,
    task_type: str = "essay", question_data: dict | None = None,
) -> dict:
    """Edit a task based on a teacher's natural language instruction."""

    system_prompt = """Du bist ein erfahrener Lehrer. Passe die gegebene Prüfungsaufgabe
nach der Anweisung des Lehrers an. Antworte IMMER als JSON.

Gültige Aufgabentypen: multichoice, truefalse, shortanswer, numerical, matching, essay, ordering, cloze, description

question_data Struktur je nach Typ:
- multichoice: {"single": true, "shuffle": true, "answers": [{"text": "...", "fraction": 100, "feedback": "..."}]}
- truefalse: {"correct_answer": true, "feedback_true": "...", "feedback_false": "..."}
- shortanswer: {"answers": [{"text": "...", "fraction": 100}]}
- numerical: {"answers": [{"value": 42, "tolerance": 0.1, "fraction": 100}]}
- matching: {"shuffle": true, "pairs": [{"question": "...", "answer": "..."}]}
- essay: {"grader_info": "..."}
- ordering: {"items": ["Erster", "Zweiter", "Dritter"]}
- cloze: {"gaps": [{"type": "shortanswer", "answers": [{"text": "...", "fraction": 100}]}]}
- description: {}"""

    qdata_str = json.dumps(question_data or {}, ensure_ascii=False)

    user_message = f"""Hier ist eine bestehende Prüfungsaufgabe:

Titel: {title}
Text: {text}
Erwartete Lösung: {hint or "Keine Angabe"}
Punkte: {points}
Aufgabentyp: {task_type}
Aufgabendaten: {qdata_str}

Anweisung des Lehrers: "{prompt}"

Passe die Aufgabe entsprechend an. Du darfst auch den Aufgabentyp ändern wenn die Anweisung das erfordert.
Antworte als JSON:
{{
  "title": "...",
  "text": "...",
  "hint": "...",
  "points": ...,
  "task_type": "...",
  "question_data": {{ ... }}
}}"""

    async with _semaphore:
        response = await asyncio.to_thread(
            get_client().messages.create,
            model=CLAUDE_MODEL,
            max_tokens=CLAUDE_MAX_TOKENS,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )

    return _parse_json_response(response.content[0].text)
