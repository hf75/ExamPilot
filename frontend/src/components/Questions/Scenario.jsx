import { useState, useRef, useEffect } from "react";
import { api } from "../../api/client";
import { toast } from "../shared/Toast";
import Markdown from "../Markdown";

export default function Scenario({ task, questionData, answer, onChange, disabled, sessionId, preview }) {
  const [transcript, setTranscript] = useState(() => {
    try { return answer ? JSON.parse(answer) : []; }
    catch { return []; }
  });
  const [currentSituation, setCurrentSituation] = useState(null);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [finished, setFinished] = useState(false);
  const [outcomeSummary, setOutcomeSummary] = useState("");
  const bottomRef = useRef(null);
  const maxDecisions = questionData?.max_decisions || 5;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, currentSituation]);

  // Restore state on mount
  useEffect(() => {
    if (answer) {
      try {
        const parsed = JSON.parse(answer);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTranscript(parsed);
          // Find last situation to restore current state
          const lastSituation = [...parsed].reverse().find(e => e.role === "situation");
          if (lastSituation?.data) {
            if (lastSituation.data.outcome_summary || !lastSituation.data.options?.length) {
              setFinished(true);
              setOutcomeSummary(lastSituation.data.outcome_summary || "");
              setCurrentSituation(lastSituation.data.situation);
              setOptions([]);
            } else {
              setCurrentSituation(lastSituation.data.situation);
              setOptions(lastSituation.data.options || []);
            }
          }
        }
      } catch { /* ignore */ }
    }
  }, []);

  async function startScenario() {
    setLoading(true);
    try {
      const endpoint = preview ? "/api/exams/preview/scenario-next" : "/api/student/scenario-next";
      const payload = preview
        ? { task_id: task.id, transcript: [], chosen_option: null }
        : { session_id: sessionId, task_id: task.id, transcript: [], chosen_option: null };
      const result = await api.post(endpoint, payload);

      const entry = { role: "situation", content: result.situation, data: result };
      const newTranscript = [entry];
      setTranscript(newTranscript);
      setCurrentSituation(result.situation);
      setOptions(result.options || []);
      onChange(JSON.stringify(newTranscript));

      if (result.outcome_summary || !result.options?.length) {
        setFinished(true);
        setOutcomeSummary(result.outcome_summary || "");
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleChoice(optionIndex) {
    if (loading || disabled || finished || options.length === 0) return;

    const chosenText = options[optionIndex];
    const decisionEntry = { role: "decision", content: chosenText, chosen_index: optionIndex };
    const updatedTranscript = [...transcript, decisionEntry];
    setTranscript(updatedTranscript);
    setOptions([]);
    setLoading(true);

    try {
      const endpoint = preview ? "/api/exams/preview/scenario-next" : "/api/student/scenario-next";
      const payload = preview
        ? { task_id: task.id, transcript: updatedTranscript, chosen_option: optionIndex }
        : { session_id: sessionId, task_id: task.id, transcript: updatedTranscript, chosen_option: optionIndex };
      const result = await api.post(endpoint, payload);

      const situationEntry = { role: "situation", content: result.situation, data: result };
      const finalTranscript = [...updatedTranscript, situationEntry];
      setTranscript(finalTranscript);
      setCurrentSituation(result.situation);
      setOptions(result.options || []);
      onChange(JSON.stringify(finalTranscript));

      if (result.outcome_summary || !result.options?.length) {
        setFinished(true);
        setOutcomeSummary(result.outcome_summary || "");
      }
    } catch (err) {
      // Save what we have so far
      onChange(JSON.stringify(updatedTranscript));
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  const decisionsMade = transcript.filter(e => e.role === "decision").length;
  const decisionsLeft = maxDecisions - decisionsMade;
  const hasStarted = transcript.length > 0;

  return (
    <div className="scenario-game">
      <div className="scenario-info">
        <span>{decisionsLeft} {decisionsLeft === 1 ? "Entscheidung" : "Entscheidungen"} übrig</span>
      </div>

      <div className="scenario-content">
        {!hasStarted && !disabled && (
          <div className="scenario-start">
            <p>In diesem Szenario triffst du Entscheidungen in einer realitätsnahen Situation. Jede Entscheidung hat Konsequenzen.</p>
            <button
              className="btn-primary-sm"
              onClick={startScenario}
              disabled={loading}
            >
              {loading ? "Szenario wird geladen..." : "Szenario starten"}
            </button>
          </div>
        )}

        {/* History of past situations and decisions */}
        {transcript.length > 0 && (
          <div className="scenario-timeline">
            {transcript.map((entry, i) => {
              // Don't show the last situation separately — it's the "current" one
              const isLastSituation = entry.role === "situation" && i === transcript.length - 1;
              if (isLastSituation) return null;

              return (
                <div key={i} className={`scenario-entry scenario-entry-${entry.role}`}>
                  <div className="scenario-entry-marker">
                    {entry.role === "situation" ? "📋" : "👉"}
                  </div>
                  <div className="scenario-entry-body">
                    <div className="scenario-entry-label">
                      {entry.role === "situation" ? "Situation" : "Deine Entscheidung"}
                    </div>
                    <div className="scenario-entry-text">
                      <Markdown>{entry.content}</Markdown>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Current situation */}
        {currentSituation && (
          <div className="scenario-current">
            <div className="scenario-situation">
              <Markdown>{currentSituation}</Markdown>
            </div>

            {outcomeSummary && (
              <div className="scenario-outcome">
                <strong>Zusammenfassung:</strong>
                <Markdown>{outcomeSummary}</Markdown>
              </div>
            )}

            {!disabled && !finished && options.length > 0 && !loading && (
              <div className="scenario-options">
                {options.map((opt, i) => (
                  <button
                    key={i}
                    className="scenario-option-btn"
                    onClick={() => handleChoice(i)}
                  >
                    <span className="scenario-option-letter">{String.fromCharCode(65 + i)}</span>
                    <span className="scenario-option-text">{opt}</span>
                  </button>
                ))}
              </div>
            )}

            {loading && (
              <div className="scenario-loading">
                Nächste Situation wird generiert...
              </div>
            )}
          </div>
        )}

        {finished && !loading && (
          <div className="scenario-done">
            Szenario abgeschlossen.
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
