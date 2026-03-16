import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";

export default function DuelJoin() {
  const [searchParams] = useSearchParams();
  const prefilledCode = searchParams.get("code") || "";
  const [code, setCode] = useState(prefilledCode.toUpperCase());
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const navigate = useNavigate();
  const nameRef = useRef();
  const codeRef = useRef();

  // Focus the right field on mount
  useEffect(() => {
    // Small delay ensures mobile keyboard opens reliably
    const timer = setTimeout(() => {
      if (prefilledCode && nameRef.current) {
        nameRef.current.focus();
      } else if (codeRef.current) {
        codeRef.current.focus();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [prefilledCode]);

  async function handleJoin(e) {
    e.preventDefault();
    if (joining) return;

    setError("");
    const roomCode = code.trim().toUpperCase();
    const playerName = name.trim();
    if (!roomCode || !playerName) {
      setError("Bitte Code und Name eingeben");
      return;
    }

    setJoining(true);
    try {
      await api.get(`/api/duels/room/${roomCode}`);
      navigate(`/duel/play/${roomCode}?name=${encodeURIComponent(playerName)}`);
    } catch {
      setError("Raum nicht gefunden");
      setJoining(false);
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
              ref={codeRef}
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="RAUM-CODE"
              className="duel-code-input"
              maxLength={6}
              disabled={joining}
            />
          )}
          <input
            ref={nameRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dein Name"
            className="duel-name-input"
            maxLength={30}
            disabled={joining}
          />
          <button
            type="submit"
            className="duel-btn duel-btn-join"
            disabled={joining}
          >
            {joining ? "Verbinde..." : "Beitreten"}
          </button>
        </form>

        <div className="duel-join-footer">
          <a href="/">Zurück zur Startseite</a>
        </div>
      </div>
    </div>
  );
}
