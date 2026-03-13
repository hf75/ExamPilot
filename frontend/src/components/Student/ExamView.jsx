import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import QuestionRenderer from "../Questions/QuestionRenderer";
import TaskNav from "./TaskNav";

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
  const autoSaveTimer = useRef(null);

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

  // Auto-save answer (debounced)
  const autoSave = useCallback(
    async (taskId, answer) => {
      try {
        await api.post("/api/student/answer", {
          session_id: parseInt(sessionId),
          task_id: taskId,
          student_answer: answer,
        });
      } catch {
        // Silent fail for auto-save
      }
    },
    [sessionId]
  );

  function handleAnswerChange(taskId, value) {
    setAnswers((prev) => ({ ...prev, [taskId]: value }));

    // Debounced auto-save
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => autoSave(taskId, value), 1500);
  }

  async function handleSubmitExam() {
    setSubmitting(true);
    try {
      // Save all current answers before submitting
      const savePromises = Object.entries(answers).map(([taskId, answer]) =>
        api.post("/api/student/answer", {
          session_id: parseInt(sessionId),
          task_id: parseInt(taskId),
          student_answer: answer,
        }).catch(() => {})
      );
      await Promise.all(savePromises);

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
          onSelect={setCurrentTaskIndex}
        />

        <div className="exam-main">
          {currentTask && (
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
                <div className="task-text-exam">{currentTask.text}</div>
              )}

              <QuestionRenderer
                task={currentTask}
                answer={answers[currentTask.id] || ""}
                onChange={(value) => handleAnswerChange(currentTask.id, value)}
                disabled={false}
              />

              <div className="task-nav-buttons">
                <button
                  className="btn-secondary"
                  onClick={() =>
                    setCurrentTaskIndex(Math.max(0, currentTaskIndex - 1))
                  }
                  disabled={currentTaskIndex === 0}
                >
                  &larr; Vorherige
                </button>
                <button
                  className="btn-secondary"
                  onClick={() =>
                    setCurrentTaskIndex(
                      Math.min(tasks.length - 1, currentTaskIndex + 1)
                    )
                  }
                  disabled={currentTaskIndex === tasks.length - 1}
                >
                  Nächste &rarr;
                </button>
              </div>
            </>
          )}
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
