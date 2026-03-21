"""Auto-grading service for question types that can be evaluated locally."""

import json
import re


def is_auto_gradable(task_type: str, question_data: dict | None = None) -> bool:
    if task_type == "coding":
        qd = question_data or {}
        lang = qd.get("language", "")
        if lang == "html":
            return False  # HTML/CSS always needs AI grading
        # If no test cases defined (and not SQL with expected), fall back to AI
        has_tests = bool(qd.get("test_cases"))
        has_sql_expected = lang == "sql" and bool(qd.get("sql_expected"))
        return has_tests or has_sql_expected
    return task_type in {"multichoice", "truefalse", "numerical", "matching", "ordering", "cloze"}


def grade_auto(task_type: str, question_data: dict, student_answer: str, max_points: int) -> dict:
    """Grade a student answer locally. Returns {points, correct, feedback}."""
    graders = {
        "multichoice": _grade_multichoice,
        "truefalse": _grade_truefalse,
        "numerical": _grade_numerical,
        "matching": _grade_matching,
        "ordering": _grade_ordering,
        "cloze": _grade_cloze,
        "coding": _grade_coding,
    }
    grader = graders.get(task_type)
    if not grader:
        return {"points": 0, "correct": False, "feedback": "Unbekannter Aufgabentyp"}

    try:
        return grader(question_data, student_answer, max_points)
    except Exception as e:
        return {"points": 0, "correct": False, "feedback": f"Bewertungsfehler: {str(e)}"}


def _parse_answer(student_answer: str):
    """Try to parse student_answer as JSON, return raw string if that fails."""
    try:
        return json.loads(student_answer)
    except (json.JSONDecodeError, TypeError):
        return student_answer


def _grade_multichoice(qdata: dict, student_answer: str, max_points: int) -> dict:
    answers = qdata.get("answers", [])
    single = qdata.get("single", True)
    selected = _parse_answer(student_answer)

    if not isinstance(selected, list):
        selected = [selected]

    # Calculate fraction sum of selected answers
    total_fraction = 0
    for idx in selected:
        if isinstance(idx, int) and 0 <= idx < len(answers):
            total_fraction += answers[idx].get("fraction", 0)

    # Clamp to [0, 100]
    total_fraction = max(0, min(100, total_fraction))
    points = round(max_points * total_fraction / 100, 2)
    correct = total_fraction >= 100

    # Build feedback
    if correct:
        feedback = "Richtig!"
    elif total_fraction > 0:
        feedback = "Teilweise richtig."
    else:
        feedback = "Leider falsch."

    # Add per-answer feedback if available
    for idx in selected:
        if isinstance(idx, int) and 0 <= idx < len(answers):
            ans_feedback = answers[idx].get("feedback", "")
            if ans_feedback:
                feedback += f" {ans_feedback}"

    return {"points": points, "correct": correct, "feedback": feedback}


def _grade_truefalse(qdata: dict, student_answer: str, max_points: int) -> dict:
    correct_answer = qdata.get("correct_answer", True)
    parsed = _parse_answer(student_answer)

    # Normalize to boolean
    if isinstance(parsed, str):
        student_bool = parsed.lower() in ("true", "wahr", "1", "ja")
    else:
        student_bool = bool(parsed)

    correct = student_bool == correct_answer
    points = max_points if correct else 0

    if correct:
        feedback = qdata.get("feedback_true", "Richtig!") if correct_answer else qdata.get("feedback_false", "Richtig!")
    else:
        feedback = qdata.get("feedback_false", "Falsch.") if correct_answer else qdata.get("feedback_true", "Falsch.")

    return {"points": points, "correct": correct, "feedback": feedback}


def _grade_numerical(qdata: dict, student_answer: str, max_points: int) -> dict:
    answers = qdata.get("answers", [])
    parsed = _parse_answer(student_answer)

    try:
        student_value = float(str(parsed).replace(",", "."))
    except (ValueError, TypeError):
        return {"points": 0, "correct": False, "feedback": "Keine gültige Zahl eingegeben."}

    best_fraction = 0
    best_feedback = "Leider falsch."

    for ans in answers:
        value = ans.get("value", 0)
        tolerance = ans.get("tolerance", 0)
        fraction = ans.get("fraction", 100)

        if abs(student_value - value) <= tolerance:
            if fraction > best_fraction:
                best_fraction = fraction
                best_feedback = ans.get("feedback", "Richtig!" if fraction >= 100 else "Teilweise richtig.")

    points = round(max_points * best_fraction / 100, 2)
    correct = best_fraction >= 100

    return {"points": points, "correct": correct, "feedback": best_feedback}


def _grade_matching(qdata: dict, student_answer: str, max_points: int) -> dict:
    pairs = qdata.get("pairs", [])
    if not pairs:
        return {"points": 0, "correct": False, "feedback": "Keine Paare definiert."}

    selected = _parse_answer(student_answer)
    if isinstance(selected, list):
        # Convert list format [[0,1],[1,0]] to dict format {"0": val, "1": val}
        try:
            selected = {str(i): v for i, v in enumerate(selected)}
        except (TypeError, ValueError):
            return {"points": 0, "correct": False, "feedback": "Ungültiges Antwortformat."}
    if not isinstance(selected, dict):
        return {"points": 0, "correct": False, "feedback": "Ungültiges Antwortformat."}

    correct_count = 0
    for i, pair in enumerate(pairs):
        student_match = selected.get(str(i), "")
        if student_match == pair.get("answer", ""):
            correct_count += 1

    fraction = correct_count / len(pairs)
    points = round(max_points * fraction, 2)
    correct = correct_count == len(pairs)

    if correct:
        feedback = "Alle Zuordnungen richtig!"
    elif correct_count > 0:
        feedback = f"{correct_count} von {len(pairs)} Zuordnungen richtig."
    else:
        feedback = "Keine Zuordnung richtig."

    return {"points": points, "correct": correct, "feedback": feedback}


def _grade_ordering(qdata: dict, student_answer: str, max_points: int) -> dict:
    items = qdata.get("items", [])
    if not items:
        return {"points": 0, "correct": False, "feedback": "Keine Elemente definiert."}

    selected = _parse_answer(student_answer)
    if not isinstance(selected, list):
        return {"points": 0, "correct": False, "feedback": "Ungültiges Antwortformat."}

    # Correct order is [0, 1, 2, ..., n-1]
    correct_count = 0
    for i, idx in enumerate(selected):
        if idx == i:
            correct_count += 1

    fraction = correct_count / len(items)
    points = round(max_points * fraction, 2)
    correct = correct_count == len(items)

    if correct:
        feedback = "Reihenfolge korrekt!"
    elif correct_count > 0:
        feedback = f"{correct_count} von {len(items)} Elementen an der richtigen Position."
    else:
        feedback = "Reihenfolge nicht korrekt."

    return {"points": points, "correct": correct, "feedback": feedback}


def _grade_cloze(qdata: dict, student_answer: str, max_points: int) -> dict:
    """Grade cloze/multianswer questions.

    question_data should contain 'gaps' - a list of gap definitions:
    [
        {"type": "shortanswer", "answers": [{"text": "Paris", "fraction": 100}]},
        {"type": "multichoice", "answers": [{"text": "Option A", "fraction": 100}, ...]}
    ]
    """
    gaps = qdata.get("gaps", [])
    if not gaps:
        return {"points": 0, "correct": False, "feedback": "Keine Lücken definiert."}

    student_answers = _parse_answer(student_answer)
    if not isinstance(student_answers, list):
        return {"points": 0, "correct": False, "feedback": "Ungültiges Antwortformat."}

    total_fraction = 0
    gap_count = len(gaps)

    for i, gap in enumerate(gaps):
        if i >= len(student_answers):
            continue

        sa = student_answers[i]
        gap_type = gap.get("type", "shortanswer")
        gap_answers = gap.get("answers", [])

        if gap_type in ("shortanswer", "sa"):
            # Text comparison
            usecase = gap.get("usecase", False)
            best = 0
            for ans in gap_answers:
                expected = ans.get("text", "")
                if usecase:
                    match = str(sa) == expected
                else:
                    match = str(sa).lower().strip() == expected.lower().strip()
                if match:
                    best = max(best, ans.get("fraction", 100))
            total_fraction += best

        elif gap_type in ("multichoice", "mc"):
            # Index-based selection
            try:
                idx = int(sa)
                if 0 <= idx < len(gap_answers):
                    total_fraction += gap_answers[idx].get("fraction", 0)
            except (ValueError, TypeError):
                pass

        elif gap_type == "numerical":
            try:
                val = float(str(sa).replace(",", "."))
                best = 0
                for ans in gap_answers:
                    if abs(val - ans.get("value", 0)) <= ans.get("tolerance", 0):
                        best = max(best, ans.get("fraction", 100))
                total_fraction += best
            except (ValueError, TypeError):
                pass

    avg_fraction = total_fraction / gap_count if gap_count > 0 else 0
    avg_fraction = max(0, min(100, avg_fraction))
    points = round(max_points * avg_fraction / 100, 2)
    correct = avg_fraction >= 100

    correct_gaps = sum(1 for i, gap in enumerate(gaps)
                       if i < len(student_answers) and _is_gap_correct(gap, student_answers[i]))

    if correct:
        feedback = "Alle Lücken richtig!"
    elif correct_gaps > 0:
        feedback = f"{correct_gaps} von {gap_count} Lücken richtig."
    else:
        feedback = "Keine Lücke richtig."

    return {"points": points, "correct": correct, "feedback": feedback}


def _is_gap_correct(gap: dict, student_answer) -> bool:
    """Check if a single gap answer is fully correct."""
    gap_answers = gap.get("answers", [])
    gap_type = gap.get("type", "shortanswer")

    if gap_type in ("shortanswer", "sa"):
        usecase = gap.get("usecase", False)
        for ans in gap_answers:
            if ans.get("fraction", 0) >= 100:
                expected = ans.get("text", "")
                if usecase:
                    if str(student_answer) == expected:
                        return True
                else:
                    if str(student_answer).lower().strip() == expected.lower().strip():
                        return True
    elif gap_type in ("multichoice", "mc"):
        try:
            idx = int(student_answer)
            if 0 <= idx < len(gap_answers) and gap_answers[idx].get("fraction", 0) >= 100:
                return True
        except (ValueError, TypeError):
            pass
    elif gap_type == "numerical":
        try:
            val = float(str(student_answer).replace(",", "."))
            for ans in gap_answers:
                if ans.get("fraction", 0) >= 100 and abs(val - ans.get("value", 0)) <= ans.get("tolerance", 0):
                    return True
        except (ValueError, TypeError):
            pass
    return False


def _grade_coding(qdata: dict, student_answer: str, max_points: int) -> dict:
    """Grade coding tasks by validating test results submitted from the browser."""
    parsed = _parse_answer(student_answer)
    if not isinstance(parsed, dict):
        return {"points": 0, "correct": False, "feedback": "Keine Antwort eingereicht."}

    language = qdata.get("language", "javascript")

    # HTML/CSS has no automated tests — should be graded by AI
    if language == "html":
        return {"points": 0, "correct": False, "feedback": "Manuelle Bewertung erforderlich."}

    code = parsed.get("code", "")
    if not code.strip():
        return {"points": 0, "correct": False, "feedback": "Kein Code eingereicht."}

    test_results = parsed.get("test_results", [])
    test_cases = qdata.get("test_cases", [])

    if language == "sql":
        # SQL: compare submitted result against expected
        sql_expected = qdata.get("sql_expected")
        if sql_expected and test_results:
            # test_results[0] contains {passed, actual_output}
            passed = test_results[0].get("passed", False) if test_results else False
            points = max_points if passed else 0
            feedback = "SQL-Query liefert das erwartete Ergebnis." if passed else "SQL-Query liefert nicht das erwartete Ergebnis."
            return {"points": points, "correct": passed, "feedback": feedback}
        return {"points": 0, "correct": False, "feedback": "Keine Testergebnisse."}

    # JS/Python/TypeScript: count passed test cases
    if not test_cases:
        return {"points": max_points if test_results else 0, "correct": True, "feedback": "Keine Testfaelle definiert."}

    total = len(test_cases)
    passed = sum(1 for tr in test_results if tr.get("passed", False))
    fraction = passed / total if total > 0 else 0
    points = round(max_points * fraction, 2)
    correct = passed == total

    if correct:
        feedback = f"Alle {total} Tests bestanden!"
    elif passed > 0:
        feedback = f"{passed} von {total} Tests bestanden."
    else:
        feedback = "Kein Test bestanden."

    return {"points": points, "correct": correct, "feedback": feedback}
