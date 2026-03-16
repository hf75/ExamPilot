import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";

export default function DuelTeacherSetup() {
  const [pools, setPools] = useState([]);
  const [selectedPools, setSelectedPools] = useState([]);
  const [mode, setMode] = useState("duel");
  const [totalRounds, setTotalRounds] = useState(5);
  const [timerSeconds, setTimerSeconds] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState("pools"); // "pools" or "document"
  const [file, setFile] = useState(null);
  const fileRef = useRef();
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/api/duels/pools-for-duel").then(setPools).catch(() => {});
  }, []);

  function togglePool(id) {
    setSelectedPools((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError("");

    if (source === "pools") {
      if (selectedPools.length === 0) {
        setError("Mindestens einen Pool auswählen");
        return;
      }
      setLoading(true);
      try {
        const data = await api.post("/api/duels/create", {
          mode,
          pool_ids: selectedPools,
          total_rounds: totalRounds,
          timer_seconds: timerSeconds,
        });
        navigate(`/duel/live/${data.room_code}`);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    } else {
      if (!file) {
        setError("Bitte ein Dokument auswählen");
        return;
      }
      setLoading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("mode", mode);
        formData.append("total_rounds", String(totalRounds));
        formData.append("timer_seconds", String(timerSeconds));
        const data = await api.postForm("/api/duels/create-from-document", formData);
        navigate(`/duel/live/${data.room_code}`);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
  }

  const totalDuelTasks = pools
    .filter((p) => selectedPools.includes(p.id))
    .reduce((sum, p) => sum + p.duel_task_count, 0);

  const canCreate =
    source === "pools" ? selectedPools.length > 0 : !!file;

  return (
    <div className="duel-setup-page">
      <h2>Lern-Duell erstellen</h2>

      {error && <div className="error-message">{error}</div>}

      <form onSubmit={handleCreate}>
        <div className="form-group">
          <label>Spielmodus</label>
          <div className="duel-mode-selector">
            <button
              type="button"
              className={`duel-mode-btn ${mode === "duel" ? "active" : ""}`}
              onClick={() => setMode("duel")}
            >
              <strong>Klassisches Duell</strong>
              <small>1 gegen 1, wer mehr Punkte hat gewinnt</small>
            </button>
            <button
              type="button"
              className={`duel-mode-btn ${mode === "royale" ? "active" : ""}`}
              onClick={() => setMode("royale")}
            >
              <strong>Battle Royale</strong>
              <small>Ganze Klasse, falsche Antwort = raus</small>
            </button>
          </div>
        </div>

        <div className="form-group">
          <label>Fragenquelle</label>
          <div className="duel-source-selector">
            <button
              type="button"
              className={`duel-source-btn ${source === "pools" ? "active" : ""}`}
              onClick={() => setSource("pools")}
            >
              Aufgabenpools
            </button>
            <button
              type="button"
              className={`duel-source-btn ${source === "document" ? "active" : ""}`}
              onClick={() => setSource("document")}
            >
              Dokument (KI-generiert)
            </button>
          </div>
        </div>

        {source === "pools" ? (
          <div className="form-group">
            <label>Aufgabenpools</label>
            <div className="duel-pool-list">
              {pools.map((pool) => (
                <label
                  key={pool.id}
                  className={`duel-pool-item ${selectedPools.includes(pool.id) ? "selected" : ""} ${pool.duel_task_count === 0 ? "empty" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedPools.includes(pool.id)}
                    onChange={() => togglePool(pool.id)}
                    disabled={pool.duel_task_count === 0}
                  />
                  <span>{pool.name}</span>
                  <span className="duel-pool-count">
                    {pool.duel_task_count} Fragen
                  </span>
                </label>
              ))}
            </div>
            {totalDuelTasks > 0 && (
              <small className="duel-pool-summary">
                {totalDuelTasks} Fragen verfügbar
              </small>
            )}
          </div>
        ) : (
          <div className="form-group">
            <label>Dokument hochladen (PDF oder DOCX)</label>
            <div
              className={`duel-drop-zone ${file ? "has-file" : ""}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("dragover"); }}
              onDragLeave={(e) => e.currentTarget.classList.remove("dragover")}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove("dragover");
                const f = e.dataTransfer.files[0];
                if (f) setFile(f);
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx"
                style={{ display: "none" }}
                onChange={(e) => setFile(e.target.files[0] || null)}
              />
              {file ? (
                <div className="duel-file-info">
                  <span className="duel-file-icon">📄</span>
                  <span>{file.name}</span>
                  <button
                    type="button"
                    className="duel-file-remove"
                    onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="duel-drop-text">
                  <span>📁</span>
                  <span>Klicken oder Datei hierher ziehen</span>
                  <small>Die KI erzeugt automatisch Quiz-Fragen aus dem Inhalt</small>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="rounds">Runden</label>
            <input
              id="rounds"
              type="number"
              min={3}
              max={20}
              value={totalRounds}
              onChange={(e) => setTotalRounds(parseInt(e.target.value) || 5)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="timer">Timer (Sekunden)</label>
            <input
              id="timer"
              type="number"
              min={10}
              max={60}
              value={timerSeconds}
              onChange={(e) => setTimerSeconds(parseInt(e.target.value) || 20)}
            />
          </div>
        </div>

        <button
          type="submit"
          className="btn-primary"
          disabled={loading || !canCreate}
        >
          {loading
            ? source === "document"
              ? "KI erzeugt Fragen..."
              : "Erstelle..."
            : "Raum erstellen"}
        </button>
      </form>
    </div>
  );
}
