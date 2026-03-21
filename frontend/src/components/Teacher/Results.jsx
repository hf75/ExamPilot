import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import Markdown from "../Markdown";

const TASK_TYPES = {
  multichoice: "MC",
  truefalse: "W/F",
  shortanswer: "Kurz",
  numerical: "Num",
  matching: "Zuord.",
  ordering: "Reih.",
  cloze: "Luecke",
  essay: "Freitext",
  drawing: "Zeichn.",
  description: "Beschr.",
  webapp: "WebApp",
  feynman: "Feynman",
  scenario: "Szenario",
  coding: "Code",
  photo: "Foto",
};

export default function Results() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [showStats, setShowStats] = useState(false);

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

  async function handleShowStats() {
    setShowStats(true);
    if (stats) return;
    setStatsLoading(true);
    try {
      const data = await api.get(`/api/exams/${examId}/statistics`);
      setStats(data);
    } catch (err) {
      alert(err.message);
    } finally {
      setStatsLoading(false);
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
        &larr; Zurueck
      </button>

      <div className="page-header" style={{ marginTop: 16 }}>
        <div>
          <h2>{exam?.title} — Ergebnisse</h2>
          {exam?.class_name && (
            <span className="exam-class">{exam.class_name}</span>
          )}
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={handleShowStats}>
            Statistiken
          </button>
          <button className="btn-secondary" onClick={handleClassAnalysis}>
            KI-Analyse
          </button>
          <button className="btn-secondary" onClick={handleExportCsv}>
            CSV exportieren
          </button>
          <button className="btn-secondary" onClick={handleExportPdf}>
            PDF exportieren
          </button>
        </div>
      </div>

      {showStats && (
        <ClassStatistics
          stats={stats}
          loading={statsLoading}
          onClose={() => setShowStats(false)}
        />
      )}

      <table className="results-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Punkte</th>
            <th>Prozent</th>
            <th>Note</th>
            <th>Status</th>
            <th>Einsprueche</th>
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
                  {s.dispute_count > 0 ? "Pruefen" : "Details"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showAnalysis && (
        <div className="class-analysis-panel">
          <div className="class-analysis-header">
            <h3>Klassen-Schwaechenanalyse</h3>
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
                Schliessen
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


function ClassStatistics({ stats, loading, onClose }) {
  if (loading) {
    return (
      <div className="stats-panel">
        <div className="stats-header">
          <h3>Klassenstatistiken</h3>
          <button className="btn-small" onClick={onClose}>Schliessen</button>
        </div>
        <div className="class-analysis-loading">
          <span className="grading-spinner"></span>
          Statistiken werden berechnet...
        </div>
      </div>
    );
  }

  if (!stats?.class_stats) {
    return (
      <div className="stats-panel">
        <div className="stats-header">
          <h3>Klassenstatistiken</h3>
          <button className="btn-small" onClick={onClose}>Schliessen</button>
        </div>
        <p className="empty-state">Keine abgegebenen Arbeiten vorhanden.</p>
      </div>
    );
  }

  const { class_stats, task_stats } = stats;
  const gd = class_stats.grade_distribution;
  const maxGradeCount = Math.max(...Object.values(gd), 1);
  const totalStudents = class_stats.student_count;

  const sortedByDifficulty = [...task_stats].sort((a, b) => a.success_rate - b.success_rate);

  return (
    <div className="stats-panel">
      <div className="stats-header">
        <h3>Klassenstatistiken</h3>
        <button className="btn-small" onClick={onClose}>Schliessen</button>
      </div>

      {/* Key Metrics */}
      <div className="stats-metrics">
        <div className="stat-card">
          <span className="stat-value">{totalStudents}</span>
          <span className="stat-label">Teilnehmer</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{class_stats.average_percent}%</span>
          <span className="stat-label">Durchschnitt</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{class_stats.median_percent}%</span>
          <span className="stat-label">Median</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{class_stats.pass_rate}%</span>
          <span className="stat-label">Bestanden</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{class_stats.max_percent}%</span>
          <span className="stat-label">Bestes</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{class_stats.min_percent}%</span>
          <span className="stat-label">Schwächstes</span>
        </div>
      </div>

      <div className="stats-charts-row">
        {/* Grade Distribution */}
        <div className="stats-chart-block">
          <h4>Notenspiegel</h4>
          <div className="grade-chart">
            {["1", "2", "3", "4", "5", "6"].map((g) => (
              <div key={g} className="grade-bar-group">
                <span className="grade-bar-count">{gd[g] || 0}</span>
                <div className="grade-bar-track">
                  <div
                    className={`grade-bar grade-bar-${g}`}
                    style={{ height: `${((gd[g] || 0) / maxGradeCount) * 100}%` }}
                  />
                </div>
                <span className="grade-bar-label">{g}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Score Distribution */}
        <div className="stats-chart-block">
          <h4>Punkteverteilung</h4>
          <div className="score-chart">
            {class_stats.score_distribution.map((bin) => {
              const maxBin = Math.max(...class_stats.score_distribution.map(b => b.count), 1);
              return (
                <div key={bin.bin} className="score-bar-group">
                  <span className="score-bar-count">{bin.count}</span>
                  <div className="score-bar-track">
                    <div
                      className="score-bar"
                      style={{ height: `${(bin.count / maxBin) * 100}%` }}
                    />
                  </div>
                  <span className="score-bar-label">{bin.bin}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Task Difficulty Ranking */}
      {task_stats.length > 0 && (
        <div className="stats-tasks-block">
          <h4>Aufgaben nach Schwierigkeit</h4>
          <div className="stats-task-list">
            {sortedByDifficulty.map((t) => (
              <div key={t.task_id} className="stats-task-row">
                <div className="stats-task-info">
                  <span className="stats-task-title">{t.title}</span>
                  <span className="stats-task-type">{TASK_TYPES[t.task_type] || t.task_type}</span>
                </div>
                <div className="stats-task-bar-wrap">
                  <div className="stats-task-bar-track">
                    <div
                      className={`stats-task-bar ${t.success_rate >= 70 ? "easy" : t.success_rate >= 40 ? "medium" : "hard"}`}
                      style={{ width: `${t.success_rate}%` }}
                    />
                  </div>
                  <span className="stats-task-pct">{t.success_rate}%</span>
                </div>
                <div className="stats-task-detail">
                  <span title="Durchschnittlich erreichte Punkte">{t.avg_points}/{t.max_points} Pkt.</span>
                  <span title="Volle Punktzahl erreicht" className="stats-tag good">{t.full_marks_count}x voll</span>
                  <span title="Null Punkte" className="stats-tag bad">{t.zero_count}x null</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
