export default function ShortAnswer({ answer, onChange, disabled }) {
  return (
    <div className="question-shortanswer">
      <input
        type="text"
        className="shortanswer-input"
        value={answer || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Deine Antwort..."
        disabled={disabled}
        autoComplete="off"
      />
    </div>
  );
}
