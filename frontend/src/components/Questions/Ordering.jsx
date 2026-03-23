import { useState, useEffect, useMemo } from "react";
import InlineMarkdown from "./InlineMarkdown";

export default function Ordering({ task, questionData, answer, onChange, disabled }) {
  const items = questionData.items || [];
  const horizontal = questionData.horizontal || false;

  // Initialize with shuffled order
  const [order, setOrder] = useState(() => {
    try {
      const parsed = JSON.parse(answer || "null");
      if (Array.isArray(parsed) && parsed.length === items.length) return parsed;
    } catch {}
    // Shuffle initially
    const indices = items.map((_, i) => i);
    let seed = (task.id || 1) * 31;
    for (let i = indices.length - 1; i > 0; i--) {
      seed = (seed * 16807) % 2147483647;
      const j = seed % (i + 1);
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices;
  });

  useEffect(() => {
    try {
      const parsed = JSON.parse(answer || "null");
      if (Array.isArray(parsed) && parsed.length === items.length && JSON.stringify(parsed) !== JSON.stringify(order)) {
        setOrder(parsed);
      }
    } catch {}
  }, [answer]);

  useEffect(() => {
    onChange(JSON.stringify(order));
  }, [order]);

  function moveUp(idx) {
    if (disabled || idx === 0) return;
    setOrder((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }

  function moveDown(idx) {
    if (disabled || idx === order.length - 1) return;
    setOrder((prev) => {
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }

  // Drag and drop
  const [dragIdx, setDragIdx] = useState(null);

  function handleDragStart(idx) {
    setDragIdx(idx);
  }

  function handleDragOver(e, idx) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    setOrder((prev) => {
      const next = [...prev];
      const item = next.splice(dragIdx, 1)[0];
      next.splice(idx, 0, item);
      return next;
    });
    setDragIdx(idx);
  }

  function handleDragEnd() {
    setDragIdx(null);
  }

  return (
    <div className={`question-ordering ${horizontal ? "ordering-horizontal" : ""}`}>
      <p className="ordering-hint">Bringe die Elemente in die richtige Reihenfolge (Drag & Drop oder Pfeile):</p>
      <div className={`ordering-list ${horizontal ? "ordering-row" : ""}`}>
        {order.map((itemIdx, pos) => (
          <div
            key={itemIdx}
            className={`ordering-item ${dragIdx === pos ? "ordering-dragging" : ""}`}
            draggable={!disabled}
            onDragStart={() => handleDragStart(pos)}
            onDragOver={(e) => handleDragOver(e, pos)}
            onDragEnd={handleDragEnd}
          >
            <span className="ordering-number">{pos + 1}.</span>
            <span className="ordering-text"><InlineMarkdown>{items[itemIdx]}</InlineMarkdown></span>
            {!disabled && (
              <span className="ordering-buttons">
                <button onClick={() => moveUp(pos)} disabled={pos === 0} title="Nach oben">&uarr;</button>
                <button onClick={() => moveDown(pos)} disabled={pos === order.length - 1} title="Nach unten">&darr;</button>
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
