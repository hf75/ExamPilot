import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api/client";

export default function Overview() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ tasks: 0, exams: 0, activeExams: [] });

  useEffect(() => {
    Promise.all([
      api.get("/api/tasks").catch(() => []),
      api.get("/api/exams").catch(() => []),
    ]).then(([tasks, exams]) => {
      setStats({
        tasks: tasks.length,
        exams: exams.length,
        activeExams: exams.filter((e) => e.status === "active"),
      });
    });
  }, []);

  async function handleResetAll() {
    if (!confirm("ACHTUNG: Alle Aufgaben, Pools, Klassenarbeiten, Schüler und Ergebnisse werden unwiderruflich gelöscht!\n\nWirklich alles zurücksetzen?")) return;
    if (!confirm("Bist du wirklich sicher? Das kann nicht rückgängig gemacht werden!")) return;
    try {
      await api.post("/api/auth/reset-all", {});
      setStats({ tasks: 0, exams: 0, activeExams: [] });
      alert("System wurde zurückgesetzt.");
    } catch (err) {
      alert("Fehler: " + err.message);
    }
  }

  return (
    <div className="overview">
      <div className="page-header">
        <h2>Dashboard</h2>
        <button className="btn-small btn-danger" onClick={handleResetAll}>
          System zurücksetzen
        </button>
      </div>
      <div className="stats-grid">
        <Link to="/teacher/tasks" className="stat-card">
          <div className="stat-number">{stats.tasks}</div>
          <div className="stat-label">Aufgaben im Pool</div>
        </Link>
        <Link to="/teacher/exams" className="stat-card">
          <div className="stat-number">{stats.exams}</div>
          <div className="stat-label">Klassenarbeiten</div>
        </Link>
        <div className="stat-card">
          <div className="stat-number">{stats.activeExams.length}</div>
          <div className="stat-label">Aktive Prüfungen</div>
        </div>
      </div>

      {stats.activeExams.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ marginBottom: 12 }}>Aktive Prüfungen</h3>
          <div className="exam-list">
            {stats.activeExams.map((exam) => (
              <div key={exam.id} className="exam-card">
                <div className="exam-card-header">
                  <div>
                    <h3>{exam.title}</h3>
                    <div className="exam-meta">
                      {exam.class_name && (
                        <span className="exam-class">{exam.class_name}</span>
                      )}
                    </div>
                  </div>
                  <span className="status-badge status-active">Aktiv</span>
                </div>
                <div className="task-actions">
                  <button
                    className="btn-small"
                    onClick={() =>
                      navigate(`/teacher/exams/${exam.id}/monitor`)
                    }
                  >
                    Live-Monitor
                  </button>
                  <button
                    className="btn-small"
                    onClick={() =>
                      navigate(`/teacher/exams/${exam.id}/results`)
                    }
                  >
                    Ergebnisse
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
