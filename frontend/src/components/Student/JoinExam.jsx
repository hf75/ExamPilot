import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";

export default function JoinExam() {
  const [exams, setExams] = useState([]);
  const [name, setName] = useState("");
  const [selectedExam, setSelectedExam] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/api/student/exams").then(setExams).catch(() => setExams([]));
  }, []);

  async function handleJoin(e) {
    e.preventDefault();
    setError("");

    if (!selectedExam) {
      setError("Bitte eine Klassenarbeit auswählen");
      return;
    }

    try {
      const payload = { name, exam_id: parseInt(selectedExam) };
      const exam = exams.find((e) => String(e.id) === selectedExam);
      if (exam?.has_password) payload.password = password;
      const data = await api.post("/api/student/join", payload);
      navigate(`/exam/${data.session_id}`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>ExamPilot</h1>
        <h2>Anmeldung</h2>

        {error && <div className="error-message">{error}</div>}

        {exams.length === 0 ? (
          <p className="no-exams">Aktuell keine aktive Klassenarbeit verfügbar.</p>
        ) : (
          <form onSubmit={handleJoin}>
            <div className="form-group">
              <label htmlFor="name">Dein Name</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Vor- und Nachname"
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label htmlFor="exam">Klassenarbeit</label>
              <select
                id="exam"
                value={selectedExam}
                onChange={(e) => setSelectedExam(e.target.value)}
                required
              >
                <option value="">-- Bitte auswählen --</option>
                {exams.map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.title} {exam.class_name ? `(${exam.class_name})` : ""}
                  </option>
                ))}
              </select>
            </div>
            {exams.find((e) => String(e.id) === selectedExam)?.has_password && (
              <div className="form-group">
                <label htmlFor="password">Passwort</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Zugangscode eingeben"
                  required
                />
              </div>
            )}
            <button type="submit" className="btn-primary">
              Prüfung starten
            </button>
          </form>
        )}

        <div className="login-footer">
          <a href="/duel">Zum Lern-Duell →</a>
          <span style={{ margin: "0 8px", color: "#ccc" }}>|</span>
          <a href="/login">Lehrer-Login →</a>
        </div>
      </div>
    </div>
  );
}
