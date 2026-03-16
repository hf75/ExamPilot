import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { api } from "../../api/client";

export default function DuelLobby({ players, roomCode, mode, isHost, onStart }) {
  const minPlayers = 2;
  const canStart = players.length >= minPlayers;
  const qrRef = useRef();
  const [joinUrl, setJoinUrl] = useState("");

  useEffect(() => {
    if (!isHost) return;
    // Fetch the server's LAN IP so phones can reach it
    api.get("/api/duels/server-info").then((info) => {
      const url = `http://${info.ip}:${info.port}/duel?code=${roomCode}`;
      setJoinUrl(url);
    }).catch(() => {
      // Fallback to current host
      setJoinUrl(`${window.location.origin}/duel?code=${roomCode}`);
    });
  }, [isHost, roomCode]);

  useEffect(() => {
    if (!joinUrl || !qrRef.current) return;
    QRCode.toCanvas(qrRef.current, joinUrl, {
      width: 220,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });
  }, [joinUrl]);

  return (
    <div className="duel-lobby">
      <div className="duel-room-code-display">
        <span className="duel-room-label">Raum-Code</span>
        <span className="duel-room-code-big">{roomCode}</span>
        <span className="duel-mode-badge">
          {mode === "royale" ? "Battle Royale" : "Klassisches Duell"}
        </span>
      </div>

      {isHost && (
        <div className="duel-qr-section">
          <canvas ref={qrRef} className="duel-qr-canvas" />
          <p className="duel-qr-hint">QR-Code scannen zum Beitreten</p>
          {joinUrl && (
            <p className="duel-qr-url">{joinUrl}</p>
          )}
        </div>
      )}

      <div className="duel-players-list">
        <h3>Spieler ({players.length})</h3>
        <div className="duel-player-chips">
          {players.map((p) => (
            <div key={p.id} className="duel-player-chip duel-chip-enter">
              {p.name}
            </div>
          ))}
        </div>
        {players.length < minPlayers && (
          <p className="duel-waiting-text">
            Warte auf mindestens {minPlayers} Spieler...
          </p>
        )}
      </div>

      {isHost && (
        <button
          className={`duel-btn duel-btn-start ${canStart ? "" : "disabled"}`}
          onClick={onStart}
          disabled={!canStart}
        >
          Spiel starten
        </button>
      )}

      {!isHost && (
        <p className="duel-waiting-text">Warte auf den Lehrer...</p>
      )}
    </div>
  );
}
