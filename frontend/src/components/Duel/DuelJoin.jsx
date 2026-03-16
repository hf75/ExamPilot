import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";

export default function DuelJoin() {
  const [searchParams] = useSearchParams();
  const prefilledCode = searchParams.get("code") || "";
  const [code, setCode] = useState(prefilledCode.toUpperCase());
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const nameRef = useRef();

  // If code is pre-filled (from QR), auto-focus name field
  useEffect(() => {
    if (prefilledCode && nameRef.current) {
      nameRef.current.focus();
    }
  }, [prefilledCode]);

  async function handleJoin(e) {
    e.preventDefault();
    setError("");
    const roomCode = code.trim().toUpperCase();
    if (!roomCode || !name.trim()) {
      setError("Bitte Code und Name eingeben");
      return;
    }
    try {
      await api.get(`/api/duels/room/${roomCode}`);
      navigate(`/duel/play/${roomCode}?name=${encodeURIComponent(name.trim())}`);
    } catch {
      setError("Raum nicht gefunden");
    }
  }

  return (
    <div className="duel-root duel-join-page">
      <div className="duel-join-card">
        <h1 className="duel-logo">Lern-Duell</h1>
        <p className="duel-subtitle">
          {prefilledCode
            ? "Gib deinen Namen ein um beizutreten"
            : "Gib den Raum-Code ein, den dein Lehrer anzeigt"}
        </p>

        {error && <div className="duel-error">{error}</div>}

        <form onSubmit={handleJoin}>
          {prefilledCode ? (
            <div className="duel-prefilled-code">
              Raum: <strong>{code}</strong>
            </div>
          ) : (
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="RAUM-CODE"
              className="duel-code-input"
              maxLength={6}
              autoFocus
            />
          )}
          <input
            ref={nameRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dein Name"
            className="duel-name-input"
            autoFocus={!!prefilledCode}
          />
          <button type="submit" className="duel-btn duel-btn-join">
            Beitreten
          </button>
        </form>

        <div className="duel-join-footer">
          <a href="/">Zurück zur Startseite</a>
        </div>
      </div>
    </div>
  );
}
