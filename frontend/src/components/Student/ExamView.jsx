import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { toast } from "../shared/Toast";
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
  const [saveErrors, setSaveErrors] = useState([]);
  const [flagged, setFlagged] = useState(new Set());
  const [saveStatus, setSaveStatus] = useState(""); // "", "saving", "saved", "error"
  const autoSaveTimer = useRef(null);
  const isSubmittingRef = useRef(false);

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

      if (remaining <= 0 && !isSubmittingRef.current) {
        isSubmittingRef.current = true;
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
      toast.error(err.message);
      navigate("/");
    } finally {
      setLoading(false);
    }
  }

  // Auto-save answer (debounced) — saves only, no grading during exam
  const autoSave = useCallback(
    async (taskId, answer) => {
      setSaveStatus("saving");
      try {
        await api.post("/api/student/answer", {
          session_id: parseInt(sessionId),
          task_id: taskId,
          student_answer: answer,
        });
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus((s) => s === "saved" ? "" : s), 2000);
      } catch {
        setSaveStatus("error");
        toast.error("Antwort konnte nicht gespeichert werden");
      }
    },
    [sessionId]
  );

  function handleNavigate(newIndex) {
    const currentT = tasks[currentTaskIndex];

    // Cancel any pending debounce timer — we save immediately on navigate
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = null;
    }

    // Flush pending answer for current task
    if (currentT && answers[currentT.id]) {
      autoSave(currentT.id, answers[currentT.id]);
    }

    setCurrentTaskIndex(newIndex);
  }

  function toggleFlag(taskId) {
    setFlagged(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }

  function handleAnswerChange(taskId, value) {
    setAnswers((prev) => ({ ...prev, [taskId]: value }));

    // Debounced auto-save
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => autoSave(taskId, value), 1500);
  }

  async function handleSubmitExam() {
    if (submitting) return;
    setSubmitting(true);
    isSubmittingRef.current = true;
    try {
      // Cancel any pending auto-save timer
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);

      // Flush any pending drawing export by triggering canvas export
      document.querySelectorAll(".drawing-canvas").forEach((canvas) => {
        try {
          const dataUrl = canvas.toDataURL("image/png");
          const taskEl = canvas.closest("[data-task-id]");
          if (taskEl) {
            const tid = taskEl.dataset.taskId;
            if (tid) answers[tid] = dataUrl;
          }
        } catch {}
      });

      // Small delay to let Drawing component debounce timers flush
      await new Promise((r) => setTimeout(r, 600));

      // Save all pending answers, track failures
      const failures = [];
      const savePromises = Object.entries(answers)
        .filter(([, answer]) => answer && answer !== "" && answer !== "[]" && answer !== "{}")
        .map(([taskId, answer]) =>
          api.post("/api/student/answer", {
            session_id: parseInt(sessionId),
            task_id: parseInt(taskId),
            student_answer: answer,
          }).catch((err) => { failures.push(taskId); })
        );
      await Promise.all(savePromises);

      if (failures.length > 0) {
        setSaveErrors(failures);
      }

      // Submit — backend grades all AI tasks and calculates points
      await api.post(`/api/student/submit/${sessionId}`);
      navigate(`/results/${sessionId}`);
    } catch (err) {
      toast.error(err.message);
      isSubmittingRef.current = false;
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
          {saveStatus && (
            <span className={`autosave-indicator ${saveStatus}`}>
              {saveStatus === "saving" ? "Speichert..." : saveStatus === "saved" ? "Gespeichert" : "Fehler!"}
            </span>
          )}
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
          flagged={flagged}
          onSelect={handleNavigate}
          onToggleFlag={toggleFlag}
        />

        <div className={`exam-main ${currentTask?.task_type === "drawing" || currentTask?.task_type === "webapp" || currentTask?.task_type === "feynman" || currentTask?.task_type === "scenario" || currentTask?.task_type === "coding" || currentTask?.task_type === "photo" ? "exam-main-drawing" : ""}`}>
          {currentTask && (currentTask.task_type === "drawing" || currentTask.task_type === "webapp" || currentTask.task_type === "feynman" || currentTask.task_type === "scenario") ? (
                <div className="drawing-split-layout">
                  <div className="drawing-split-left">
                    <div className="task-header-exam">
                      <h3>
                        {currentTask.title}{" "}
                        <span className="task-points-badge">
                          {currentTask.points} Pkt.
                        </span>
                      </h3>
                      <button
                        className={`btn-flag ${flagged.has(currentTask.id) ? "flagged" : ""}`}
                        onClick={() => toggleFlag(currentTask.id)}
                        title={flagged.has(currentTask.id) ? "Markierung entfernen" : "Zum Nochmal-Anschauen markieren"}
                      >
                        &#9873; {flagged.has(currentTask.id) ? "Markiert" : "Markieren"}
                      </button>
                    </div>
                    <div className="task-text-exam"><Markdown>{currentTask.text}</Markdown></div>

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
                      disabled={false}
                      sessionId={parseInt(sessionId)}
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
                    <button
                      className={`btn-flag ${flagged.has(currentTask.id) ? "flagged" : ""}`}
                      onClick={() => toggleFlag(currentTask.id)}
                      title={flagged.has(currentTask.id) ? "Markierung entfernen" : "Zum Nochmal-Anschauen markieren"}
                    >
                      &#9873; {flagged.has(currentTask.id) ? "Markiert" : "Markieren"}
                    </button>
                  </div>
                  {currentTask.task_type !== "cloze" && (
                    <div className="task-text-exam"><Markdown>{currentTask.text}</Markdown></div>
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

      {saveErrors.length > 0 && (
        <div className="save-error-banner" style={{ background: "#fef2f2", color: "#b91c1c", padding: "8px 16px", borderRadius: 8, margin: "8px 16px", fontSize: 14 }}>
          Warnung: {saveErrors.length} Antwort(en) konnten nicht gespeichert werden. Bitte versuche es erneut.
        </div>
      )}

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
              {flagged.size > 0 && (
                <p style={{ color: "#b45309", fontSize: 14 }}>
                  &#9873; {flagged.size} Aufgabe(n) noch als "Nochmal anschauen" markiert.
                </p>
              )}
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
