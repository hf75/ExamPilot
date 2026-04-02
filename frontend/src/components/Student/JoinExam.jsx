import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";

export default function JoinExam() {
  const [exams, setExams] = useState([]);
  const [name, setName] = useState("");
  const [selectedExam, setSelectedExam] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
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

    setJoining(true);
    try {
      const payload = { name, exam_id: parseInt(selectedExam) };
      const exam = exams.find((e) => String(e.id) === selectedExam);
      if (exam?.has_password) payload.password = password;
      const data = await api.post("/api/student/join", payload);
      navigate(`/exam/${data.session_id}`);
    } catch (err) {
      setError(err.message);
      setJoining(false);
    }
  }

  const selectedExamObj = exams.find((e) => String(e.id) === selectedExam);

  return (
    <div className="join-screen">
      <div className="join-card">
        <div className="join-header">
          <div className="join-logo">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <rect width="48" height="48" rx="12" fill="var(--accent)" />
              <path d="M14 16h20v2H14zm0 6h20v2H14zm0 6h14v2H14zm18 0l4 4-4 4" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </div>
          <h1>ExamPilot</h1>
          <p className="join-subtitle">A New Classroom Experience</p>
        </div>

        {error && <div className="error-message">{error}</div>}

        {exams.length === 0 ? (
          <div className="join-empty">
            <div className="join-empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
              </svg>
            </div>
            <p>Aktuell keine aktive Klassenarbeit verfügbar.</p>
            <p className="join-empty-hint">Bitte warte, bis dein Lehrer eine Klassenarbeit aktiviert.</p>
          </div>
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
              {exams.length === 1 ? (
                <>
                  <div className="join-exam-single" onClick={() => setSelectedExam(String(exams[0].id))}>
                    <div className="join-exam-single-title">{exams[0].title}</div>
                    {exams[0].class_name && <span className="join-exam-single-class">{exams[0].class_name}</span>}
                    {exams[0].duration_minutes && <span className="join-exam-single-time">{exams[0].duration_minutes} Min.</span>}
                  </div>
                  {/* Auto-select the only exam */}
                  {!selectedExam && (() => { setSelectedExam(String(exams[0].id)); return null; })()}
                </>
              ) : (
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
                      {exam.duration_minutes ? ` - ${exam.duration_minutes} Min.` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {selectedExamObj?.has_password && (
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
            <button type="submit" className="btn-primary" disabled={joining}>
              {joining ? "Wird gestartet..." : "Prüfung starten"}
            </button>
          </form>
        )}

        <div className="join-footer">
          <a href="/duel">Lern-Duell</a>
          <span className="join-footer-sep" />
          <a href="/login">Lehrer-Login</a>
        </div>
      </div>
    </div>
  );
}
