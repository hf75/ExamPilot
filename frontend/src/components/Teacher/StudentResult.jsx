import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { toast } from "../shared/Toast";
import Markdown from "../Markdown";

export default function StudentResult() {
  const { examId, sessionId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingAnswer, setEditingAnswer] = useState(null);
  const [editPoints, setEditPoints] = useState(0);
  const [editFeedback, setEditFeedback] = useState("");

  useEffect(() => {
    loadData();
  }, [examId, sessionId]);

  async function loadData() {
    try {
      const result = await api.get(
        `/api/exams/${examId}/results/${sessionId}`
      );
      setData(result);
    } catch (err) {
      toast.error(err.message);
      navigate(`/teacher/exams/${examId}/results`);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdjust(answerId) {
    try {
      await api.put(`/api/exams/${examId}/answers/${answerId}/adjust`, {
        points_awarded: editPoints,
        feedback: editFeedback || undefined,
      });
      setEditingAnswer(null);
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleQuickGrade(answerId, mode, maxPoints) {
    let points;
    if (mode === "correct") points = maxPoints;
    else if (mode === "wrong") points = 0;
    else return; // partial handled via edit form

    try {
      await api.put(`/api/exams/${examId}/answers/${answerId}/adjust`, {
        points_awarded: points,
        feedback: mode === "correct"
          ? "Manuell als richtig bewertet."
          : "Manuell als falsch bewertet.",
      });
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  }

  function handleExportPdf() {
    const token = localStorage.getItem("teacher_token");
    window.open(
      `/api/exams/${examId}/export/${sessionId}/pdf?token=${token}`,
      "_blank"
    );
  }

  if (loading) return <p>Laden...</p>;
  if (!data) return null;

  const { session, answers, grade, grade_label, percent } = data;
  const disputedAnswers = answers.filter((a) => a.disputed);

  return (
    <div className="student-result-page">
      <button
        className="btn-secondary"
        onClick={() => navigate(`/teacher/exams/${examId}/results`)}
      >
        &larr; Zurück zur Übersicht
      </button>

      <div className="page-header" style={{ marginTop: 16 }}>
        <div>
          <h2>{session.student_name}</h2>
          <span className="exam-class">{session.exam_title}</span>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={handleExportPdf}>
            PDF exportieren
          </button>
        </div>
      </div>

      <div className="result-summary">
        <div className="result-score">
          <span className="result-points">
            {session.total_points ?? "–"} / {session.max_points ?? "–"}
          </span>
          <span className="result-percent">{percent}%</span>
          <span className="result-grade">
            Note {grade} ({grade_label})
          </span>
        </div>
      </div>

      {/* Disputed answers section */}
      {disputedAnswers.length > 0 && (
        <div className="dispute-summary">
          <h3>Einsprüche ({disputedAnswers.length})</h3>
          <p>Der Schüler hat bei folgenden Aufgaben die Bewertung angefochten:</p>
          <ul>
            {disputedAnswers.map((a) => (
              <li key={a.id}>
                <strong>{a.task_title}</strong>
                {a.dispute_reason && <> — „{a.dispute_reason}"</>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="result-answers">
        {answers.map((answer) => (
          <div
            key={answer.id}
            className={`result-answer-card ${answer.is_correct ? "correct" : "incorrect"} ${answer.disputed ? "disputed" : ""}`}
          >
            <div className="result-answer-header">
              <strong>{answer.task_title}</strong>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {answer.disputed && (
                  <span className="dispute-badge">Einspruch</span>
                )}
                {answer.manually_adjusted && (
                  <span className="manual-badge">Manuell</span>
                )}
                <span
                  className={`result-points-badge ${answer.is_correct ? "correct" : "incorrect"}`}
                >
                  {answer.points_awarded ?? "–"} / {answer.max_points} Pkt.
                </span>
              </div>
            </div>

            <div className="result-task-text"><Markdown>{answer.task_text}</Markdown></div>

            <div className="result-student-answer">
              <strong>Antwort:</strong>
              {answer.task_type === "scenario" && answer.student_answer ? (
                <div className="scenario-transcript">
                  {(() => {
                    try {
                      const entries = JSON.parse(answer.student_answer);
                      return entries.map((entry, i) => (
                        <div key={i} className={`scenario-entry scenario-entry-${entry.role}`}>
                          <div className="scenario-entry-marker">
                            {entry.role === "situation" ? "\u{1F4CB}" : "\u{1F449}"}
                          </div>
                          <div className="scenario-entry-body">
                            <div className="scenario-entry-label">
                              {entry.role === "situation" ? "Situation" : "Entscheidung"}
                            </div>
                            <div className="scenario-entry-text"><Markdown>{entry.content}</Markdown></div>
                          </div>
                        </div>
                      ));
                    } catch { return <pre>{answer.student_answer}</pre>; }
                  })()}
                </div>
              ) : answer.task_type === "feynman" && answer.student_answer ? (
                <div className="feynman-transcript">
                  {(() => {
                    try {
                      const msgs = JSON.parse(answer.student_answer);
                      return msgs.map((msg, i) => (
                        <div key={i} className={`feynman-msg feynman-msg-${msg.role}`}>
                          <div className="feynman-msg-label">
                            {msg.role === "student" ? "Schüler" : "Kollege"}
                          </div>
                          <div className="feynman-msg-content"><Markdown>{msg.content}</Markdown></div>
                        </div>
                      ));
                    } catch { return <pre>{answer.student_answer}</pre>; }
                  })()}
                </div>
              ) : answer.task_type === "webapp" && answer.app_html ? (
                <div className="webapp-result" style={{ marginTop: 8 }}>
                  <div className="webapp-iframe-container">
                    <div className="webapp-overlay" />
                    <iframe
                      srcDoc={answer.app_html}
                      sandbox="allow-scripts"
                      title="Web-App Ergebnis"
                      className="webapp-iframe"
                      onLoad={(e) => {
                        try {
                          const state = JSON.parse(answer.student_answer);
                          e.target.contentWindow.postMessage({ type: "examPilotRestore", state }, "*");
                        } catch {}
                      }}
                    />
                  </div>
                </div>
              ) : answer.task_type === "coding" && answer.student_answer ? (
                <div className="coding-result-display">
                  {(() => {
                    try {
                      const parsed = JSON.parse(answer.student_answer);
                      return (
                        <>
                          <pre className="coding-output">{parsed.code || "Kein Code"}</pre>
                          {parsed.test_results?.length > 0 && (
                            <div className="coding-test-list" style={{ marginTop: 8 }}>
                              {parsed.test_results.map((tr, i) => (
                                <div key={i} className={`coding-test-item ${tr.passed ? "pass" : "fail"}`}>
                                  <span className="coding-test-status">{tr.passed ? "\u2713" : "\u2717"}</span>
                                  <span>{tr.passed ? "Bestanden" : `Fehlgeschlagen${tr.actual_output ? `: ${tr.actual_output}` : ""}`}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      );
                    } catch { return <pre className="coding-output">{answer.student_answer}</pre>; }
                  })()}
                </div>
              ) : answer.student_answer?.startsWith("data:image") ? (
                <img
                  src={answer.student_answer}
                  alt="Zeichnung"
                  style={{ maxWidth: "100%", border: "1px solid var(--border)", marginTop: 8, borderRadius: 8 }}
                />
              ) : (
                <pre>{answer.student_answer || "Keine Antwort"}</pre>
              )}
            </div>

            {answer.feedback && (
              <div className="result-feedback">
                <strong>Feedback:</strong>
                <Markdown>{answer.feedback}</Markdown>
              </div>
            )}

            {answer.solution && (
              <div className="result-feedback" style={{ borderLeftColor: "var(--accent)" }}>
                <strong>Musterlösung:</strong>
                <Markdown>{answer.solution}</Markdown>
              </div>
            )}
            {answer.hint && (
              <div className="result-feedback" style={{ borderLeftColor: "var(--border)" }}>
                <strong>Hinweis:</strong>
                <Markdown>{answer.hint}</Markdown>
              </div>
            )}

            {answer.disputed && answer.dispute_reason && (
              <div className="result-feedback dispute-reason">
                <strong>Begründung des Schülers:</strong> {answer.dispute_reason}
              </div>
            )}

            {editingAnswer === answer.id ? (
              <div className="adjust-form">
                <div className="form-row">
                  <div className="form-group" style={{ maxWidth: 120 }}>
                    <label>Punkte</label>
                    <input
                      type="number"
                      min="0"
                      max={answer.max_points}
                      step="0.5"
                      value={editPoints}
                      onChange={(e) => setEditPoints(parseFloat(e.target.value))}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Feedback (optional)</label>
                    <input
                      type="text"
                      value={editFeedback}
                      onChange={(e) => setEditFeedback(e.target.value)}
                      placeholder="Neues Feedback..."
                    />
                  </div>
                </div>
                <div className="task-actions">
                  <button
                    className="btn-primary-sm"
                    onClick={() => handleAdjust(answer.id)}
                  >
                    Speichern
                  </button>
                  <button
                    className="btn-small"
                    onClick={() => setEditingAnswer(null)}
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            ) : (
              <div className="task-actions grade-actions" style={{ marginTop: 8 }}>
                <button
                  className="btn-correct"
                  onClick={() => handleQuickGrade(answer.id, "correct", answer.max_points)}
                  title="Volle Punktzahl vergeben"
                >
                  Richtig
                </button>
                <button
                  className="btn-wrong"
                  onClick={() => handleQuickGrade(answer.id, "wrong", answer.max_points)}
                  title="0 Punkte vergeben"
                >
                  Falsch
                </button>
                <button
                  className="btn-small"
                  onClick={() => {
                    setEditingAnswer(answer.id);
                    setEditPoints(answer.points_awarded || 0);
                    setEditFeedback(answer.feedback || "");
                  }}
                >
                  Teilweise / Punkte anpassen
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
