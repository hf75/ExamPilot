import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../api/client";

export default function LiveMonitor() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const ws = useRef(null);

  useEffect(() => {
    loadProgress();
    connectWebSocket();
    const interval = setInterval(loadProgress, 5000);
    return () => {
      clearInterval(interval);
      if (ws.current) ws.current.close();
    };
  }, [examId]);

  async function loadProgress() {
    try {
      const result = await api.get(`/api/exams/${examId}/live-progress`);
      setData(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function connectWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const url = `${protocol}//${host}/ws/exam/${examId}`;

    ws.current = new WebSocket(url);
    ws.current.onmessage = () => {
      loadProgress();
    };
    ws.current.onclose = () => {
      setTimeout(connectWebSocket, 3000);
    };
  }

  function getStuckMinutes(lastSeen) {
    if (!lastSeen) return 0;
    const diff = Date.now() - new Date(lastSeen + "Z").getTime();
    return Math.floor(diff / 60000);
  }

  if (loading) return <p>Laden...</p>;
  if (!data) return <p>Keine Daten</p>;

  const { tasks, students } = data;
  const inProgress = students.filter((s) => s.status === "in_progress");
  const submitted = students.filter((s) => s.status !== "in_progress");

  return (
    <div className="live-monitor">
      <button className="btn-secondary" onClick={() => navigate("/teacher/exams")}>
        &larr; Zurück
      </button>

      <div className="monitor-header">
        <h2>Live-Dashboard</h2>
        <div className="monitor-stats">
          <span className="monitor-stat">
            <strong>{students.length}</strong> Teilnehmer
          </span>
          <span className="monitor-stat active">
            <strong>{inProgress.length}</strong> aktiv
          </span>
          <span className="monitor-stat submitted">
            <strong>{submitted.length}</strong> abgegeben
          </span>
        </div>
      </div>

      {/* Progress Matrix */}
      {inProgress.length > 0 && (
        <div className="monitor-section">
          <h3>In Bearbeitung</h3>
          <div className="progress-matrix-scroll">
            <table className="progress-matrix">
              <thead>
                <tr>
                  <th className="matrix-name-col">Schüler</th>
                  {tasks.map((t, i) => (
                    <th key={t.id} className="matrix-task-col" title={t.title}>
                      {i + 1}
                    </th>
                  ))}
                  <th className="matrix-status-col">Status</th>
                </tr>
              </thead>
              <tbody>
                {inProgress.map((student) => {
                  const stuckMin = getStuckMinutes(student.last_seen);
                  const answeredCount = tasks.filter(
                    (t) => student.answers[String(t.id)]?.answered
                  ).length;

                  return (
                    <tr key={student.session_id}>
                      <td className="matrix-name-cell">
                        {student.student_name}
                        {stuckMin >= 5 && (
                          <span className="stuck-badge" title={`${stuckMin} Min. auf gleicher Aufgabe`}>
                            {stuckMin}m
                          </span>
                        )}
                      </td>
                      {tasks.map((t) => {
                        const ans = student.answers[String(t.id)];
                        const isCurrent = student.current_task_id === t.id;
                        let cls = "matrix-cell";
                        if (isCurrent && !ans?.answered) cls += " current";
                        else if (ans?.grading_status === "pending") cls += " pending";
                        else if (ans?.answered) cls += " answered";

                        return (
                          <td key={t.id} className={cls}>
                            {ans?.answered ? "✓" : isCurrent ? "●" : ""}
                          </td>
                        );
                      })}
                      <td className="matrix-status-cell">
                        {answeredCount}/{tasks.length}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Submitted students */}
      {submitted.length > 0 && (
        <div className="monitor-section">
          <h3>Abgegeben</h3>
          <div className="monitor-grid">
            {submitted.map((s) => (
              <div
                key={s.session_id}
                className="monitor-card submitted"
                onClick={() => navigate(`/teacher/exams/${examId}/results/${s.session_id}`)}
                style={{ cursor: "pointer" }}
              >
                <div className="monitor-card-name">{s.student_name}</div>
                <div className="monitor-card-result">
                  {s.total_points ?? "–"}/{s.max_points ?? "–"} Pkt.
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {students.length === 0 && (
        <p className="empty-state">
          Noch keine Schüler angemeldet. Die Klassenarbeit muss den Status
          "Aktiv" haben.
        </p>
      )}
    </div>
  );
}
