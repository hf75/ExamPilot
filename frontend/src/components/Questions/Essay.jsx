export default function Essay({ task, questionData, answer, onChange, disabled }) {
  const lines = questionData.lines || 8;

  return (
    <div className="question-essay">
      <textarea
        value={answer || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Deine Antwort hier eingeben..."
        rows={lines}
        disabled={disabled}
      />
      <div className="char-count">
        {(answer || "").length} Zeichen
      </div>
    </div>
  );
}
