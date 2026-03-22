import { useState, useEffect, useMemo } from "react";

export default function MultiChoice({ task, questionData, answer, onChange, disabled }) {
  const single = questionData.single !== false;
  const answers = questionData.answers || [];

  // Parse existing answer
  const [selected, setSelected] = useState(() => {
    try {
      const parsed = JSON.parse(answer || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // Shuffle order (stable per task)
  const order = useMemo(() => {
    if (!questionData.shuffle) return answers.map((_, i) => i);
    const indices = answers.map((_, i) => i);
    // Simple seeded shuffle based on task id
    let seed = task.id || 1;
    for (let i = indices.length - 1; i > 0; i--) {
      seed = (seed * 16807) % 2147483647;
      const j = seed % (i + 1);
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices;
  }, [task.id, answers.length, questionData.shuffle]);

  useEffect(() => {
    try {
      const parsed = JSON.parse(answer || "[]");
      if (Array.isArray(parsed) && JSON.stringify(parsed) !== JSON.stringify(selected)) {
        setSelected(parsed);
      }
    } catch {}
  }, [answer]);

  useEffect(() => {
    onChange(JSON.stringify(selected));
  }, [selected]);

  function handleChange(idx) {
    if (disabled) return;
    if (single) {
      setSelected([idx]);
    } else {
      setSelected((prev) =>
        prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
      );
    }
  }

  return (
    <div className="question-multichoice">
      {order.map((idx) => (
        <label key={idx} className={`mc-option ${selected.includes(idx) ? "mc-selected" : ""}`}>
          <input
            type={single ? "radio" : "checkbox"}
            name={`mc-${task.id}`}
            checked={selected.includes(idx)}
            onChange={() => handleChange(idx)}
            disabled={disabled}
          />
          <span className="mc-text">{answers[idx]?.text}</span>
        </label>
      ))}
    </div>
  );
}
