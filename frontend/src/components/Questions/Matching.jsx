import { useState, useEffect, useMemo } from "react";

export default function Matching({ task, questionData, answer, onChange, disabled }) {
  const pairs = questionData.pairs || [];

  const [selections, setSelections] = useState(() => {
    try {
      const parsed = JSON.parse(answer || "{}");
      return typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  });

  // Shuffled answer options
  const answerOptions = useMemo(() => {
    const opts = pairs.map((p) => p.answer);
    if (questionData.shuffle !== false) {
      let seed = task.id || 1;
      const shuffled = [...opts];
      for (let i = shuffled.length - 1; i > 0; i--) {
        seed = (seed * 16807) % 2147483647;
        const j = seed % (i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    }
    return opts;
  }, [task.id, pairs.length, questionData.shuffle]);

  useEffect(() => {
    try {
      const parsed = JSON.parse(answer || "{}");
      if (typeof parsed === "object" && !Array.isArray(parsed) && JSON.stringify(parsed) !== JSON.stringify(selections)) {
        setSelections(parsed);
      }
    } catch {}
  }, [answer]);

  useEffect(() => {
    onChange(JSON.stringify(selections));
  }, [selections]);

  function handleSelect(questionIdx, value) {
    if (disabled) return;
    setSelections((prev) => ({ ...prev, [questionIdx]: value }));
  }

  return (
    <div className="question-matching">
      <table className="matching-table">
        <tbody>
          {pairs.map((pair, idx) => (
            <tr key={idx}>
              <td className="matching-question">{pair.question}</td>
              <td className="matching-arrow">&rarr;</td>
              <td className="matching-select">
                <select
                  value={selections[idx] || ""}
                  onChange={(e) => handleSelect(idx, e.target.value)}
                  disabled={disabled}
                >
                  <option value="">-- Zuordnung wählen --</option>
                  {answerOptions.map((opt, i) => (
                    <option key={i} value={opt}>{opt}</option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
