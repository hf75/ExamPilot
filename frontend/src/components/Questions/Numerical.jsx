export default function Numerical({ task, questionData, answer, onChange, disabled }) {
  return (
    <div className="question-numerical">
      <input
        type="number"
        className="numerical-input"
        value={answer || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Zahlenwert eingeben..."
        disabled={disabled}
        step="any"
      />
    </div>
  );
}
