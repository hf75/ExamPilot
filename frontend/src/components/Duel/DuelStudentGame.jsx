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

  // Send join directly in WebSocket onopen — bypasses React render cycle
  const handleConnect = useCallback((ws) => {
    if (playerName) {
      ws.send(JSON.stringify({ action: "join", name: playerName }));
    }
  }, [playerName]);

  const { gameState, send, setAnswered } = useDuelSocket(roomCode, handleConnect);

  function handleAnswer(answer) {
    send("answer", { answer });
    setAnswered();
  }

  const { phase } = gameState;

  return (
    <div className="duel-root duel-student-view">
      {(phase === "connecting" || phase === "connected") && (
        <div className="duel-center-message">Verbinde...</div>
      )}

      {phase === "disconnected" && (
        <div className="duel-center-message duel-error">
          Verbindung verloren. <a href={`/duel/play/${roomCode}?name=${encodeURIComponent(playerName)}`}>Neu verbinden</a>
        </div>
      )}

      {gameState.error && (
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
          <DuelQuestion
            question={gameState.currentQuestion}
            timerSeconds={gameState.timerSeconds}
            onAnswer={handleAnswer}
            answered={gameState.answered}
          />
        </div>
      )}

      {phase === "reveal" && (
        <div className="duel-reveal">
          <div className="duel-reveal-header">
            {gameState.playerResults.find((p) => p.id === gameState.myPlayerId)?.correct ? (
              <div className="duel-reveal-correct">Richtig!</div>
            ) : (
              <div className="duel-reveal-wrong">
                {!gameState.myAlive && gameState.mode === "royale"
                  ? "Eliminiert!"
                  : "Falsch!"}
              </div>
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
          isHost={false}
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
