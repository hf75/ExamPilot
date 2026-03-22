from pydantic import BaseModel, field_validator
from typing import Optional, Any
from datetime import datetime

VALID_TASK_TYPES = {
    "multichoice", "truefalse", "shortanswer", "numerical",
    "matching", "ordering", "cloze", "essay", "description",
    "drawing", "webapp", "feynman", "scenario", "coding", "photo",
}


# --- Auth ---
class LoginRequest(BaseModel):
    password: str

class SetupPasswordRequest(BaseModel):
    password: str

class TokenResponse(BaseModel):
    token: str


# --- Tasks ---
class TaskCreate(BaseModel):
    title: str
    text: str
    hint: Optional[str] = None
    solution: Optional[str] = None
    topic: Optional[str] = None
    task_type: str = "essay"
    points: int = 1
    parent_task_id: Optional[int] = None
    source: Optional[str] = "manual"
    question_data: Optional[dict[str, Any]] = None
    pool_id: Optional[int] = None

    @field_validator("points")
    @classmethod
    def validate_points(cls, v):
        if v < 0:
            raise ValueError("Punkte dürfen nicht negativ sein")
        return v

    @field_validator("task_type")
    @classmethod
    def validate_task_type(cls, v):
        if v not in VALID_TASK_TYPES:
            raise ValueError(f"Ungültiger Aufgabentyp: {v}")
        return v

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    text: Optional[str] = None
    hint: Optional[str] = None
    solution: Optional[str] = None
    topic: Optional[str] = None
    task_type: Optional[str] = None
    points: Optional[int] = None
    question_data: Optional[dict[str, Any]] = None
    pool_id: Optional[int] = None

    @field_validator("points")
    @classmethod
    def validate_points(cls, v):
        if v is not None and v < 0:
            raise ValueError("Punkte dürfen nicht negativ sein")
        return v

    @field_validator("task_type")
    @classmethod
    def validate_task_type(cls, v):
        if v is not None and v not in VALID_TASK_TYPES:
            raise ValueError(f"Ungültiger Aufgabentyp: {v}")
        return v

class TaskOut(BaseModel):
    id: int
    title: str
    text: str
    hint: Optional[str] = None
    solution: Optional[str] = None
    topic: Optional[str] = None
    task_type: str
    points: int
    parent_task_id: Optional[int] = None
    source: Optional[str] = None
    question_data: Optional[dict[str, Any]] = None
    pool_id: Optional[int] = None
    created_at: Optional[str] = None


# --- Task Pools ---
class PoolCreate(BaseModel):
    name: str

class PoolUpdate(BaseModel):
    name: str

class PoolOut(BaseModel):
    id: int
    name: str
    task_count: Optional[int] = 0
    created_at: Optional[str] = None


# --- Exams ---
class ExamCreate(BaseModel):
    title: str
    description: Optional[str] = None
    class_name: Optional[str] = None
    date: Optional[str] = None
    duration_minutes: Optional[int] = None
    password: Optional[str] = None
    shuffle_tasks: Optional[bool] = False
    grading_scale: Optional[list[dict]] = None

    @field_validator("grading_scale")
    @classmethod
    def validate_grading_scale(cls, v):
        if v is None:
            return v
        for entry in v:
            if "percent" not in entry or "grade" not in entry or "label" not in entry:
                raise ValueError("Jeder Notenschlüssel-Eintrag braucht percent, grade und label")
        return v

class ExamUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    class_name: Optional[str] = None
    date: Optional[str] = None
    duration_minutes: Optional[int] = None
    status: Optional[str] = None
    show_results_immediately: Optional[bool] = None
    password: Optional[str] = None
    shuffle_tasks: Optional[bool] = None
    grading_scale: Optional[list[dict]] = None

class ExamOut(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    class_name: Optional[str] = None
    date: Optional[str] = None
    duration_minutes: Optional[int] = None
    status: str
    show_results_immediately: Optional[bool] = True
    password: Optional[str] = None
    shuffle_tasks: Optional[bool] = False
    grading_scale: Optional[list[dict]] = None
    created_at: Optional[str] = None


# --- Students ---
class StudentJoinRequest(BaseModel):
    name: str
    exam_id: int
    password: Optional[str] = None

class StudentSessionOut(BaseModel):
    session_id: int
    student_name: str
    exam_title: str
    tasks: list


# --- Answers ---
class AnswerSubmit(BaseModel):
    session_id: int
    task_id: int
    student_answer: str

class AnswerAdjust(BaseModel):
    points_awarded: float
    feedback: Optional[str] = None

class AnswerDispute(BaseModel):
    answer_id: int
    reason: Optional[str] = None

class HeartbeatRequest(BaseModel):
    session_id: int
    current_task_id: Optional[int] = None

class ExplainRequest(BaseModel):
    answer_id: int

class FeynmanChatRequest(BaseModel):
    session_id: int
    task_id: int
    messages: list[dict]

class ScenarioNextRequest(BaseModel):
    session_id: int
    task_id: int
    transcript: list[dict]
    chosen_option: int | None = None


class DuelCreateRequest(BaseModel):
    mode: str = "duel"
    pool_ids: list[int]
    total_rounds: int = 5
    timer_seconds: int = 20
