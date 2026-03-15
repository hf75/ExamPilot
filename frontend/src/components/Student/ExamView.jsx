import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import QuestionRenderer from "../Questions/QuestionRenderer";
import TaskNav from "./TaskNav";
import Markdown from "../Markdown";

export default function ExamView() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);
  const [gradingTasks, setGradingTasks] = useState(new Set());
  const autoSaveTimer = useRef(null);
  const gradingPollTimer = useRef(null);

  useEffect(() => {
    loadSession();
  }, [sessionId]);

  // Timer
  useEffect(() => {
    if (!session?.duration_minutes || !session?.started_at) return;

    function updateTimer() {
      const start = new Date(session.started_at + "Z").getTime();
      const end = start + session.duration_minutes * 60 * 1000;
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((end - now) / 1000));
      setTimeLeft(remaining);

      if (remaining <= 0) {
        handleSubmitExam();
      }
    }

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [session?.duration_minutes, session?.started_at]);

  // Heartbeat for live dashboard
  useEffect(() => {
    if (!session || session.status !== "in_progress") return;
    const tasks = session.tasks || [];
    const currentTask = tasks[currentTaskIndex];

    function sendHeartbeat() {
      api.post("/api/student/heartbeat", {
        session_id: parseInt(sessionId),
        current_task_id: currentTask?.id || null,
      }).catch(() => {});
    }

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 15000);
    return () => clearInterval(interval);
  }, [sessionId, currentTaskIndex, session?.status]);

  async function loadSession() {
    try {
      const data = await api.get(`/api/student/session/${sessionId}`);
      setSession(data);

      // Load existing answers into state
      const answerMap = {};
      for (const a of data.answers) {
        answerMap[a.task_id] = a.student_answer || "";
      }
      setAnswers(answerMap);
    } catch (err) {
      alert(err.message);
      navigate("/");
    } finally {
      setLoading(false);
    }
  }

  // Poll grading status while any task is pending
  useEffect(() => {
    if (gradingTasks.size === 0) return;

    async function pollStatus() {
      try {
        const statuses = await api.get(`/api/student/grading-status/${sessionId}`);
        const stillPending = new Set();
        for (const [taskId, status] of Object.entries(statuses)) {
          if (status === "pending") {
            stillPending.add(parseInt(taskId));
          }
        }
        setGradingTasks(stillPending);
      } catch {
        // ignore polling errors
      }
    }

    gradingPollTimer.current = setInterval(pollStatus, 2000);
    return () => clearInterval(gradingPollTimer.current);
  }, [gradingTasks.size, sessionId]);

  // Auto-save answer (debounced)
  const autoSave = useCallback(
    async (taskId, answer) => {
      try {
        const result = await api.post("/api/student/answer", {
          session_id: parseInt(sessionId),
          task_id: taskId,
          student_answer: answer,
        });
        if (result.grading_status === "pending") {
          setGradingTasks((prev) => new Set([...prev, taskId]));
        }
      } catch (err) {
        if (err.status === 409) {
          // Task is being graded, ignore
        }
      }
    },
    [sessionId]
  );

  // Trigger drawing grading when navigating away from a drawing task
  const triggerDrawingGrade = useCallback(
    async (taskId, answer) => {
      if (!answer || !answer.startsWith("data:image")) return;
      try {
        const result = await api.post("/api/student/grade-drawing", {
          session_id: parseInt(sessionId),
          task_id: taskId,
          student_answer: answer,
        });
        if (result.grading_status === "pending") {
          setGradingTasks((prev) => new Set([...prev, taskId]));
        }
      } catch {
        // ignore
      }
    },
    [sessionId]
  );

  function handleNavigate(newIndex) {
    // If leaving a drawing task, save immediately then trigger grading
    const currentT = tasks[currentTaskIndex];
    if (currentT?.task_type === "drawing" && answers[currentT.id]) {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSave(currentT.id, answers[currentT.id]).then(() => {
        triggerDrawingGrade(currentT.id, answers[currentT.id]);
      });
    }
    setCurrentTaskIndex(newIndex);
  }

  function handleAnswerChange(taskId, value) {
    if (gradingTasks.has(taskId)) return; // locked while grading
    setAnswers((prev) => ({ ...prev, [taskId]: value }));

    // Debounced auto-save
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => autoSave(taskId, value), 1500);
  }

  async function handleSubmitExam() {
    setSubmitting(true);
    try {
      // Cancel any pending auto-save timer
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);

      // Save all answers that are not currently being graded
      const savePromises = Object.entries(answers)
        .filter(([taskId]) => !gradingTasks.has(parseInt(taskId)))
        .map(([taskId, answer]) =>
          api.post("/api/student/answer", {
            session_id: parseInt(sessionId),
            task_id: parseInt(taskId),
            student_answer: answer,
          }).catch(() => {})
        );
      await Promise.all(savePromises);

      // Wait for any pending AI grading to finish (poll up to 30s)
      if (gradingTasks.size > 0) {
        for (let i = 0; i < 15; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const statuses = await api.get(`/api/student/grading-status/${sessionId}`);
          const stillPending = Object.values(statuses).some((s) => s === "pending");
          if (!stillPending) break;
        }
      }

      await api.post(`/api/student/submit/${sessionId}`);
      navigate(`/results/${sessionId}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="exam-loading">
        <p>Prüfung wird geladen...</p>
      </div>
    );
  }

  if (!session || session.status !== "in_progress") {
    return (
      <div className="exam-loading">
        <p>Diese Prüfung ist nicht mehr aktiv.</p>
        <button className="btn-primary-sm" onClick={() => navigate("/")}>
          Zurück
        </button>
      </div>
    );
  }

  const tasks = session.tasks || [];
  const currentTask = tasks[currentTaskIndex];
  const answeredCount = Object.keys(answers).filter(
    (k) => answers[k] && answers[k] !== "" && answers[k] !== "[]" && answers[k] !== "{}"
  ).length;

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  return (
    <div className="exam-view">
      <div className="exam-header-bar">
        <div className="exam-header-info">
          <h2>{session.exam_title}</h2>
          <span className="exam-student-name">{session.student_name}</span>
        </div>
        <div className="exam-header-actions">
          {timeLeft !== null && (
            <span
              className={`exam-timer ${timeLeft < 300 ? "timer-warning" : ""}`}
            >
              {formatTime(timeLeft)}
            </span>
          )}
          <span className="exam-progress">
            {answeredCount}/{tasks.length} beantwortet
          </span>
          <button
            className="btn-submit-exam"
            onClick={() => setShowConfirm(true)}
            disabled={submitting}
          >
            Abgeben
          </button>
        </div>
      </div>

      <div className="exam-body">
        <TaskNav
          tasks={tasks}
          currentIndex={currentTaskIndex}
          answers={answers}
          gradingTasks={gradingTasks}
          onSelect={handleNavigate}
        />

        <div className={`exam-main ${currentTask?.task_type === "drawing" ? "exam-main-drawing" : ""}`}>
          {currentTask && currentTask.task_type === "drawing" ? (
                <div className="drawing-split-layout">
                  <div className="drawing-split-left">
                    <div className="task-header-exam">
                      <h3>
                        {currentTask.title}{" "}
                        <span className="task-points-badge">
                          {currentTask.points} Pkt.
                        </span>
                      </h3>
                    </div>
                    <div className="task-text-exam"><Markdown>{currentTask.text}</Markdown></div>

                    {gradingTasks.has(currentTask.id) && (
                      <div className="grading-lock-banner">
                        <span className="grading-spinner"></span>
                        Antwort wird bewertet — bitte warten...
                      </div>
                    )}

                    <div className="task-nav-buttons">
                      <button
                        className="btn-secondary"
                        onClick={() =>
                          handleNavigate(Math.max(0, currentTaskIndex - 1))
                        }
                        disabled={currentTaskIndex === 0}
                      >
                        &larr; Vorherige
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() =>
                          handleNavigate(
                            Math.min(tasks.length - 1, currentTaskIndex + 1)
                          )
                        }
                        disabled={currentTaskIndex === tasks.length - 1}
                      >
                        Nächste &rarr;
                      </button>
                    </div>
                  </div>
                  <div className="drawing-split-right">
                    <QuestionRenderer
                      task={currentTask}
                      answer={answers[currentTask.id] || ""}
                      onChange={(value) => handleAnswerChange(currentTask.id, value)}
                      disabled={gradingTasks.has(currentTask.id)}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="task-header-exam">
                    <h3>
                      {currentTask.title}{" "}
                      {currentTask.task_type !== "description" && (
                        <span className="task-points-badge">
                          {currentTask.points} Pkt.
                        </span>
                      )}
                    </h3>
                  </div>
                  {currentTask.task_type !== "cloze" && (
                    <div className="task-text-exam"><Markdown>{currentTask.text}</Markdown></div>
                  )}

                  {gradingTasks.has(currentTask.id) && (
                    <div className="grading-lock-banner">
                      <span className="grading-spinner"></span>
                      Antwort wird bewertet — bitte warten...
                    </div>
                  )}

                  <QuestionRenderer
                    task={currentTask}
                    answer={answers[currentTask.id] || ""}
                    onChange={(value) => handleAnswerChange(currentTask.id, value)}
                    disabled={gradingTasks.has(currentTask.id)}
                  />

                  <div className="task-nav-buttons">
                    <button
                      className="btn-secondary"
                      onClick={() =>
                        handleNavigate(Math.max(0, currentTaskIndex - 1))
                      }
                      disabled={currentTaskIndex === 0}
                    >
                      &larr; Vorherige
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() =>
                        handleNavigate(
                          Math.min(tasks.length - 1, currentTaskIndex + 1)
                        )
                      }
                      disabled={currentTaskIndex === tasks.length - 1}
                    >
                      Nächste &rarr;
                    </button>
                  </div>
                </>
              )
          }
        </div>
      </div>

      {showConfirm && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3>Klassenarbeit abgeben?</h3>
              <button
                className="btn-close"
                onClick={() => setShowConfirm(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p>
                Wirklich abgeben? Du kannst danach nichts mehr ändern.
              </p>
              <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
                {answeredCount} von {tasks.length} Aufgaben beantwortet.
              </p>
              <div className="modal-actions" style={{ marginTop: 20 }}>
                <button
                  className="btn-secondary"
                  onClick={() => setShowConfirm(false)}
                >
                  Abbrechen
                </button>
                <button
                  className="btn-primary-sm"
                  onClick={handleSubmitExam}
                  disabled={submitting}
                >
                  {submitting ? "..." : "Endgültig abgeben"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
