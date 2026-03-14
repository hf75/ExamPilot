from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime

VALID_TASK_TYPES = {
    "multichoice", "truefalse", "shortanswer", "numerical",
    "matching", "ordering", "cloze", "essay", "description",
    "drawing",
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

class ExamUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    class_name: Optional[str] = None
    date: Optional[str] = None
    duration_minutes: Optional[int] = None
    status: Optional[str] = None
    show_results_immediately: Optional[bool] = None
    password: Optional[str] = None

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
