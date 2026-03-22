import { useState, useEffect } from "react";

export default function Cloze({ task, questionData, answer, onChange, disabled }) {
  const gaps = questionData.gaps || [];

  const [gapAnswers, setGapAnswers] = useState(() => {
    try {
      const parsed = JSON.parse(answer || "[]");
      return Array.isArray(parsed) ? parsed : new Array(gaps.length).fill("");
    } catch {
      return new Array(gaps.length).fill("");
    }
  });

  useEffect(() => {
    try {
      const parsed = JSON.parse(answer || "[]");
      if (Array.isArray(parsed) && JSON.stringify(parsed) !== JSON.stringify(gapAnswers)) {
        setGapAnswers(parsed);
      }
    } catch {}
  }, [answer]);

  useEffect(() => {
    onChange(JSON.stringify(gapAnswers));
  }, [gapAnswers]);

  function handleGapChange(idx, value) {
    if (disabled) return;
    setGapAnswers((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  }

  // Split text by gap markers [[1]], [[2]], etc.
  const text = task.text || "";
  const parts = text.split(/\[\[(\d+)\]\]/);

  return (
    <div className="question-cloze">
      <div className="cloze-text">
        {parts.map((part, i) => {
          if (i % 2 === 0) {
            // Regular text
            return <span key={i}>{part}</span>;
          }
          // Gap number (1-based in text, 0-based in array)
          const gapIdx = parseInt(part) - 1;
          if (gapIdx < 0 || gapIdx >= gaps.length) {
            return <span key={i}>[[{part}]]</span>;
          }

          const gap = gaps[gapIdx];
          const gapType = gap?.type || "shortanswer";

          if (gapType === "multichoice" || gapType === "mc") {
            const options = gap.answers || [];
            return (
              <select
                key={i}
                className="cloze-select"
                value={gapAnswers[gapIdx] ?? ""}
                onChange={(e) => handleGapChange(gapIdx, e.target.value)}
                disabled={disabled}
              >
                <option value="">---</option>
                {options.map((opt, j) => (
                  <option key={j} value={j}>{opt.text}</option>
                ))}
              </select>
            );
          }

          // shortanswer or numerical
          return (
            <input
              key={i}
              type={gapType === "numerical" ? "number" : "text"}
              className="cloze-input"
              value={gapAnswers[gapIdx] ?? ""}
              onChange={(e) => handleGapChange(gapIdx, e.target.value)}
              disabled={disabled}
              placeholder="..."
              step={gapType === "numerical" ? "any" : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
