import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import QuestionRenderer from "../Questions/QuestionRenderer";
import TaskNav from "../Student/TaskNav";
import Markdown from "../Markdown";

export default function ExamPreview() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [showSolutions, setShowSolutions] = useState(false);

  useEffect(() => {
    loadPreview();
  }, [examId]);

  async function loadPreview() {
    try {
      const data = await api.get(`/api/exams/${examId}/preview`);
      setSession(data);
    } catch (err) {
      alert(err.message);
      navigate("/teacher/exams");
    } finally {
      setLoading(false);
    }
  }

  function handleAnswerChange(taskId, value) {
    if (!showSolutions) {
      setAnswers((prev) => ({ ...prev, [taskId]: value }));
    }
  }

  if (loading) {
    return (
      <div className="exam-loading">
        <p>Vorschau wird geladen...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="exam-loading">
        <p>Vorschau nicht verfügbar.</p>
        <button className="btn-primary-sm" onClick={() => navigate("/teacher/exams")}>
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

  function getCorrectAnswer(task) {
    const qd = task.question_data || {};
    switch (task.task_type) {
      case "multichoice": {
        const indices = (qd.answers || [])
          .map((a, i) => (a.fraction >= 100 ? i : -1))
          .filter((i) => i >= 0);
        return JSON.stringify(indices);
      }
      case "truefalse":
        return String(qd.correct_answer ?? "true");
      case "shortanswer": {
        const best = (qd.answers || []).find((a) => a.fraction >= 100);
        return best ? best.text : "";
      }
      case "numerical": {
        const best = (qd.answers || []).find((a) => a.fraction >= 100);
        return best ? String(best.value) : "";
      }
      case "matching": {
        const map = {};
        (qd.pairs || []).forEach((p, i) => { map[String(i)] = p.answer; });
        return JSON.stringify(map);
      }
      case "ordering": {
        const indices = (qd.items || []).map((_, i) => i);
        return JSON.stringify(indices);
      }
      case "cloze": {
        const gapAnswers = (qd.gaps || []).map((gap) => {
          if (gap.type === "multichoice") {
            const idx = (gap.answers || []).findIndex((a) => a.fraction >= 100);
            return String(idx >= 0 ? idx : 0);
          }
          const best = (gap.answers || []).find((a) => a.fraction >= 100);
          return best ? best.text : "";
        });
        return JSON.stringify(gapAnswers);
      }
      default:
        return null;
    }
  }

  function getEffectiveAnswer(task) {
    if (showSolutions) {
      const correct = getCorrectAnswer(task);
      if (correct !== null) return correct;
    }
    return answers[task.id] || "";
  }

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
          <span className="exam-student-name preview-badge">Vorschau-Modus</span>
        </div>
        <div className="exam-header-actions">
          {session.duration_minutes && (
            <span className="exam-timer">
              {formatTime(session.duration_minutes * 60)}
            </span>
          )}
          <span className="exam-progress">
            {answeredCount}/{tasks.length} beantwortet
          </span>
          <label className="preview-solutions-toggle">
            <input
              type="checkbox"
              checked={showSolutions}
              onChange={(e) => setShowSolutions(e.target.checked)}
            />
            Lösungen anzeigen
          </label>
          <button
            className="btn-secondary"
            onClick={() => navigate("/teacher/exams")}
          >
            Vorschau beenden
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

        <div className={`exam-main ${currentTask?.task_type === "drawing" || currentTask?.task_type === "webapp" || currentTask?.task_type === "feynman" || currentTask?.task_type === "scenario" ? "exam-main-drawing" : ""}`}>
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
                </div>
                <div className="task-text-exam"><Markdown>{currentTask.text}</Markdown></div>

                {showSolutions && currentTask.solution && (
                  <div className="preview-solution">
                    <strong>Musterlösung:</strong>
                    <Markdown>{currentTask.solution}</Markdown>
                  </div>
                )}

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
              </div>
              <div className="drawing-split-right">
                <QuestionRenderer
                  task={currentTask}
                  answer={getEffectiveAnswer(currentTask)}
                  onChange={(value) => handleAnswerChange(currentTask.id, value)}
                  disabled={showSolutions && getCorrectAnswer(currentTask) !== null}
                  preview
                />
              </div>
            </div>
          ) : currentTask ? (
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

              <QuestionRenderer
                task={currentTask}
                answer={getEffectiveAnswer(currentTask)}
                onChange={(value) => handleAnswerChange(currentTask.id, value)}
                disabled={showSolutions && getCorrectAnswer(currentTask) !== null}
              />

              {showSolutions && currentTask.solution && (
                <div className="preview-solution">
                  <strong>Musterlösung:</strong>
                  <Markdown>{currentTask.solution}</Markdown>
                </div>
              )}

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
          ) : null}

          {tasks.length === 0 && (
            <div className="empty-state">
              <p>Keine Aufgaben in dieser Klassenarbeit.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
