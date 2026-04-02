import { useState, useEffect, useRef } from "react";

export default function TrueFalse({ task, questionData, answer, onChange, disabled }) {
  const [selected, setSelected] = useState(answer || "");
  const isInternal = useRef(false);

  // Sync from parent (external answer changes)
  useEffect(() => {
    if (!isInternal.current && answer !== selected) {
      setSelected(answer || "");
    }
    isInternal.current = false;
  }, [answer]);

  function handleChange(value) {
    if (disabled) return;
    isInternal.current = true;
    setSelected(value);
    onChange(value);
  }

  return (
    <div className="question-truefalse">
      <label className={`mc-option ${selected === "true" ? "mc-selected" : ""}`}>
        <input
          type="radio"
          name={`tf-${task.id}`}
          checked={selected === "true"}
          onChange={() => handleChange("true")}
          disabled={disabled}
        />
        <span className="mc-text">Wahr</span>
      </label>
      <label className={`mc-option ${selected === "false" ? "mc-selected" : ""}`}>
        <input
          type="radio"
          name={`tf-${task.id}`}
          checked={selected === "false"}
          onChange={() => handleChange("false")}
          disabled={disabled}
        />
        <span className="mc-text">Falsch</span>
      </label>
    </div>
  );
}
