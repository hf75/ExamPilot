import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import Markdown from "../Markdown";

export default function Results() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

  useEffect(() => {
    loadResults();
  }, [examId]);

  async function loadResults() {
    try {
      const data = await api.get(`/api/exams/${examId}/results`);
      setExam(data.exam);
      setSessions(data.sessions);
    } catch (err) {
      alert(err.message);
      navigate("/teacher/exams");
    } finally {
      setLoading(false);
    }
  }

  async function handleClassAnalysis() {
    setShowAnalysis(true);
    if (analysis) return;
    setAnalysisLoading(true);
    try {
      const data = await api.post(`/api/exams/${examId}/class-analysis`);
      setAnalysis(data.analysis);
    } catch (err) {
      alert(err.message);
    } finally {
      setAnalysisLoading(false);
    }
  }

  async function handleRegenerateAnalysis() {
    setAnalysisLoading(true);
    try {
      await api.delete(`/api/exams/${examId}/class-analysis`);
      const data = await api.post(`/api/exams/${examId}/class-analysis`);
      setAnalysis(data.analysis);
    } catch (err) {
      alert(err.message);
    } finally {
      setAnalysisLoading(false);
    }
  }

  function handleExportPdf() {
    const token = localStorage.getItem("teacher_token");
    window.open(
      `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/api/exams/${examId}/export/pdf?token=${token}`,
      "_blank"
    );
  }

  function handleExportCsv() {
    const token = localStorage.getItem("teacher_token");
    window.open(
      `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/api/exams/${examId}/export/csv?token=${token}`,
      "_blank"
    );
  }

  if (loading) return <p>Laden...</p>;

  return (
    <div className="results-page">
      <button className="btn-secondary" onClick={() => navigate("/teacher/exams")}>
        &larr; Zurück
      </button>

      <div className="page-header" style={{ marginTop: 16 }}>
        <div>
          <h2>{exam?.title} — Ergebnisse</h2>
          {exam?.class_name && (
            <span className="exam-class">{exam.class_name}</span>
          )}
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={handleClassAnalysis}>
            Klassen-Analyse
          </button>
          <button className="btn-secondary" onClick={handleExportCsv}>
            CSV exportieren
          </button>
          <button className="btn-secondary" onClick={handleExportPdf}>
            PDF exportieren
          </button>
        </div>
      </div>

      <table className="results-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Punkte</th>
            <th>Prozent</th>
            <th>Note</th>
            <th>Status</th>
            <th>Einsprüche</th>
            <th>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.session_id}>
              <td>{s.student_name}</td>
              <td>
                {s.total_points ?? "–"} / {s.max_points ?? "–"}
              </td>
              <td>{s.percent}%</td>
              <td>
                <span className={`grade-badge grade-${s.grade}`}>
                  {s.grade} ({s.grade_label})
                </span>
              </td>
              <td>
                <span className={`status-badge status-${s.status === "in_progress" ? "active" : s.status === "submitted" ? "draft" : "closed"}`}>
                  {s.status === "in_progress"
                    ? "In Bearbeitung"
                    : s.status === "submitted"
                      ? "Abgegeben"
                      : "Bewertet"}
                </span>
              </td>
              <td>
                {s.dispute_count > 0 ? (
                  <span className="dispute-badge">{s.dispute_count}</span>
                ) : (
                  <span style={{ color: "var(--text-light)" }}>–</span>
                )}
              </td>
              <td>
                <button
                  className={`btn-small ${s.dispute_count > 0 ? "btn-dispute" : ""}`}
                  onClick={() =>
                    navigate(`/teacher/exams/${examId}/results/${s.session_id}`)
                  }
                >
                  {s.dispute_count > 0 ? "Prüfen" : "Details"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showAnalysis && (
        <div className="class-analysis-panel">
          <div className="class-analysis-header">
            <h3>Klassen-Schwächenanalyse</h3>
            <div style={{ display: "flex", gap: 8 }}>
              {analysis && (
                <button
                  className="btn-small"
                  onClick={handleRegenerateAnalysis}
                  disabled={analysisLoading}
                >
                  Neu generieren
                </button>
              )}
              <button className="btn-small" onClick={() => setShowAnalysis(false)}>
                Schließen
              </button>
            </div>
          </div>
          {analysisLoading ? (
            <div className="class-analysis-loading">
              <span className="grading-spinner"></span>
              KI analysiert die Ergebnisse...
            </div>
          ) : analysis ? (
            <div className="class-analysis-content">
              <Markdown>{analysis}</Markdown>
            </div>
          ) : null}
        </div>
      )}

      {sessions.length === 0 && (
        <p className="empty-state">Noch keine Ergebnisse.</p>
      )}
    </div>
  );
}
