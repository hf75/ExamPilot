import { useState, useEffect } from "react";

const OPTION_COLORS = ["duel-opt-red", "duel-opt-blue", "duel-opt-yellow", "duel-opt-green"];
const OPTION_LABELS = ["A", "B", "C", "D"];

export default function DuelQuestion({ question, timerSeconds, onAnswer, answered }) {
  const [timeLeft, setTimeLeft] = useState(timerSeconds);
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    setTimeLeft(timerSeconds);
    setInputValue("");
  }, [question, timerSeconds]);

  useEffect(() => {
    if (timeLeft <= 0 || answered) return;
    const t = setInterval(() => setTimeLeft((v) => Math.max(0, v - 0.1)), 100);
    return () => clearInterval(t);
  }, [timeLeft, answered]);

  const timerPercent = (timeLeft / timerSeconds) * 100;
  const timerUrgent = timeLeft < 5;
  const expired = timeLeft <= 0;
  const locked = answered || expired;

  function handleOptionClick(value) {
    if (locked) return;
    onAnswer(String(value));
  }

  function handleNumericalSubmit(e) {
    e.preventDefault();
    if (locked || !inputValue.trim()) return;
    onAnswer(inputValue.trim());
  }

  return (
    <div className="duel-question-container">
      <div className={`duel-timer-bar ${timerUrgent ? "urgent" : ""}`}>
        <div className="duel-timer-fill" style={{ width: `${timerPercent}%` }} />
      </div>
      <div className="duel-timer-text">{Math.ceil(timeLeft)}s</div>

      <div className="duel-question-text">
        {question.title && <h3 className="duel-question-title">{question.title}</h3>}
        <p>{question.text}</p>
      </div>

      {question.task_type === "numerical" ? (
        <form className="duel-numerical-form" onSubmit={handleNumericalSubmit}>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Antwort eingeben..."
            className="duel-numerical-input"
            disabled={locked}
            autoFocus
          />
          <button
            type="submit"
            className="duel-btn duel-btn-submit"
            disabled={locked || !inputValue.trim()}
          >
            {answered ? "Gesendet" : expired ? "Zeit abgelaufen" : "Antworten"}
          </button>
        </form>
      ) : (
        <div className="duel-options-grid">
          {question.options?.map((opt, i) => (
            <button
              key={i}
              className={`duel-option ${OPTION_COLORS[i % 4]} ${locked ? "disabled" : ""}`}
              onClick={() => handleOptionClick(opt.index)}
              disabled={locked}
            >
              <span className="duel-option-label">{OPTION_LABELS[i]}</span>
              <span className="duel-option-text">{opt.text}</span>
            </button>
          ))}
        </div>
      )}

      {answered && (
        <div className="duel-waiting-badge">Warte auf andere Spieler...</div>
      )}
      {expired && !answered && (
        <div className="duel-waiting-badge duel-expired-badge">Zeit abgelaufen!</div>
      )}
    </div>
  );
}
