import { useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import useDuelSocket from "./useDuelSocket";
import DuelLobby from "./DuelLobby";
import DuelCountdown from "./DuelCountdown";
import DuelQuestion from "./DuelQuestion";
import DuelScoreboard from "./DuelScoreboard";
import DuelVictory from "./DuelVictory";
import "./duel.css";

export default function DuelStudentGame() {
  const { roomCode } = useParams();
  const [searchParams] = useSearchParams();
  const playerName = searchParams.get("name") || "";

  const handleConnect = useCallback((ws) => {
    if (playerName) {
      ws.send(JSON.stringify({ action: "join", name: playerName }));
    }
  }, [playerName]);

  const { gameState, send, setAnswered, reconnect } = useDuelSocket(roomCode, handleConnect);

  function handleAnswer(answer) {
    send("answer", { answer });
    setAnswered();
  }

  const { phase } = gameState;

  return (
    <div className="duel-root duel-student-view">
      {phase === "connecting" && (
        <div className="duel-center-message">
          <span className="duel-spinner" />
          Verbinde mit Raum...
        </div>
      )}

      {phase === "connected" && (
        <div className="duel-center-message">
          <span className="duel-spinner" />
          Trete bei...
        </div>
      )}

      {phase === "error" && (
        <div className="duel-center-message duel-error-box">
          <div className="duel-error-icon">!</div>
          <p>{gameState.error || "Verbindungsfehler"}</p>
          <button className="duel-btn duel-btn-join" onClick={reconnect} style={{ marginTop: 16 }}>
            Erneut verbinden
          </button>
          <a href="/duel" style={{ marginTop: 12, display: "inline-block", color: "#aaa" }}>
            Zurück
          </a>
        </div>
      )}

      {phase === "disconnected" && (
        <div className="duel-center-message duel-error-box">
          <div className="duel-error-icon">!</div>
          <p>Verbindung verloren</p>
          <button className="duel-btn duel-btn-join" onClick={reconnect} style={{ marginTop: 16 }}>
            Neu verbinden
          </button>
          <a href="/duel" style={{ marginTop: 12, display: "inline-block", color: "#aaa" }}>
            Zurück
          </a>
        </div>
      )}

      {gameState.error && phase !== "error" && phase !== "disconnected" && (
        <div className="duel-error-toast">{gameState.error}</div>
      )}

      {phase === "lobby" && (
        <DuelLobby
          players={gameState.players}
          roomCode={roomCode}
          mode={gameState.mode}
          isHost={false}
        />
      )}

      {phase === "countdown" && <DuelCountdown />}

      {phase === "question" && (
        <div className="duel-game-hud">
          <div className="duel-hud-stats">
            <span className="duel-hud-score">{gameState.myScore} Pkt</span>
            {gameState.myStreak >= 2 && (
              <span className="duel-hud-streak">{gameState.myStreak}x Streak</span>
            )}
            <span className="duel-hud-round">
              Runde {gameState.round}/{gameState.totalRounds}
            </span>
          </div>
          {gameState.myAlive ? (
            <DuelQuestion
              question={gameState.currentQuestion}
              timerSeconds={gameState.timerSeconds}
              onAnswer={handleAnswer}
              answered={gameState.answered}
            />
          ) : (
            <div className="duel-eliminated-spectator">
              <div className="duel-eliminated-badge">Eliminiert</div>
              <p>Du schaust den anderen zu.</p>
            </div>
          )}
        </div>
      )}

      {phase === "reveal" && (
        <div className="duel-reveal">
          <div className="duel-reveal-header">
            {!gameState.myAlive && gameState.mode === "royale" ? (
              <div className="duel-reveal-wrong">Eliminiert!</div>
            ) : gameState.playerResults.find((p) => p.id === gameState.myPlayerId)?.correct ? (
              <div className="duel-reveal-correct">Richtig!</div>
            ) : (
              <div className="duel-reveal-wrong">Falsch!</div>
            )}
          </div>
          <div className="duel-reveal-points">
            +{gameState.playerResults.find((p) => p.id === gameState.myPlayerId)?.points_earned || 0} Punkte
          </div>
          <div className="duel-reveal-total">
            Gesamt: {gameState.myScore}
          </div>
        </div>
      )}

      {phase === "scoreboard" && (
        <DuelScoreboard
          rankings={gameState.rankings}
          round={gameState.round}
          totalRounds={gameState.totalRounds}
        />
      )}

      {phase === "game_over" && (
        <DuelVictory
          rankings={gameState.rankings}
          winner={gameState.winner}
          mode={gameState.mode}
        />
      )}
    </div>
  );
}
