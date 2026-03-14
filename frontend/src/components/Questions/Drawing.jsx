import { useState, useEffect, useRef, useCallback } from "react";

const MAX_HISTORY = 30;

export default function Drawing({ task, questionData, answer, onChange, disabled }) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#000000");
  const [brushSize, setBrushSize] = useState(3);
  const [history, setHistory] = useState([]);
  const exportTimer = useRef(null);

  const width = questionData?.canvas_width || 1600;
  const height = questionData?.canvas_height || 800;

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctxRef.current = ctx;

    // Fill white background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // Restore from saved answer
    if (answer && answer.startsWith("data:image")) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        saveSnapshot();
      };
      img.src = answer;
    } else {
      saveSnapshot();
    }
  }, []);

  function saveSnapshot() {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const snapshot = ctx.getImageData(0, 0, width, height);
    setHistory((prev) => {
      const next = [...prev, snapshot];
      return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
    });
  }

  const exportCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    onChange(dataUrl);
  }, [onChange]);

  function getPos(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function startDrawing(e) {
    if (disabled) return;
    e.preventDefault();
    const ctx = ctxRef.current;
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);

    ctx.globalCompositeOperation = "source-over";
    if (tool === "eraser") {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = brushSize * 4;
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize;
    }

    setIsDrawing(true);
  }

  function draw(e) {
    if (!isDrawing || disabled) return;
    e.preventDefault();
    const ctx = ctxRef.current;
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }

  function stopDrawing(e) {
    if (!isDrawing) return;
    if (e) e.preventDefault();
    const ctx = ctxRef.current;
    if (ctx) {
      ctx.closePath();
    }
    setIsDrawing(false);
    saveSnapshot();

    // Debounced export
    if (exportTimer.current) clearTimeout(exportTimer.current);
    exportTimer.current = setTimeout(exportCanvas, 500);
  }

  function handleUndo() {
    if (disabled || history.length <= 1) return;
    const ctx = ctxRef.current;
    if (!ctx) return;
    const newHistory = history.slice(0, -1);
    const prev = newHistory[newHistory.length - 1];
    ctx.putImageData(prev, 0, 0);
    setHistory(newHistory);

    if (exportTimer.current) clearTimeout(exportTimer.current);
    exportTimer.current = setTimeout(exportCanvas, 500);
  }

  function handleClear() {
    if (disabled) return;
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    saveSnapshot();
    onChange("");
  }

  // Fix eraser visual: after erasing, fill white behind
  // We handle this by drawing on a white background canvas
  useEffect(() => {
    return () => {
      if (exportTimer.current) clearTimeout(exportTimer.current);
    };
  }, []);

  return (
    <div className="question-drawing" style={{ flex: 1 }}>
      <div className="drawing-toolbar">
        <button
          type="button"
          className={`btn-tool ${tool === "pen" ? "active" : ""}`}
          onClick={() => setTool("pen")}
          disabled={disabled}
          title="Stift"
        >
          Stift
        </button>
        <button
          type="button"
          className={`btn-tool ${tool === "eraser" ? "active" : ""}`}
          onClick={() => setTool("eraser")}
          disabled={disabled}
          title="Radierer"
        >
          Radierer
        </button>

        <span className="toolbar-separator" />

        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          disabled={disabled}
          title="Farbe"
          className="color-picker"
        />

        <label className="brush-size-label" title="Strichstärke">
          <input
            type="range"
            min="1"
            max="12"
            value={brushSize}
            onChange={(e) => setBrushSize(parseInt(e.target.value))}
            disabled={disabled}
          />
          <span>{brushSize}px</span>
        </label>

        <span className="toolbar-separator" />

        <button
          type="button"
          className="btn-tool"
          onClick={handleUndo}
          disabled={disabled || history.length <= 1}
          title="Rückgängig"
        >
          Rückgängig
        </button>
        <button
          type="button"
          className="btn-tool"
          onClick={handleClear}
          disabled={disabled}
          title="Alles löschen"
        >
          Löschen
        </button>
      </div>

      <div className="drawing-canvas-wrapper">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="drawing-canvas"
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={stopDrawing}
          onPointerLeave={stopDrawing}
        />
      </div>
    </div>
  );
}
