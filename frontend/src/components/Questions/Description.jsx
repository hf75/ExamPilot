import { useEffect } from "react";

export default function Description({ task, questionData, answer, onChange, disabled }) {
  // Auto-mark as "answered" since no response needed
  useEffect(() => {
    if (!answer) onChange("_seen");
  }, []);

  return (
    <div className="question-description">
      <p className="description-note">Diese Aufgabe erfordert keine Antwort.</p>
    </div>
  );
}
