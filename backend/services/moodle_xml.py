"""
Moodle XML import and export for exam tasks.
Supports: multichoice, truefalse, shortanswer, numerical, matching, ordering, cloze, essay, description.
"""

import re
import html
import xml.etree.ElementTree as ET
from xml.dom import minidom


def _text(el, tag, default=""):
    """Get text content from a child element, stripping CDATA/HTML."""
    child = el.find(tag)
    if child is None:
        return default
    # Check for nested <text> element (Moodle format)
    text_el = child.find("text")
    if text_el is not None and text_el.text:
        return text_el.text.strip()
    return (child.text or default).strip()


def _float(el, tag, default=0.0):
    try:
        return float(_text(el, tag, str(default)))
    except (ValueError, TypeError):
        return default


def parse_moodle_xml(xml_content: str) -> list[dict]:
    """Parse Moodle XML and return list of task dicts with question_data."""
    try:
        root = ET.fromstring(xml_content)
    except ET.ParseError as e:
        raise ValueError(f"Ungültiges XML: {e}")
    tasks = []

    for q in root.findall(".//question"):
        qtype = q.get("type", "")
        if qtype in ("category",):
            continue

        name = _text(q, "name")
        text = _text(q, "questiontext")
        hint = _text(q, "generalfeedback")
        points_str = _text(q, "defaultgrade", "1")
        try:
            points = max(1, int(float(points_str)))
        except ValueError:
            points = 1

        task = {
            "title": name,
            "text": text,
            "hint": hint,
            "topic": "",
            "points": points,
            "question_data": {},
        }

        if qtype == "multichoice":
            task["task_type"] = "multichoice"
            single = _text(q, "single", "true").lower() == "true"
            shuffle = _text(q, "shuffleanswers", "true").lower() in ("true", "1")
            answers = []
            for ans in q.findall("answer"):
                fraction = float(ans.get("fraction", "0"))
                answers.append({
                    "text": _text(ans, ".", ans.text or ""),
                    "fraction": fraction,
                    "feedback": _text(ans, "feedback"),
                })
                # Fix: answer text might be in <text> child
                text_el = ans.find("text")
                if text_el is not None and text_el.text:
                    answers[-1]["text"] = text_el.text.strip()
            task["question_data"] = {"single": single, "shuffle": shuffle, "answers": answers}

        elif qtype == "truefalse":
            task["task_type"] = "truefalse"
            correct = True
            fb_true = ""
            fb_false = ""
            for ans in q.findall("answer"):
                fraction = float(ans.get("fraction", "0"))
                text_val = _text(ans, ".", ans.text or "")
                text_el = ans.find("text")
                if text_el is not None and text_el.text:
                    text_val = text_el.text.strip()
                fb = _text(ans, "feedback")
                if text_val.lower() in ("true", "wahr"):
                    fb_true = fb
                    if fraction > 0:
                        correct = True
                else:
                    fb_false = fb
                    if fraction > 0:
                        correct = False
            task["question_data"] = {
                "correct_answer": correct,
                "feedback_true": fb_true,
                "feedback_false": fb_false,
            }

        elif qtype == "shortanswer":
            task["task_type"] = "shortanswer"
            answers = []
            for ans in q.findall("answer"):
                fraction = float(ans.get("fraction", "0"))
                text_val = _text(ans, ".", ans.text or "")
                text_el = ans.find("text")
                if text_el is not None and text_el.text:
                    text_val = text_el.text.strip()
                answers.append({"text": text_val, "fraction": fraction})
            task["question_data"] = {"answers": answers}

        elif qtype == "numerical":
            task["task_type"] = "numerical"
            answers = []
            for ans in q.findall("answer"):
                fraction = float(ans.get("fraction", "0"))
                text_val = _text(ans, ".", ans.text or "")
                text_el = ans.find("text")
                if text_el is not None and text_el.text:
                    text_val = text_el.text.strip()
                try:
                    value = float(text_val)
                except ValueError:
                    value = 0
                tolerance = _float(ans, "tolerance", 0)
                answers.append({
                    "value": value,
                    "tolerance": tolerance,
                    "fraction": fraction,
                    "feedback": _text(ans, "feedback"),
                })
            task["question_data"] = {"answers": answers}

        elif qtype == "matching":
            task["task_type"] = "matching"
            shuffle = _text(q, "shuffleanswers", "true").lower() in ("true", "1")
            pairs = []
            for sub in q.findall("subquestion"):
                question_text = _text(sub, "text", sub.text or "")
                text_el = sub.find("text")
                if text_el is not None and text_el.text:
                    question_text = text_el.text.strip()
                answer_el = sub.find("answer")
                answer_text = ""
                if answer_el is not None:
                    answer_text_el = answer_el.find("text")
                    if answer_text_el is not None and answer_text_el.text:
                        answer_text = answer_text_el.text.strip()
                    elif answer_el.text:
                        answer_text = answer_el.text.strip()
                if question_text:
                    pairs.append({"question": question_text, "answer": answer_text})
            task["question_data"] = {"shuffle": shuffle, "pairs": pairs}

        elif qtype == "ordering":
            task["task_type"] = "ordering"
            items = []
            for item in q.findall(".//item") or q.findall("answer"):
                text_el = item.find("text")
                if text_el is not None and text_el.text:
                    items.append(text_el.text.strip())
                elif item.text:
                    items.append(item.text.strip())
            task["question_data"] = {"items": items}

        elif qtype in ("multianswer", "cloze"):
            task["task_type"] = "cloze"
            # Cloze questions embed answers in the text via {1:TYPE:...} syntax
            # We keep the text as-is and parse gaps
            gaps = []
            pattern = r"\{(\d+):([A-Z]+):(.+?)\}"
            for match in re.finditer(pattern, text):
                gap_type_raw = match.group(2).lower()
                gap_answers_raw = match.group(3)
                gap_type = "shortanswer"
                if "multichoice" in gap_type_raw or gap_type_raw == "mc":
                    gap_type = "multichoice"
                elif "numerical" in gap_type_raw:
                    gap_type = "numerical"
                gap_answers = []
                for part in gap_answers_raw.split("~"):
                    part = part.strip()
                    if not part:
                        continue
                    frac = 0
                    if part.startswith("="):
                        frac = 100
                        part = part[1:]
                    elif part.startswith("%"):
                        try:
                            end = part.index("%", 1)
                            frac = float(part[1:end])
                            part = part[end + 1:]
                        except (ValueError, IndexError):
                            frac = 0
                    fb = ""
                    if "#" in part:
                        part, fb = part.split("#", 1)
                    gap_answers.append({"text": part.strip(), "fraction": frac, "feedback": fb.strip()})
                gaps.append({"type": gap_type, "answers": gap_answers})
            task["question_data"] = {"gaps": gaps}
            # Replace Moodle cloze syntax with [[n]] markers
            counter = [0]
            def replace_gap(m):
                counter[0] += 1
                return f"[[{counter[0]}]]"
            task["text"] = re.sub(pattern, replace_gap, text)

        elif qtype == "essay":
            task["task_type"] = "essay"
            grader_info = _text(q, "graderinfo")
            task["question_data"] = {"grader_info": grader_info}

        elif qtype == "description":
            task["task_type"] = "description"
            task["question_data"] = {}

        else:
            # Unknown type, treat as essay
            task["task_type"] = "essay"
            task["question_data"] = {}

        tasks.append(task)

    return tasks


def export_moodle_xml(tasks: list[dict]) -> str:
    """Export tasks to Moodle XML format."""
    root = ET.Element("quiz")

    for task in tasks:
        task_type = task.get("task_type", "essay")
        qd = task.get("question_data", {})

        # Map to Moodle question type
        moodle_type = task_type
        if task_type == "cloze":
            moodle_type = "cloze"

        q = ET.SubElement(root, "question", type=moodle_type)

        # Name
        name = ET.SubElement(q, "name")
        ET.SubElement(name, "text").text = task.get("title", "")

        # Question text
        qt = ET.SubElement(q, "questiontext", format="html")
        text_content = task.get("text", "")

        # For cloze, convert [[n]] markers back to Moodle syntax
        if task_type == "cloze":
            gaps = qd.get("gaps", [])
            def replace_marker(m):
                idx = int(m.group(1)) - 1
                if idx < 0 or idx >= len(gaps):
                    return m.group(0)
                gap = gaps[idx]
                gap_type = gap.get("type", "shortanswer").upper()
                if gap_type == "MC":
                    gap_type = "MULTICHOICE"
                elif gap_type == "SHORTANSWER":
                    gap_type = "SHORTANSWER"
                elif gap_type == "NUMERICAL":
                    gap_type = "NUMERICAL"
                parts = []
                for ans in gap.get("answers", []):
                    prefix = ""
                    if ans.get("fraction", 0) == 100:
                        prefix = "="
                    elif ans.get("fraction", 0) > 0:
                        prefix = f"%{int(ans['fraction'])}%"
                    fb = f"#{ans['feedback']}" if ans.get("feedback") else ""
                    parts.append(f"{prefix}{ans.get('text', '')}{fb}")
                return "{1:" + gap_type + ":" + "~".join(parts) + "}"
            text_content = re.sub(r"\[\[(\d+)\]\]", replace_marker, text_content)

        ET.SubElement(qt, "text").text = text_content

        # Default grade
        ET.SubElement(q, "defaultgrade").text = str(task.get("points", 1))

        # General feedback
        gf = ET.SubElement(q, "generalfeedback", format="html")
        ET.SubElement(gf, "text").text = task.get("hint", "")

        # Type-specific elements
        if task_type == "multichoice":
            ET.SubElement(q, "single").text = str(qd.get("single", True)).lower()
            ET.SubElement(q, "shuffleanswers").text = "1" if qd.get("shuffle", True) else "0"
            for ans in qd.get("answers", []):
                a = ET.SubElement(q, "answer", fraction=str(ans.get("fraction", 0)))
                ET.SubElement(a, "text").text = ans.get("text", "")
                fb = ET.SubElement(a, "feedback", format="html")
                ET.SubElement(fb, "text").text = ans.get("feedback", "")

        elif task_type == "truefalse":
            # True answer
            frac_true = "100" if qd.get("correct_answer", True) else "0"
            frac_false = "0" if qd.get("correct_answer", True) else "100"
            a_true = ET.SubElement(q, "answer", fraction=frac_true)
            ET.SubElement(a_true, "text").text = "true"
            fb_t = ET.SubElement(a_true, "feedback", format="html")
            ET.SubElement(fb_t, "text").text = qd.get("feedback_true", "")
            a_false = ET.SubElement(q, "answer", fraction=frac_false)
            ET.SubElement(a_false, "text").text = "false"
            fb_f = ET.SubElement(a_false, "feedback", format="html")
            ET.SubElement(fb_f, "text").text = qd.get("feedback_false", "")

        elif task_type == "shortanswer":
            for ans in qd.get("answers", []):
                a = ET.SubElement(q, "answer", fraction=str(ans.get("fraction", 0)))
                ET.SubElement(a, "text").text = ans.get("text", "")

        elif task_type == "numerical":
            for ans in qd.get("answers", []):
                a = ET.SubElement(q, "answer", fraction=str(ans.get("fraction", 0)))
                ET.SubElement(a, "text").text = str(ans.get("value", 0))
                ET.SubElement(a, "tolerance").text = str(ans.get("tolerance", 0))
                if ans.get("feedback"):
                    fb = ET.SubElement(a, "feedback", format="html")
                    ET.SubElement(fb, "text").text = ans.get("feedback", "")

        elif task_type == "matching":
            ET.SubElement(q, "shuffleanswers").text = "1" if qd.get("shuffle", True) else "0"
            for pair in qd.get("pairs", []):
                sub = ET.SubElement(q, "subquestion", format="html")
                ET.SubElement(sub, "text").text = pair.get("question", "")
                ans = ET.SubElement(sub, "answer")
                ET.SubElement(ans, "text").text = pair.get("answer", "")

        elif task_type == "ordering":
            for item_text in qd.get("items", []):
                item = ET.SubElement(q, "item")
                ET.SubElement(item, "text").text = item_text

        elif task_type == "essay":
            gi = ET.SubElement(q, "graderinfo", format="html")
            ET.SubElement(gi, "text").text = qd.get("grader_info", "")

        # description and cloze don't need extra elements

    # Pretty print
    rough = ET.tostring(root, encoding="unicode", xml_declaration=False)
    try:
        dom = minidom.parseString(rough)
        return dom.toprettyxml(indent="  ", encoding=None)
    except Exception:
        # Fallback: return raw XML if pretty-printing fails
        return '<?xml version="1.0" ?>\n' + rough
