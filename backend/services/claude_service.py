import json
import re
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
    """Extract JSON from Claude's response, with repair for common issues."""
    text = text.strip()
    # Remove markdown code blocks
    if text.startswith("```"):
        lines = text.split("\n")
        lines = lines[1:]  # Remove opening ```json
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)

    # First attempt: parse as-is
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Repair attempt: fix common Claude JSON issues
    repaired = text

    # Fix truncated output: close open brackets/braces
    open_brackets = repaired.count("[") - repaired.count("]")
    open_braces = repaired.count("{") - repaired.count("}")
    if open_brackets > 0 or open_braces > 0:
        # Find last complete object (ending with })
        last_brace = repaired.rfind("}")
        if last_brace != -1:
            repaired = repaired[: last_brace + 1]
            repaired = repaired.rstrip().rstrip(",")
            repaired += "]" * max(0, repaired.count("[") - repaired.count("]"))

    # Remove trailing commas before ] or }
    repaired = re.sub(r",\s*([}\]])", r"\1", repaired)

    try:
        return json.loads(repaired)
    except json.JSONDecodeError:
        pass

    # Last resort: find the outermost JSON array or object
    for pattern in [r"\[.*\]", r"\{.*\}"]:
        match = re.search(pattern, repaired, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                continue

    raise ValueError(f"Konnte kein gültiges JSON aus der KI-Antwort extrahieren.")


async def grade_answer(
    task_text: str,
    task_hint: str,
    task_type: str,
    student_answer: str,
    max_points: int,
    question_data: dict | None = None,
    solution: str = "",
) -> dict:
    """Grade essay, shortanswer, drawing or webapp using Claude. Returns {points, correct, feedback}."""

    if task_type == "feynman":
        grader_info = ""
        if question_data and question_data.get("grader_info"):
            grader_info = f"\nBewertungskriterien des Lehrers: {question_data['grader_info']}"

        concept = (question_data or {}).get("concept", "")

        system_prompt = f"""Du bist ein Prüfer an einer Berufsschule.
Schreibe das Feedback in direkter Ansprache ("Du hast...", "Dir fehlt..."), nicht in dritter Person.

Bewerte das folgende Gespräch, in dem ein Konzept einem Kollegen erklärt wurde (Feynman-Methode).
Das Konzept: {concept}

Bewerte:
- Wurde das Konzept korrekt und vollständig erklärt?
- Wurden falsche Aussagen des Gesprächspartners erkannt und korrigiert?
- Wurden verständliche Beispiele oder Analogien verwendet?
- Zeigt das Gespräch tiefes Verständnis des Themas?{grader_info}

Antworte als JSON:
{{
  "points": <0 bis {max_points}>,
  "correct": true/false,
  "feedback": "Begründung in Du-Form mit Hinweis was gut war und was fehlte"
}}"""

        solution_text = solution or "Keine Angabe"
        user_message = f"""Aufgabe: {task_text}

Musterlösung: {solution_text}

Gesprächsprotokoll:
{student_answer}

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
        result["points"] = max(0, min(max_points, result.get("points", 0)))
        return result

    if task_type == "scenario":
        grader_info = ""
        if question_data and question_data.get("grader_info"):
            grader_info = f"\nBewertungskriterien des Lehrers: {question_data['grader_info']}"

        scenario_desc = (question_data or {}).get("scenario_description", "")
        context = (question_data or {}).get("context", "")

        system_prompt = f"""Du bist ein Prüfer an einer Berufsschule.
Schreibe das Feedback in direkter Ansprache ("Du hast...", "Dir fehlt..."), nicht in dritter Person.

Bewerte den folgenden Entscheidungspfad in einem Branching-Szenario.
Szenario: {scenario_desc}
{f"Kontext/Fachgebiet: {context}" if context else ""}

Bewerte:
- Wurden fachlich fundierte Entscheidungen getroffen?
- Wurden Konsequenzen richtig eingeschätzt?
- Zeigt der Entscheidungspfad Verständnis der relevanten Konzepte?
- Wurden offensichtlich schlechte Optionen vermieden?{grader_info}

Antworte als JSON:
{{
  "points": <0 bis {max_points}>,
  "correct": true/false,
  "feedback": "Begründung in Du-Form mit Hinweis was gut war und was besser wäre"
}}"""

        solution_text = solution or "Keine Angabe"
        user_message = f"""Aufgabe: {task_text}

Musterlösung: {solution_text}

Entscheidungsprotokoll:
{student_answer}

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
        result["points"] = max(0, min(max_points, result.get("points", 0)))
        return result

    if task_type == "webapp":
        grader_info = ""
        if question_data and question_data.get("grader_info"):
            grader_info = f"\nBewertungskriterien: {question_data['grader_info']}"

        system_prompt = f"""Du bist ein Prüfer an einer Berufsschule.
Schreibe das Feedback in direkter Ansprache ("Du hast...", "Dir fehlt..."), nicht in dritter Person.

Bewerte die Arbeit in einer interaktiven Web-App-Aufgabe.
Du erhältst den exportierten Zustand (JSON) der App nach Bearbeitung.
- Prüfe ob die Aufgabe korrekt und vollständig gelöst wurde
- Bewerte anhand der Aufgabenstellung und Bewertungskriterien
- Berücksichtige Teilleistungen{grader_info}

Antworte als JSON:
{{
  "points": <0 bis {max_points}>,
  "correct": true/false,
  "feedback": "Begründung in Du-Form mit Hinweis was fehlte oder falsch war"
}}"""

        solution_text = solution or "Keine Angabe"
        user_message = f"""Aufgabe: {task_text}

Musterlösung: {solution_text}

Exportierter Zustand der App (JSON):
{student_answer}

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
        result["points"] = max(0, min(max_points, result.get("points", 0)))
        return result

    if task_type == "drawing":
        grader_info = ""
        if question_data and question_data.get("grader_info"):
            grader_info = f"\nBewertungshinweis: {question_data['grader_info']}"

        system_prompt = f"""Du bist ein Prüfer an einer Berufsschule.
Schreibe das Feedback in direkter Ansprache ("Du hast...", "Dir fehlt..."), nicht in dritter Person.

Bewerte die folgende Zeichnung/Handschrift.
- Prüfe ob die Zeichnung die gestellte Aufgabe korrekt beantwortet
- Bewerte Vollständigkeit, Korrektheit und Klarheit
- Beschriftungen und Details sind wichtig{grader_info}

Antworte als JSON:
{{
  "points": <0 bis {max_points}>,
  "correct": true/false,
  "feedback": "Begründung in Du-Form mit Hinweis was fehlte oder falsch war"
}}"""

        solution_text = solution or task_hint or "Keine Angabe"

        # Strip data URI prefix if present
        image_data = student_answer
        if image_data.startswith("data:"):
            image_data = image_data.split(",", 1)[1]

        user_content = [
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/png",
                    "data": image_data,
                },
            },
            {
                "type": "text",
                "text": f"Aufgabe: {task_text}\n\nMusterlösung: {solution_text}\nMaximale Punktzahl: {max_points}",
            },
        ]

        async with _semaphore:
            response = await asyncio.to_thread(
                get_client().messages.create,
                model=CLAUDE_MODEL,
                max_tokens=CLAUDE_MAX_TOKENS,
                system=system_prompt,
                messages=[{"role": "user", "content": user_content}],
            )

        result = _parse_json_response(response.content[0].text)
        result["points"] = max(0, min(max_points, result.get("points", 0)))
        return result

    if task_type == "shortanswer":
        reference_answers = ""
        if question_data and question_data.get("answers"):
            refs = [a["text"] for a in question_data["answers"] if a.get("text")]
            if refs:
                reference_answers = f"\nReferenzantworten: {', '.join(refs)}"

        system_prompt = f"""Du bist ein Prüfer an einer Berufsschule.
Schreibe das Feedback in direkter Ansprache ("Du hast...", "Dir fehlt..."), nicht in dritter Person.

Bewerte die folgende Kurzantwort.
- Prüfe ob die Antwort inhaltlich korrekt ist
- Kleine Schreibfehler oder abweichende Formulierungen sind akzeptabel, solange der Inhalt stimmt
- Bewerte semantisch, nicht nur per exaktem Textvergleich{reference_answers}

Antworte als JSON:
{{
  "points": <0 bis {max_points}>,
  "correct": true/false,
  "feedback": "Kurze Begründung in Du-Form auf Deutsch (max 2 Sätze)"
}}"""
    else:
        grader_info = ""
        if question_data and question_data.get("grader_info"):
            grader_info = f"\nBewertungshinweis: {question_data['grader_info']}"

        system_prompt = f"""Du bist ein Prüfer an einer Berufsschule.
Schreibe das Feedback in direkter Ansprache ("Du hast...", "Dir fehlt..."), nicht in dritter Person.

Bewerte die folgende Textantwort.
- Fachliche Korrektheit ist am wichtigsten
- Formulierung muss nicht perfekt sein
- Alle relevanten Aspekte der Frage müssen abgedeckt sein{grader_info}

Antworte als JSON:
{{
  "points": <0 bis {max_points}>,
  "correct": true/false,
  "feedback": "Begründung in Du-Form mit Hinweis was fehlte oder falsch war"
}}"""

    solution_text = solution or task_hint or "Keine Angabe"
    user_message = f"""Aufgabe: {task_text}

Musterlösung: {solution_text}
{f"Zusätzlicher Hinweis: {task_hint}" if task_hint and solution else ""}

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


_ALL_TYPE_DESCRIPTIONS = {
    "multichoice": "multichoice (Multiple Choice mit Antwortoptionen)",
    "truefalse": "truefalse (Wahr/Falsch-Aussagen)",
    "shortanswer": "shortanswer (Kurzantwort)",
    "numerical": "numerical (Zahlenwert mit Toleranz)",
    "matching": "matching (Zuordnung von Paaren)",
    "essay": "essay (Freitext / längere Erklärung)",
    "ordering": "ordering (Reihenfolge sortieren)",
    "drawing": "drawing (Zeichnung/Handschrift auf Canvas)",
    "webapp": "webapp (Interaktive Web-App, z.B. Spreadsheet, Kalkulation, Zuordnungsaufgabe)",
    "feynman": "feynman (Erkläraufgabe: Schüler erklärt ein Konzept einem unwissenden KI-Kollegen im Chat-Dialog)",
    "scenario": "scenario (Branching-Szenario: Interaktive Entscheidungssimulation, Schüler navigiert durch verzweigende Situationen)",
}

_ALL_TYPE_QD = {
    "multichoice": '- multichoice: {{"single": true, "shuffle": true, "answers": [{{"text": "Option A", "fraction": 100, "feedback": "Richtig!"}}, {{"text": "Option B", "fraction": 0, "feedback": "Falsch"}}]}}',
    "truefalse": '- truefalse: {{"correct_answer": true, "feedback_true": "Richtig!", "feedback_false": "Falsch."}}',
    "shortanswer": '- shortanswer: {{"answers": [{{"text": "Erwartete Antwort", "fraction": 100}}]}}',
    "numerical": '- numerical: {{"answers": [{{"value": 42, "tolerance": 0.1, "fraction": 100}}]}}',
    "matching": '- matching: {{"shuffle": true, "pairs": [{{"question": "Begriff", "answer": "Definition"}}]}}',
    "essay": '- essay: {{"grader_info": "Erwartete Lösung und Bewertungskriterien"}}',
    "ordering": '- ordering: {{"items": ["Erster Schritt", "Zweiter Schritt", "Dritter Schritt"]}}',
    "drawing": '- drawing: {{"grader_info": "Was in der Zeichnung erwartet wird", "canvas_width": 800, "canvas_height": 400}}',
    "webapp": '- webapp: {{"app_description": "Beschreibung der interaktiven App die erstellt werden soll", "grader_info": "Bewertungskriterien für den exportierten App-Zustand"}}',
    "feynman": '- feynman: {{"concept": "Das zu erklärende Konzept", "context": "Fachgebiet/Kontext", "max_turns": 10, "grader_info": "Bewertungskriterien"}}',
    "scenario": '- scenario: {{"scenario_description": "Ausgangssituation des Szenarios", "context": "Fachgebiet z.B. BWL, Recht", "max_decisions": 5, "grader_info": "Bewertungskriterien für den Entscheidungspfad"}}',
}


def _build_type_prompt(allowed_types: list[str] | None = None) -> tuple[str, str]:
    """Build type list and question_data docs filtered by allowed_types.
    Returns (type_list_str, qd_docs_str)."""
    if allowed_types:
        types = [t for t in allowed_types if t in _ALL_TYPE_DESCRIPTIONS]
    else:
        types = list(_ALL_TYPE_DESCRIPTIONS.keys())

    type_lines = "\n".join(f"- {_ALL_TYPE_DESCRIPTIONS[t]}" for t in types)
    qd_lines = "\n".join(_ALL_TYPE_QD[t] for t in types if t in _ALL_TYPE_QD)
    type_names = "|".join(types)
    return type_lines, qd_lines, type_names


async def generate_tasks(topic: str, count: int, difficulty: str, instructions: str = "", allowed_types: list[str] | None = None) -> list:
    """Generate exam tasks using Claude."""

    type_lines, qd_lines, type_names = _build_type_prompt(allowed_types)

    system_prompt = """Du bist ein erfahrener Lehrer an einer Berufsschule.
Erstelle praxisnahe Prüfungsaufgaben in verschiedenen Fragetypen.
Antworte IMMER als valides JSON-Array.
WICHTIG: Achte auf korrektes JSON-Escaping! Anführungszeichen innerhalb von String-Werten MÜSSEN escaped werden (\\"). Verwende keine unescapten " innerhalb von JSON-Strings."""

    user_message = f"""Generiere {count} Prüfungsaufgaben zum Thema "{topic}".
Schwierigkeitsgrad: {difficulty}

Verwende AUSSCHLIESSLICH diese Fragetypen:
{type_lines}

Antworte als JSON-Array:
[
  {{
    "title": "Aufgabe 1",
    "text": "Aufgabenstellung...",
    "hint": "Optionaler Hinweis für den Schüler",
    "solution": "Ausführliche Musterlösung (wird nach der Prüfung angezeigt und zur Bewertung genutzt)",
    "topic": "{topic}",
    "task_type": "{type_names}",
    "points": 1-5,
    "question_data": {{ ... }}
  }}
]

question_data Struktur je nach Typ:
{qd_lines}"""

    if instructions:
        user_message += f"\n\nZusätzliche Anweisungen des Lehrers:\n{instructions}"

    async with _semaphore:
        response = await asyncio.to_thread(
            get_client().messages.create,
            model=CLAUDE_MODEL,
            max_tokens=64000,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )

    tasks = _parse_json_response(response.content[0].text)

    # Post-process: generate app_html for any webapp tasks
    for task in tasks:
        if isinstance(task, dict) and task.get("task_type") == "webapp":
            qd = task.get("question_data", {})
            desc = qd.get("app_description", "") or task.get("text", "")
            grader = qd.get("grader_info", "")
            try:
                app_html = await generate_webapp(desc, grader)
                if "question_data" not in task:
                    task["question_data"] = {}
                task["question_data"]["app_html"] = app_html
            except Exception:
                # If webapp generation fails, fall back to essay type
                task["task_type"] = "essay"
                if "question_data" not in task:
                    task["question_data"] = {}
                task["question_data"]["grader_info"] = grader

    return tasks


async def ai_edit_task(
    title: str, text: str, hint: str, points: int, prompt: str,
    task_type: str = "essay", question_data: dict | None = None,
    solution: str = "",
) -> dict:
    """Edit a task based on a teacher's natural language instruction."""

    system_prompt = """Du bist ein erfahrener Lehrer. Passe die gegebene Prüfungsaufgabe
nach der Anweisung des Lehrers an. Antworte IMMER als valides JSON.
WICHTIG: Achte auf korrektes JSON-Escaping! Anführungszeichen innerhalb von String-Werten MÜSSEN escaped werden (\\").

Gültige Aufgabentypen: multichoice, truefalse, shortanswer, numerical, matching, essay, ordering, cloze, description, webapp, feynman, scenario

question_data Struktur je nach Typ:
- multichoice: {"single": true, "shuffle": true, "answers": [{"text": "...", "fraction": 100, "feedback": "..."}]}
- truefalse: {"correct_answer": true, "feedback_true": "...", "feedback_false": "..."}
- shortanswer: {"answers": [{"text": "...", "fraction": 100}]}
- numerical: {"answers": [{"value": 42, "tolerance": 0.1, "fraction": 100}]}
- matching: {"shuffle": true, "pairs": [{"question": "...", "answer": "..."}]}
- essay: {"grader_info": "..."}
- ordering: {"items": ["Erster", "Zweiter", "Dritter"]}
- cloze: {"gaps": [{"type": "shortanswer", "answers": [{"text": "...", "fraction": 100}]}]}
- description: {}
- webapp: {"app_description": "Beschreibung der App", "grader_info": "Bewertungskriterien"}
- feynman: {"concept": "Das zu erklärende Konzept", "context": "Fachgebiet", "max_turns": 10, "grader_info": "Bewertungskriterien"}
- scenario: {"scenario_description": "Ausgangssituation", "context": "Fachgebiet", "max_decisions": 5, "grader_info": "Bewertungskriterien"}"""

    qdata_str = json.dumps(question_data or {}, ensure_ascii=False)

    user_message = f"""Hier ist eine bestehende Prüfungsaufgabe:

Titel: {title}
Text: {text}
Hinweis: {hint or "Keiner"}
Musterlösung: {solution or "Keine Angabe"}
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
  "solution": "Ausführliche Musterlösung",
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


async def explain_answer(
    task_text: str,
    solution: str,
    student_answer: str,
    points_awarded: float,
    max_points: int,
    feedback: str,
    task_type: str,
) -> str:
    """Generate a personalized tutoring explanation for a student."""
    system_prompt = """Du bist ein freundlicher Nachhilfelehrer an einer Berufsschule.
Du sprichst den Schüler direkt mit "Du" an.

Erkläre auf einfache, ermutigende Weise:
1. Was die richtige Antwort ist und warum
2. Wo Fehler gemacht wurden (falls vorhanden)
3. Einen hilfreichen Tipp zum Merken/Verstehen

Antworte auf Deutsch, in 3-5 kurzen Absätzen. Verwende einfache Sprache und direkte Ansprache.
Sei ermutigend aber ehrlich."""

    user_message = f"""Aufgabe: {task_text}

Musterlösung: {solution or "Nicht verfügbar"}

Gegebene Antwort: {student_answer or "Keine Antwort"}

Erreichte Punkte: {points_awarded}/{max_points}
Bewertungs-Feedback: {feedback or "Kein Feedback"}

Bitte erkläre dem Schüler, was richtig/falsch war und wie er es besser machen kann."""

    if task_type == "drawing" and student_answer and student_answer.startswith("data:image"):
        image_data = student_answer.split(",", 1)[1] if "," in student_answer else student_answer
        user_content = [
            {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": image_data}},
            {"type": "text", "text": user_message},
        ]
    else:
        user_content = user_message

    async with _semaphore:
        response = await asyncio.to_thread(
            get_client().messages.create,
            model=CLAUDE_MODEL,
            max_tokens=2000,
            system=system_prompt,
            messages=[{"role": "user", "content": user_content}],
        )
    return response.content[0].text


async def feynman_respond(concept: str, context: str, task_text: str, messages: list[dict], is_last_turn: bool = False) -> str:
    """Generate the AI colleague's response in a Feynman teaching dialogue."""

    last_turn_instruction = ""
    if is_last_turn:
        last_turn_instruction = """

WICHTIG — Dies ist deine LETZTE Antwort! Der Schüler kann danach NICHT mehr antworten.
- Stelle KEINE Fragen mehr
- Sage KEINE falschen Aussagen mehr die noch korrigiert werden müssten
- Bedanke dich für die Erklärung und verabschiede dich freundlich
- Du kannst kurz zusammenfassen was du "gelernt" hast (bleibe in deiner Rolle als unwissender Kollege)"""

    system_prompt = f"""Du bist ein Arbeitskollege, der ein Konzept NICHT versteht und es sich erklären lässt.
Du spielst einen freundlichen aber unwissenden Kollegen.

Das Konzept, das dir erklärt werden soll: {concept}
{f"Kontext/Fachgebiet: {context}" if context else ""}
Aufgabe: {task_text}

Deine Rolle:
- Tu so, als wüsstest du NICHTS über das Thema
- Stelle Rückfragen wenn etwas unklar ist ("Was genau meinst du mit...?", "Kannst du das nochmal anders erklären?")
- Sage ab und zu bewusst etwas Falsches, um zu testen ob dein Gegenüber dich korrigiert
  (z.B. "Ah, also ist das wie [falsche Analogie]?" oder "Dann bedeutet [Begriff] ja [falsche Definition], oder?")
- Bitte gelegentlich um ein konkretes Beispiel
- Sei freundlich, neugierig und motivierend
- Halte deine Antworten kurz (2-4 Sätze)
- Sage NIEMALS die richtige Antwort selbst
- Bewerte NICHT — du bist nur der Gesprächspartner{last_turn_instruction}"""

    # Convert transcript to Claude message format
    claude_messages = []
    for msg in messages:
        role = "user" if msg["role"] == "student" else "assistant"
        claude_messages.append({"role": role, "content": msg["content"]})

    async with _semaphore:
        response = await asyncio.to_thread(
            get_client().messages.create,
            model=CLAUDE_MODEL,
            max_tokens=500,
            system=system_prompt,
            messages=claude_messages,
        )
    return response.content[0].text


async def scenario_respond(
    scenario_description: str, context: str, task_text: str,
    transcript: list[dict], is_last_decision: bool = False
) -> dict:
    """Generate the next situation in a branching scenario. Returns {situation, options, outcome_summary?}."""

    last_decision_instruction = ""
    if is_last_decision:
        last_decision_instruction = """

WICHTIG — Dies ist die LETZTE Situation! Keine weiteren Entscheidungen mehr möglich.
- Gib KEINE Optionen mehr zurück (leeres Array "options": [])
- Beschreibe das Endergebnis/die Konsequenzen aller bisherigen Entscheidungen
- Füge ein "outcome_summary" Feld hinzu das den gesamten Verlauf zusammenfasst"""

    system_prompt = f"""Du bist ein Szenario-Erzähler für interaktive Prüfungsaufgaben an einer Berufsschule.
Du erstellst realistische, verzweigte Szenarien in denen Schüler Entscheidungen treffen müssen.

Szenario: {scenario_description}
{f"Fachgebiet: {context}" if context else ""}
Aufgabe: {task_text}

Deine Rolle:
- Beschreibe die aktuelle Situation lebendig aber knapp (3-5 Sätze)
- Biete 2-4 realistische Handlungsoptionen an
- Optionen sollen unterschiedlich gut sein — manche fachlich korrekt, manche riskant, manche falsch
- Baue die Konsequenzen vorheriger Entscheidungen logisch ein
- Bleibe im fachlichen Kontext und mache das Szenario lehrreich
- Verwende "Du" als Ansprache (der Schüler ist die Hauptfigur)

WICHTIG: Antworte IMMER als valides JSON:
{{
  "situation": "Beschreibung der aktuellen Situation...",
  "options": ["Option A", "Option B", "Option C"]
}}{last_decision_instruction}

Achte auf korrektes JSON-Escaping! Anführungszeichen in Strings MÜSSEN escaped werden."""

    # Build conversation from transcript
    claude_messages = []
    for entry in transcript:
        if entry["role"] == "situation":
            claude_messages.append({"role": "assistant", "content": json.dumps(entry["data"], ensure_ascii=False)})
        elif entry["role"] == "decision":
            claude_messages.append({"role": "user", "content": f"Ich wähle: {entry['content']}"})

    # For initial call (empty transcript), send a start message
    if not claude_messages:
        claude_messages = [{"role": "user", "content": "Starte das Szenario."}]

    async with _semaphore:
        response = await asyncio.to_thread(
            get_client().messages.create,
            model=CLAUDE_MODEL,
            max_tokens=1000,
            system=system_prompt,
            messages=claude_messages,
        )

    return _parse_json_response(response.content[0].text)


async def generate_webapp(description: str, grader_info: str = "") -> str:
    """Generate a self-contained HTML/CSS/JS web app for an exam task."""

    system_prompt = """Du bist ein erfahrener Web-Entwickler. Erstelle eine interaktive HTML-App für eine Prüfungsaufgabe an einer Berufsschule.

Anforderungen:
- Komplett eigenständiges HTML-Dokument (inline CSS + JS, KEINE externen Abhängigkeiten)
- Modernes, sauberes Design (heller Hintergrund, abgerundete Ecken, gut lesbare Schrift)
- Touch-freundlich (min. 44px Tap-Targets) für Tablet-Nutzung (iPad)
- Responsive Layout das in einem iframe gut funktioniert
- Alle nötigen Daten/Testdaten direkt in der App enthalten

postMessage-Kontrakt (MUSS implementiert werden):
1. Bei JEDER relevanten Zustandsänderung durch den Schüler:
   window.parent.postMessage({ type: 'examPilotState', state: { /* alle relevanten Daten */ } }, '*');

2. Auf State-Restore lauschen (für Auto-Save):
   window.addEventListener('message', function(e) {
     if (e.data && e.data.type === 'examPilotRestore') {
       // e.data.state enthält den zuvor gespeicherten Zustand
       // Stelle alle Eingaben/Auswahlen des Schülers wieder her
     }
   });

Der State MUSS alle Schülereingaben enthalten die zur Bewertung nötig sind.
Sende den initialen (leeren) State auch beim Laden der App.

WICHTIG — Dies ist eine Prüfungsaufgabe! Baue KEINE der folgenden Funktionen ein:
- Keine "Überprüfen"-, "Auswerten"- oder "Lösung anzeigen"-Buttons
- Kein automatisches Feedback ob Eingaben richtig oder falsch sind (keine grünen/roten Markierungen, keine Fehlermeldungen bei falschen Werten)
- Keine Hinweise auf die korrekte Lösung
- Keine Validierung die verrät ob eine Antwort stimmt
Die Bewertung erfolgt ausschließlich durch die KI nach Abgabe der Klassenarbeit.
Eingabevalidierung für Formate (z.B. "nur Zahlen erlaubt") ist erlaubt, aber ohne Bewertung der inhaltlichen Korrektheit.

Antworte NUR mit dem kompletten HTML-Code. Keine Erklärungen, kein Markdown, keine Code-Blöcke."""

    grader_hint = ""
    if grader_info:
        grader_hint = f"\n\nBewertungskriterien (nicht dem Schüler zeigen, aber die App so gestalten dass diese Kriterien prüfbar sind):\n{grader_info}"

    user_message = f"""Erstelle eine interaktive Web-App für folgende Prüfungsaufgabe:

{description}{grader_hint}"""

    async with _semaphore:
        response = await asyncio.to_thread(
            get_client().messages.create,
            model=CLAUDE_MODEL,
            max_tokens=64000,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )

    html = response.content[0].text.strip()
    # Strip markdown code blocks if present
    if html.startswith("```"):
        lines = html.split("\n")
        lines = lines[1:]  # Remove opening ```html
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        html = "\n".join(lines)
    return html


async def analyze_class_weaknesses(tasks_with_stats: list[dict]) -> str:
    """Analyze class-wide weaknesses based on exam results."""
    system_prompt = """Du bist ein erfahrener Berufsschullehrer und Didaktik-Experte.
Analysiere die folgenden Klassenarbeitsergebnisse und erstelle eine Schwächenanalyse.

Strukturiere deine Analyse wie folgt:

## Gesamtübersicht
- Kurze Zusammenfassung der Klassenleistung (2-3 Sätze)
- Durchschnittliche Erfolgsquote über alle Aufgaben

## Schwächen nach Aufgabe
(Für jede Aufgabe mit Erfolgsquote unter 70%:)
### Aufgabe [Nr]: [Titel]
- **Erfolgsquote:** X%
- **Häufige Fehler:** Beschreibe die typischen Fehlermuster anhand der Schülerantworten
- **Mögliche Ursachen:** Warum haben Schüler hier Schwierigkeiten?

## Empfehlungen für den Unterricht
- Konkrete, umsetzbare Vorschläge zur Nachbereitung
- Welche Themen sollten nochmal behandelt werden?
- Methodische Tipps

Halte die Analyse prägnant und praxisnah. Schreibe auf Deutsch.
Wenn alle Aufgaben über 70% Erfolgsquote haben, erwähne trotzdem die schwächsten Bereiche und gib Optimierungsvorschläge."""

    # Build user message from task stats
    parts = []
    for i, t in enumerate(tasks_with_stats, 1):
        part = f"### Aufgabe {i}: {t['title']}\n"
        part += f"- Typ: {t['task_type']}\n"
        part += f"- Aufgabentext: {t['text'][:500]}\n"
        if t.get("solution"):
            part += f"- Musterlösung: {t['solution'][:300]}\n"
        part += f"- Max. Punkte: {t['max_points']}\n"
        part += f"- Durchschnitt: {t['avg_points']:.1f} Punkte\n"
        part += f"- Erfolgsquote: {t['success_rate']:.0%}\n"
        part += f"- Anzahl Schüler: {t['student_count']}\n"
        if t.get("wrong_answers"):
            part += "- Falsche/teilweise Antworten:\n"
            for j, wa in enumerate(t["wrong_answers"], 1):
                part += f"  {j}. ({wa['points']} Pkt.) {wa['answer']}\n"
        parts.append(part)

    user_message = "# Klassenarbeitsergebnisse\n\n" + "\n".join(parts)

    async with _semaphore:
        response = await asyncio.to_thread(
            get_client().messages.create,
            model=CLAUDE_MODEL,
            max_tokens=4000,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )

    return response.content[0].text.strip()
