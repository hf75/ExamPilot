import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import Markdown from "../Markdown";

export default function ResultView() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [disputeId, setDisputeId] = useState(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [explanations, setExplanations] = useState({});
  const [loadingExplain, setLoadingExplain] = useState({});
  const [learningMaterial, setLearningMaterial] = useState(null);
  const [learningLoading, setLearningLoading] = useState(false);
  const [showLearning, setShowLearning] = useState(false);

  const loadResults = useCallback(() => {
    setLoading(true);
    api
      .get(`/api/student/results/${sessionId}`)
      .then(setResult)
      .catch((err) => {
        alert(err.message);
        navigate("/");
      })
      .finally(() => setLoading(false));
  }, [sessionId, navigate]);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  async function handleDispute(answerId) {
    setSubmitting(true);
    try {
      await api.post("/api/student/dispute", {
        answer_id: answerId,
        reason: disputeReason || undefined,
      });
      setDisputeId(null);
      setDisputeReason("");
      loadResults();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGenerateLearning() {
    setShowLearning(true);
    if (learningMaterial) return;
    setLearningLoading(true);
    try {
      const data = await api.post(`/api/student/learning-material/${sessionId}`);
      setLearningMaterial(data);
    } catch (err) {
      alert(err.message);
    } finally {
      setLearningLoading(false);
    }
  }

  function downloadAsHTML() {
    if (!learningMaterial) return;
    const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><title>Lernmaterial - ${learningMaterial.exam_title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6;color:#333}
h1{color:#6d28d9}h2{color:#7c3aed;border-bottom:2px solid #ede9fe;padding-bottom:4px}h3{color:#8b5cf6}
code{background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:0.9em}
pre{background:#1e1e1e;color:#d4d4d4;padding:16px;border-radius:8px;overflow-x:auto}
pre code{background:none;color:inherit}hr{border:none;border-top:2px solid #ede9fe;margin:32px 0}
blockquote{border-left:4px solid #7c3aed;margin:16px 0;padding:8px 16px;background:#faf5ff}
</style></head><body>
<h1>Persoenliches Lernmaterial</h1>
<p><strong>${learningMaterial.student_name}</strong> — ${learningMaterial.exam_title}</p>
<hr>
${learningMaterial.material.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}
</body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Lernmaterial_${learningMaterial.student_name}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadAsText() {
    if (!learningMaterial) return;
    const text = `Persoenliches Lernmaterial\n${learningMaterial.student_name} — ${learningMaterial.exam_title}\n${"=".repeat(60)}\n\n${learningMaterial.material}`;
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Lernmaterial_${learningMaterial.student_name}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleExplain(answerId) {
    setLoadingExplain((prev) => ({ ...prev, [answerId]: true }));
    try {
      const data = await api.post("/api/student/explain", { answer_id: answerId });
      setExplanations((prev) => ({ ...prev, [answerId]: data.explanation }));
    } catch (err) {
      alert(err.message);
    } finally {
      setLoadingExplain((prev) => ({ ...prev, [answerId]: false }));
    }
  }

  if (loading) {
    return (
      <div className="exam-loading">
        <p>Ergebnisse werden geladen...</p>
      </div>
    );
  }

  if (!result) return null;

  const percent = result.percent ?? (
    result.max_points > 0
      ? Math.round((result.total_points / result.max_points) * 100)
      : 0
  );

  return (
    <div className="result-view">
      <div className="result-header">
        <h1>{result.exam_title}</h1>
        <h2>{result.student_name}</h2>
      </div>

      <div className="result-summary">
        <div className="result-score">
          <span className="result-points">
            {result.total_points ?? "–"} / {result.max_points ?? "–"}
          </span>
          <span className="result-percent">{percent}%</span>
          {result.grade && (
            <span className="result-grade">
              Note {result.grade} ({result.grade_label})
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <button className="btn-secondary" onClick={loadResults}>
            Ergebnis neu laden
          </button>
          <button className="btn-primary-sm" onClick={handleGenerateLearning} disabled={learningLoading}>
            Persoenliches Lernmaterial erstellen
          </button>
        </div>
      </div>

      {showLearning && (
        <div className="learning-material-panel">
          <div className="learning-material-header">
            <h3>Dein persoenliches Lernmaterial</h3>
            <div style={{ display: "flex", gap: 8 }}>
              {learningMaterial && (
                <>
                  <button className="btn-small" onClick={downloadAsHTML}>
                    HTML herunterladen
                  </button>
                  <button className="btn-small" onClick={downloadAsText}>
                    Markdown herunterladen
                  </button>
                </>
              )}
              <button className="btn-small" onClick={() => setShowLearning(false)}>
                Schliessen
              </button>
            </div>
          </div>
          {learningLoading ? (
            <div className="learning-material-loading">
              <span className="grading-spinner"></span>
              Dein persoenliches Lernmaterial wird erstellt... Das kann einen Moment dauern.
            </div>
          ) : learningMaterial ? (
            <div className="learning-material-content">
              {learningMaterial.weak_count > 0 && (
                <p className="learning-material-info">
                  Basierend auf {learningMaterial.weak_count} von {learningMaterial.total_count} Aufgaben,
                  bei denen du noch Verbesserungspotential hast.
                </p>
              )}
              <Markdown>{learningMaterial.material}</Markdown>
            </div>
          ) : null}
        </div>
      )}

      <div className="result-answers">
        <h3>Aufgaben im Detail</h3>
        {result.answers.map((answer) => (
          <div
            key={answer.id}
            className={`result-answer-card ${answer.is_correct ? "correct" : "incorrect"}`}
          >
            <div className="result-answer-header">
              <strong>{answer.task_title}</strong>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {answer.manually_adjusted && (
                  <span className="manual-badge">Korrigiert</span>
                )}
                {answer.disputed && !answer.manually_adjusted && (
                  <span className="dispute-badge">Einspruch gemeldet</span>
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
              <strong>Deine Antwort:</strong>
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
                              {entry.role === "situation" ? "Situation" : "Deine Entscheidung"}
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

            {/* AI Tutor */}
            {explanations[answer.id] ? (
              <div className="explanation-box">
                <strong>KI-Nachhilfe:</strong>
                <Markdown>{explanations[answer.id]}</Markdown>
              </div>
            ) : (
              <div className="task-actions" style={{ marginTop: 8 }}>
                <button
                  className="btn-explain"
                  onClick={() => handleExplain(answer.id)}
                  disabled={loadingExplain[answer.id]}
                >
                  {loadingExplain[answer.id] ? "Wird erklärt..." : "Erkläre mir das"}
                </button>
              </div>
            )}

            {/* Dispute / Flag button */}
            {!answer.manually_adjusted && !answer.disputed && (
              disputeId === answer.id ? (
                <div className="dispute-form">
                  <div className="form-group">
                    <label>Warum ist die Bewertung falsch? (optional)</label>
                    <input
                      type="text"
                      value={disputeReason}
                      onChange={(e) => setDisputeReason(e.target.value)}
                      placeholder="z.B. Der Befehl ist korrekt, weil..."
                      maxLength={500}
                    />
                  </div>
                  <div className="task-actions">
                    <button
                      className="btn-dispute"
                      onClick={() => handleDispute(answer.id)}
                      disabled={submitting}
                    >
                      {submitting ? "Wird gesendet..." : "Einspruch senden"}
                    </button>
                    <button
                      className="btn-small"
                      onClick={() => { setDisputeId(null); setDisputeReason(""); }}
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              ) : (
                <div className="task-actions" style={{ marginTop: 8 }}>
                  <button
                    className="btn-dispute-outline"
                    onClick={() => setDisputeId(answer.id)}
                  >
                    Bewertung anfechten
                  </button>
                </div>
              )
            )}
          </div>
        ))}
      </div>

      <div style={{ textAlign: "center", marginTop: 32 }}>
        <button className="btn-primary-sm" onClick={() => navigate("/")}>
          Zurück zur Startseite
        </button>
      </div>
    </div>
  );
}
