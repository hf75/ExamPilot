import { useState, useEffect } from "react";
import { api } from "../../api/client";
import { toast } from "../shared/Toast";
import Markdown from "../Markdown";

const OPTION_COLORS = ["duel-opt-red", "duel-opt-blue", "duel-opt-yellow", "duel-opt-green"];
const OPTION_LABELS = ["A", "B", "C", "D"];

export default function DuelPreview({ roomCode, onClose }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showSolutions, setShowSolutions] = useState(false);

  useEffect(() => {
    loadPreview();
  }, [roomCode]);

  async function loadPreview() {
    try {
      const data = await api.get(`/api/duels/room/${roomCode}/preview`);
      setQuestions(data.questions || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="modal-overlay">
        <div className="modal" style={{ maxWidth: 500 }}>
          <div className="modal-body"><p>Fragen werden geladen...</p></div>
        </div>
      </div>
    );
  }

  const q = questions[currentIndex];

  return (
    <div className="modal-overlay">
      <div className="modal duel-preview-modal duel-preview-mobile-only">
        <div className="modal-header">
          <h3>Handy-Vorschau</h3>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <div className="duel-preview-controls">
          <div className="duel-preview-nav">
            {questions.map((_, i) => (
              <button
                key={i}
                className={`duel-preview-dot ${i === currentIndex ? "active" : ""}`}
                onClick={() => setCurrentIndex(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <label className="preview-solutions-toggle">
            <input
              type="checkbox"
              checked={showSolutions}
              onChange={(e) => setShowSolutions(e.target.checked)}
            />
            Lösungen
          </label>
        </div>

        <div className="duel-preview-body">
          {q && (
            <div className="phone-frame">
              <div className="phone-notch" />
              <div className="phone-screen">
                <MobilePreview question={q} showSolutions={showSolutions} />
              </div>
            </div>
          )}
        </div>

        <div className="duel-preview-footer">
          <button
            className="btn-secondary"
            onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
            disabled={currentIndex === 0}
          >
            &larr; Vorherige
          </button>
          <span className="duel-preview-counter">
            Frage {currentIndex + 1} / {questions.length}
          </span>
          <button
            className="btn-secondary"
            onClick={() => setCurrentIndex(Math.min(questions.length - 1, currentIndex + 1))}
            disabled={currentIndex === questions.length - 1}
          >
            Nächste &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}


function MobilePreview({ question, showSolutions }) {
  return (
    <div className="duel-question-container">
      <div className="duel-timer-bar">
        <div className="duel-timer-fill" style={{ width: "60%" }} />
      </div>
      <div className="duel-timer-text">12s</div>

      <div className="duel-question-text">
        {question.title && question.text && <h3 className="duel-question-title">{question.title}</h3>}
        <Markdown>{question.text || question.title}</Markdown>
      </div>

      {question.task_type === "numerical" ? (
        <div className="duel-numerical-form">
          <input
            type="text"
            className="duel-numerical-input"
            placeholder={showSolutions ? question.correct_answer : "Antwort eingeben..."}
            disabled
            value={showSolutions ? question.correct_answer || "" : ""}
          />
          <button className="duel-btn duel-btn-submit" disabled>
            Antworten
          </button>
        </div>
      ) : (
        <div className="duel-options-grid">
          {question.options?.map((opt, i) => {
            const isCorrect = question.task_type === "multichoice"
              ? question.correct_indices?.includes(opt.index)
              : String(opt.index) === question.correct_answer;
            return (
              <button
                key={i}
                className={`duel-option ${OPTION_COLORS[i % 4]} ${showSolutions && isCorrect ? "correct-glow" : ""}`}
                disabled
              >
                <span className="duel-option-label">{OPTION_LABELS[i]}</span>
                <span className="duel-option-text">{opt.text}</span>
                {showSolutions && isCorrect && <span className="duel-check">&#10003;</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
