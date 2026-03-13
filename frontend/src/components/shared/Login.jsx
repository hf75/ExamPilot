import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "../../api/client";

export default function Login() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSetup, setIsSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/api/auth/status").then((data) => {
      setIsSetup(!data.password_set);
      setLoading(false);
    });
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (isSetup && password !== confirmPassword) {
      setError("Passwörter stimmen nicht überein");
      return;
    }

    try {
      const endpoint = isSetup ? "/api/auth/setup" : "/api/auth/login";
      const data = await api.post(endpoint, { password });
      setToken(data.token);
      navigate("/teacher");
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) {
    return <div className="login-container"><p>Laden...</p></div>;
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>📝 ExamPilot</h1>
        <h2>{isSetup ? "Passwort einrichten" : "Lehrer-Login"}</h2>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="password">Passwort</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Passwort eingeben"
              required
              autoFocus
            />
          </div>

          {isSetup && (
            <div className="form-group">
              <label htmlFor="confirm">Passwort bestätigen</label>
              <input
                id="confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Passwort wiederholen"
                required
              />
            </div>
          )}

          <button type="submit" className="btn-primary">
            {isSetup ? "Passwort setzen & einloggen" : "Einloggen"}
          </button>
        </form>
      </div>
    </div>
  );
}
