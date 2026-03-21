IHK_GRADING_SCALE = [
    (90, "1", "sehr gut"),
    (75, "2", "gut"),
    (60, "3", "befriedigend"),
    (45, "4", "ausreichend"),
    (25, "5", "mangelhaft"),
    (0, "6", "ungenügend"),
]

LINEAR_GRADING_SCALE = [
    (85, "1", "sehr gut"),
    (70, "2", "gut"),
    (55, "3", "befriedigend"),
    (40, "4", "ausreichend"),
    (20, "5", "mangelhaft"),
    (0, "6", "ungenügend"),
]


def parse_scale(scale_data):
    """Convert JSON grading scale (list of dicts) to tuple list for calculate_grade."""
    if not scale_data:
        return None
    try:
        return [(entry["percent"], str(entry["grade"]), entry["label"]) for entry in scale_data]
    except (KeyError, TypeError):
        return None


def calculate_grade(points, max_points, scale=None):
    if scale is None:
        scale = IHK_GRADING_SCALE
    if max_points <= 0:
        return "6", "ungenügend", 0.0
    clamped_points = max(0, min(points, max_points))
    percent = (clamped_points / max_points) * 100
    for threshold, grade, label in scale:
        if percent >= threshold:
            return grade, label, round(percent, 1)
    return "6", "ungenügend", round(percent, 1)
