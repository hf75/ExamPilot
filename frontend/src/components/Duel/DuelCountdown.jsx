import { useState, useEffect } from "react";

export default function DuelCountdown({ onDone }) {
  const [count, setCount] = useState(3);

  useEffect(() => {
    if (count <= 0) {
      onDone?.();
      return;
    }
    const t = setTimeout(() => setCount(count - 1), 1000);
    return () => clearTimeout(t);
  }, [count, onDone]);

  return (
    <div className="duel-countdown-overlay">
      <div className={`duel-countdown-number ${count === 0 ? "go" : ""}`}>
        {count > 0 ? count : "LOS!"}
      </div>
    </div>
  );
}
