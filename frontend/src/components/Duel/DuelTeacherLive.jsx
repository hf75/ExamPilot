import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import useDuelSocket from "./useDuelSocket";
import DuelLobby from "./DuelLobby";
import DuelCountdown from "./DuelCountdown";
import DuelScoreboard from "./DuelScoreboard";
import DuelVictory from "./DuelVictory";
import Markdown from "../Markdown";
import "./duel.css";

const OPTION_COLORS = ["duel-opt-red", "duel-opt-blue", "duel-opt-yellow", "duel-opt-green"];
const OPTION_LABELS = ["A", "B", "C", "D"];

export default function DuelTeacherLive() {
  const { roomCode } = useParams();

  // Send host_connect directly in WebSocket onopen — bypasses React render cycle
  const handleConnect = useCallback((ws) => {
    const token = localStorage.getItem("teacher_token");
    ws.send(JSON.stringify({ action: "host_connect", token }));
  }, []);

  const { gameState, send, reconnect } = useDuelSocket(roomCode, handleConnect);

  const { phase } = gameState;

  return (
    <div className="duel-root duel-live-view">
      {(phase === "connecting" || phase === "connected") && (
        <div className="duel-center-message">
          <span className="duel-spinner" />
          Verbinde mit Raum...
        </div>
      )}

      {phase === "error" && (
        <div className="duel-center-message duel-error-box">
          <div className="duel-error-icon">!</div>
          <p>{gameState.error || "Verbindungsfehler"}</p>
          <button className="duel-btn duel-btn-join" onClick={reconnect} style={{ marginTop: 16 }}>
            Erneut verbinden
          </button>
        </div>
      )}

      {phase === "disconnected" && (
        <div className="duel-center-message duel-error-box">
          <div className="duel-error-icon">!</div>
          <p>Verbindung verloren</p>
          <button className="duel-btn duel-btn-join" onClick={reconnect} style={{ marginTop: 16 }}>
            Neu verbinden
          </button>
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
          isHost={true}
          onStart={() => send("start_game")}
        />
      )}

      {phase === "countdown" && <DuelCountdown />}

      {phase === "question" && (
        <LiveQuestion
          question={gameState.currentQuestion}
          round={gameState.round}
          totalRounds={gameState.totalRounds}
          answeredCount={gameState.answeredCount}
          totalPlayers={gameState.totalPlayers}
          timerSeconds={gameState.timerSeconds}
          answeredPlayers={gameState.answeredPlayers}
        />
      )}

      {phase === "reveal" && (
        <LiveReveal
          question={gameState.currentQuestion}
          correctInfo={gameState.correctInfo}
          playerResults={gameState.playerResults}
          eliminations={gameState.eliminations}
        />
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


const EFFECTS = ["effect-zap", "effect-flame", "effect-star", "effect-boom", "effect-wave", "effect-glow"];

function LiveQuestion({ question, round, totalRounds, answeredCount, totalPlayers, timerSeconds, answeredPlayers }) {
  const { timeLeft } = useLiveTimer(timerSeconds);
  const timerPercent = (timeLeft / timerSeconds) * 100;

  return (
    <div className="duel-live-question">
      <div className={`duel-timer-bar ${timeLeft < 5 ? "urgent" : ""}`}>
        <div className="duel-timer-fill" style={{ width: `${timerPercent}%` }} />
      </div>

      <div className="duel-live-header">
        <span>Runde {round}/{totalRounds}</span>
        <span className="duel-answer-counter">
          {answeredCount}/{totalPlayers} haben geantwortet
        </span>
        <span>{Math.ceil(timeLeft)}s</span>
      </div>

      <div className="duel-live-question-text">
        {question.title && question.text && <h2>{question.title}</h2>}
        <Markdown>{question.text || question.title}</Markdown>
      </div>

      {question.options && (
        <div className="duel-live-options">
          {question.options.map((opt, i) => (
            <div key={i} className={`duel-live-option ${OPTION_COLORS[i % 4]}`}>
              <span className="duel-option-label">{OPTION_LABELS[i]}</span>
              <span>{opt.text}</span>
            </div>
          ))}
        </div>
      )}

      {question.task_type === "numerical" && (
        <div className="duel-live-numerical">
          <span>Numerische Eingabe</span>
        </div>
      )}

      {/* Live answer feed — names fly in with random effects */}
      <div className="duel-answer-feed">
        {answeredPlayers.map((ap, i) => {
          const effect = EFFECTS[i % EFFECTS.length];
          return (
            <div key={`${ap.id}-${ap.ts}`} className={`duel-answer-chip ${effect}`}>
              <span className="duel-answer-chip-icon">{
                effect === "effect-zap" ? "\u26A1" :
                effect === "effect-flame" ? "\uD83D\uDD25" :
                effect === "effect-star" ? "\u2B50" :
                effect === "effect-boom" ? "\uD83D\uDCA5" :
                effect === "effect-wave" ? "\uD83C\uDF0A" :
                "\u2728"
              }</span>
              <span className="duel-answer-chip-name">{ap.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}


function LiveReveal({ question, correctInfo, playerResults, eliminations }) {
  return (
    <div className="duel-live-reveal">
      <h2 className="duel-reveal-title">Auflösung</h2>

      {question.options && correctInfo && (
        <div className="duel-live-options">
          {question.options.map((opt, i) => {
            let isCorrect = false;
            if (correctInfo.task_type === "multichoice") {
              isCorrect = correctInfo.correct_indices?.includes(opt.index);
            } else if (correctInfo.task_type === "truefalse") {
              isCorrect = String(opt.index) === correctInfo.correct_answer;
            }
            return (
              <div
                key={i}
                className={`duel-live-option ${OPTION_COLORS[i % 4]} ${isCorrect ? "correct-glow" : "dimmed"}`}
              >
                <span className="duel-option-label">{OPTION_LABELS[i]}</span>
                <span>{opt.text}</span>
                {isCorrect && <span className="duel-check">✓</span>}
              </div>
            );
          })}
        </div>
      )}

      {correctInfo?.task_type === "numerical" && (
        <div className="duel-live-correct-answer">
          Richtige Antwort: <strong>{correctInfo.correct_answer}</strong>
        </div>
      )}

      <div className="duel-reveal-players">
        {playerResults.map((p) => (
          <div key={p.id} className={`duel-reveal-player ${p.correct ? "correct" : "wrong"}`}>
            <span>{p.name}</span>
            <span>{p.correct ? `+${p.points_earned}` : "0"}</span>
          </div>
        ))}
      </div>

      {eliminations.length > 0 && (
        <div className="duel-eliminations">
          {eliminations.map((e) => (
            <div key={e.player_id} className="duel-elimination-banner">
              {e.player_name} wurde eliminiert!
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function useLiveTimer(seconds) {
  const [timeLeft, setTimeLeft] = useState(seconds);

  useEffect(() => {
    setTimeLeft(seconds);
  }, [seconds]);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const t = setInterval(() => setTimeLeft((v) => Math.max(0, v - 0.1)), 100);
    return () => clearInterval(t);
  }, [timeLeft]);

  return { timeLeft };
}
