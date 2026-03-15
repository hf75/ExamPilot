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
        <button className="btn-secondary" onClick={loadResults} style={{ marginTop: 8 }}>
          Ergebnis neu laden
        </button>
      </div>

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
              {answer.student_answer?.startsWith("data:image") ? (
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
