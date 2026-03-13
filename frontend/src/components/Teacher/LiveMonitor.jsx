import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../api/client";

export default function LiveMonitor() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const ws = useRef(null);

  useEffect(() => {
    loadResults();
    connectWebSocket();
    const interval = setInterval(loadResults, 10000);
    return () => {
      clearInterval(interval);
      if (ws.current) ws.current.close();
    };
  }, [examId]);

  async function loadResults() {
    try {
      const data = await api.get(`/api/exams/${examId}/results`);
      setExam(data.exam);
      setSessions(data.sessions);
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
    ws.current.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (["student_joined", "exam_submitted", "answer_submitted"].includes(msg.event)) {
        loadResults();
      }
    };
    ws.current.onclose = () => {
      setTimeout(connectWebSocket, 3000);
    };
  }

  if (loading) return <p>Laden...</p>;

  const inProgress = sessions.filter((s) => s.status === "in_progress");
  const submitted = sessions.filter((s) => s.status !== "in_progress");

  return (
    <div className="live-monitor">
      <button className="btn-secondary" onClick={() => navigate("/teacher/exams")}>
        &larr; Zurück
      </button>

      <div className="monitor-header">
        <h2>Live-Monitor: {exam?.title}</h2>
        <div className="monitor-stats">
          <span className="monitor-stat">
            <strong>{sessions.length}</strong> Teilnehmer
          </span>
          <span className="monitor-stat">
            <strong>{inProgress.length}</strong> aktiv
          </span>
          <span className="monitor-stat">
            <strong>{submitted.length}</strong> abgegeben
          </span>
        </div>
      </div>

      {inProgress.length > 0 && (
        <div className="monitor-section">
          <h3>In Bearbeitung</h3>
          <div className="monitor-grid">
            {inProgress.map((s) => (
              <div key={s.session_id} className="monitor-card active">
                <div className="monitor-card-name">{s.student_name}</div>
                <div className="monitor-card-status">Arbeitet...</div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                  <span className="monitor-grade">Note {s.grade}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {sessions.length === 0 && (
        <p className="empty-state">
          Noch keine Schüler angemeldet. Die Klassenarbeit muss den Status
          "Aktiv" haben.
        </p>
      )}
    </div>
  );
}
