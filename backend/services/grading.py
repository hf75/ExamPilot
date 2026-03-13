IHK_GRADING_SCALE = [
    (90, "1", "sehr gut"),
    (75, "2", "gut"),
    (60, "3", "befriedigend"),
    (45, "4", "ausreichend"),
    (25, "5", "mangelhaft"),
    (0, "6", "ungenügend"),
]


def calculate_grade(points, max_points, scale=None):
    if scale is None:
        scale = IHK_GRADING_SCALE
    if max_points <= 0:
        return "6", "ungenügend", 0.0
    percent = (points / max_points) * 100
    for threshold, grade, label in scale:
        if percent >= threshold:
            return grade, label, round(percent, 1)
    return "6", "ungenügend", round(percent, 1)
