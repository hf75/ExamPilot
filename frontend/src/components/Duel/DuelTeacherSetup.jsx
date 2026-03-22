import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { toast } from "../shared/Toast";
import Markdown from "../Markdown";
import DuelPreview from "./DuelPreview";

const OPTION_COLORS = ["duel-opt-red", "duel-opt-blue", "duel-opt-yellow", "duel-opt-green"];
const OPTION_LABELS = ["A", "B", "C", "D"];

export default function DuelTeacherSetup() {
  const [pools, setPools] = useState([]);
  const [poolQuestions, setPoolQuestions] = useState({}); // poolId -> question[]
  const [expandedPools, setExpandedPools] = useState(new Set());
  const [selectedTaskIds, setSelectedTaskIds] = useState(new Set());
  const [mode, setMode] = useState("duel");
  const [totalRounds, setTotalRounds] = useState(5);
  const [timerSeconds, setTimerSeconds] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState("pools");
  const [file, setFile] = useState(null);
  const fileRef = useRef();
  const navigate = useNavigate();
  const [showSolutions, setShowSolutions] = useState(false);
  const [showMobilePreview, setShowMobilePreview] = useState(false);

  // Document-based flow (kept separate)
  const [preparedRoom, setPreparedRoom] = useState(null);
  const [docQuestions, setDocQuestions] = useState([]);

  useEffect(() => {
    api.get("/api/duels/pools-for-duel").then(setPools).catch(() => {});
  }, []);

  async function togglePool(poolId) {
    if (expandedPools.has(poolId)) {
      setExpandedPools((prev) => { const n = new Set(prev); n.delete(poolId); return n; });
    } else {
      setExpandedPools((prev) => new Set(prev).add(poolId));
      // Load questions for this pool if not cached
      if (!poolQuestions[poolId]) {
        try {
          const questions = await api.get(`/api/duels/pool-questions/${poolId}`);
          setPoolQuestions((prev) => ({ ...prev, [poolId]: questions }));
        } catch {
          toast.error("Fragen konnten nicht geladen werden");
        }
      }
    }
  }

  function toggleAllInPool(poolId) {
    const questions = poolQuestions[poolId] || [];
    const ids = questions.map((q) => q.task_id);
    const allSelected = ids.every((id) => selectedTaskIds.has(id));
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  }

  function toggleTask(taskId) {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      next.has(taskId) ? next.delete(taskId) : next.add(taskId);
      return next;
    });
  }

  // Build selected questions list from all pools
  const selectedQuestions = [];
  for (const poolId in poolQuestions) {
    for (const q of poolQuestions[poolId]) {
      if (selectedTaskIds.has(q.task_id)) {
        selectedQuestions.push(q);
      }
    }
  }

  async function handleCreateRoom(e) {
    if (e) e.preventDefault();
    if (source === "pools") {
      if (selectedTaskIds.size === 0) {
        setError("Mindestens eine Frage auswählen");
        return;
      }
      setLoading(true);
      setError("");
      try {
        const data = await api.post("/api/duels/create", {
          mode,
          task_ids: [...selectedTaskIds],
          timer_seconds: timerSeconds,
        });
        navigate(`/duel/live/${data.room_code}`);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    } else {
      // Document flow — unchanged
      if (!file) { setError("Bitte ein Dokument auswählen"); return; }
      setLoading(true);
      setError("");
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("mode", mode);
        formData.append("total_rounds", String(totalRounds));
        formData.append("timer_seconds", String(timerSeconds));
        const data = await api.postForm("/api/duels/create-from-document", formData);
        setPreparedRoom(data);
        const preview = await api.get(`/api/duels/room/${data.room_code}/preview`);
        setDocQuestions(preview.questions || []);
        toast.success(`${data.task_count} Fragen erzeugt`);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
  }

  async function handleDeleteDocQuestion(index) {
    if (!preparedRoom) return;
    try {
      const result = await api.delete(`/api/duels/room/${preparedRoom.room_code}/question/${index}`);
      setDocQuestions((prev) => prev.filter((_, i) => i !== index));
    } catch (err) {
      toast.error(err.message);
    }
  }

  function handleDocReset() {
    if (preparedRoom) api.delete(`/api/duels/room/${preparedRoom.room_code}`).catch(() => {});
    setPreparedRoom(null);
    setDocQuestions([]);
  }

  // Which questions to show on the right side
  const rightQuestions = source === "pools" ? selectedQuestions : docQuestions;
  const hasSplit = source === "pools" ? selectedTaskIds.size > 0 : !!preparedRoom;

  return (
    <div className={`duel-setup-page ${hasSplit ? "duel-setup-split" : ""}`}>
      <div className="duel-setup-left">
        <h2>Lern-Duell erstellen</h2>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleCreateRoom}>
          <fieldset disabled={!!preparedRoom && source === "document"} style={{ border: "none", padding: 0, margin: 0, opacity: preparedRoom && source === "document" ? 0.5 : 1 }}>
          <div className="form-group">
            <label>Spielmodus</label>
            <div className="duel-mode-selector">
              <button type="button" className={`duel-mode-btn ${mode === "duel" ? "active" : ""}`} onClick={() => setMode("duel")}>
                <strong>Klassisches Duell</strong>
                <small>Wer mehr Punkte hat gewinnt</small>
              </button>
              <button type="button" className={`duel-mode-btn ${mode === "royale" ? "active" : ""}`} onClick={() => setMode("royale")}>
                <strong>Battle Royale</strong>
                <small>Ganze Klasse, falsche Antwort = raus</small>
              </button>
              <button type="button" className={`duel-mode-btn ${mode === "1v1" ? "active" : ""}`} onClick={() => setMode("1v1")}>
                <strong>1:1 Duell</strong>
                <small>Lehrer wählt 2 Spieler, Rest schaut zu</small>
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>Fragenquelle</label>
            <div className="duel-source-selector">
              <button type="button" className={`duel-source-btn ${source === "pools" ? "active" : ""}`} onClick={() => { setSource("pools"); handleDocReset(); }}>
                Aufgabenpools
              </button>
              <button type="button" className={`duel-source-btn ${source === "document" ? "active" : ""}`} onClick={() => setSource("document")}>
                Dokument (KI-generiert)
              </button>
            </div>
          </div>

          {source === "pools" ? (
            <div className="form-group">
              <label>Fragen auswählen</label>
              <PoolQuestionPicker
                pools={pools}
                poolQuestions={poolQuestions}
                expandedPools={expandedPools}
                selectedTaskIds={selectedTaskIds}
                onTogglePool={togglePool}
                onToggleAllInPool={toggleAllInPool}
                onToggleTask={toggleTask}
              />
            </div>
          ) : (
            <div className="form-group">
              <label>Dokument hochladen (PDF oder DOCX)</label>
              <div
                className={`duel-drop-zone ${file ? "has-file" : ""}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("dragover"); }}
                onDragLeave={(e) => e.currentTarget.classList.remove("dragover")}
                onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("dragover"); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
              >
                <input ref={fileRef} type="file" accept=".pdf,.docx" style={{ display: "none" }} onChange={(e) => setFile(e.target.files[0] || null)} />
                {file ? (
                  <div className="duel-file-info">
                    <span className="duel-file-icon">📄</span>
                    <span>{file.name}</span>
                    <button type="button" className="duel-file-remove" onClick={(e) => { e.stopPropagation(); setFile(null); }}>✕</button>
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
            {source === "document" && (
              <div className="form-group">
                <label htmlFor="rounds">Anzahl Fragen</label>
                <input id="rounds" type="number" min={3} max={20} value={totalRounds} onChange={(e) => setTotalRounds(parseInt(e.target.value) || 5)} />
              </div>
            )}
            <div className="form-group">
              <label htmlFor="timer">Timer (Sekunden)</label>
              <input id="timer" type="number" min={10} max={60} value={timerSeconds} onChange={(e) => setTimerSeconds(parseInt(e.target.value) || 20)} />
            </div>
          </div>

          {source === "pools" && selectedTaskIds.size > 0 && (
            <div className="duel-prepared-section">
              <p>{selectedTaskIds.size} {selectedTaskIds.size === 1 ? "Frage" : "Fragen"} = {selectedTaskIds.size} {selectedTaskIds.size === 1 ? "Runde" : "Runden"}</p>
              <div className="duel-prepared-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowMobilePreview(true)}>Handy-Vorschau</button>
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? "Erstelle..." : "Raum erstellen"}
                </button>
              </div>
            </div>
          )}

          {source === "document" && !preparedRoom && (
            <button type="submit" className="btn-primary" disabled={loading || !file}>
              {loading ? "KI erzeugt Fragen..." : "Quiz erstellen"}
            </button>
          )}
          </fieldset>
        </form>

        {source === "document" && preparedRoom && (
          <div className="duel-prepared-section">
            <p>{docQuestions.length} Fragen = {docQuestions.length} Runden</p>
            <div className="duel-prepared-actions">
              <button className="btn-secondary" onClick={() => setShowMobilePreview(true)}>Handy-Vorschau</button>
              <button className="btn-primary" onClick={() => navigate(`/duel/live/${preparedRoom.room_code}`)}>Raum erstellen</button>
              <button className="btn-secondary" onClick={handleDocReset} style={{ color: "var(--text-secondary)" }}>Verwerfen</button>
            </div>
          </div>
        )}
      </div>

      {hasSplit && rightQuestions.length > 0 && (
        <div className="duel-setup-right">
          <div className="duel-questions-header">
            <h3>Fragen ({rightQuestions.length})</h3>
            <label className="preview-solutions-toggle">
              <input type="checkbox" checked={showSolutions} onChange={(e) => setShowSolutions(e.target.checked)} />
              Lösungen
            </label>
          </div>
          <div className="duel-questions-list">
            {rightQuestions.map((q, i) => (
              <QuestionCard
                key={q.task_id || i}
                question={q}
                index={i}
                showSolution={showSolutions}
                onDelete={source === "document" ? () => handleDeleteDocQuestion(i) : () => toggleTask(q.task_id)}
                canDelete={true}
              />
            ))}
          </div>
        </div>
      )}

      {showMobilePreview && source === "pools" && selectedTaskIds.size > 0 && (
        <DuelPreviewInline questions={selectedQuestions} showSolutions={showSolutions} onClose={() => setShowMobilePreview(false)} />
      )}
      {showMobilePreview && source === "document" && preparedRoom && (
        <DuelPreview roomCode={preparedRoom.room_code} onClose={() => setShowMobilePreview(false)} />
      )}
    </div>
  );
}


function QuestionCard({ question, index, showSolution, onDelete, canDelete }) {
  const q = question;

  return (
    <div className="duel-question-card">
      <div className="duel-question-card-header">
        <span className="duel-question-card-num">Frage {index + 1}</span>
        <span className="duel-question-card-type">
          {q.task_type === "multichoice" ? "MC" : q.task_type === "truefalse" ? "W/F" : "Num"}
        </span>
        {canDelete && (
          <button className="duel-question-card-delete" onClick={onDelete} title="Frage entfernen">✕</button>
        )}
      </div>
      <div className="duel-question-card-text">
        {q.title && q.text && <strong>{q.title}</strong>}
        <Markdown>{q.text || q.title}</Markdown>
      </div>
      {q.options && (
        <div className="duel-question-card-options">
          {q.options.map((opt, i) => {
            const isCorrect = q.task_type === "multichoice"
              ? q.correct_indices?.includes(opt.index)
              : String(opt.index) === q.correct_answer;
            return (
              <div key={i} className={`duel-question-card-option ${OPTION_COLORS[i % 4]} ${showSolution && isCorrect ? "correct" : ""}`}>
                <span className="duel-option-label">{OPTION_LABELS[i]}</span>
                <span>{opt.text}</span>
                {showSolution && isCorrect && <span className="duel-card-check">&#10003;</span>}
              </div>
            );
          })}
        </div>
      )}
      {q.task_type === "numerical" && showSolution && (
        <div className="duel-question-card-answer">
          Antwort: <strong>{q.correct_answer}</strong>
        </div>
      )}
    </div>
  );
}


function stripMarkdown(text) {
  return (text || "").replace(/\*\*/g, "").replace(/\*/g, "").replace(/^#+\s/gm, "").trim();
}

function PoolQuestionPicker({ pools, poolQuestions, expandedPools, selectedTaskIds, onTogglePool, onToggleAllInPool, onToggleTask }) {
  const S = {
    container: { border: "1px solid var(--border)", borderRadius: "8px", overflow: "hidden" },
    poolHeader: { display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px", cursor: "pointer", background: "var(--surface)", borderBottom: "1px solid var(--border)", userSelect: "none" },
    chevron: { fontSize: "0.65rem", color: "var(--text-secondary)", transition: "transform 0.2s", display: "inline-block" },
    chevronOpen: { transform: "rotate(90deg)" },
    poolName: { flex: 1, fontWeight: 500 },
    poolCount: { fontSize: "0.8rem", color: "var(--text-secondary)" },
    questionsBox: { background: "var(--bg)", borderBottom: "1px solid var(--border)" },
    row: { display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px 8px 24px", cursor: "pointer", borderBottom: "1px solid rgba(0,0,0,0.05)", fontSize: "0.85rem" },
    rowSelected: { background: "rgba(34, 197, 94, 0.06)" },
    rowSelectAll: { fontWeight: 600, borderBottom: "1px solid var(--border)" },
    questionText: { flex: 1, color: "var(--text)", lineHeight: 1.4, wordBreak: "break-word" },
    typeBadge: { fontSize: "0.7rem", background: "var(--accent)", color: "white", padding: "2px 7px", borderRadius: "10px", flexShrink: 0 },
    checkbox: { width: "16px", height: "16px", accentColor: "var(--accent)", flexShrink: 0, cursor: "pointer" },
  };

  return (
    <div style={S.container}>
      {pools.map((pool) => {
        const isExpanded = expandedPools.has(pool.id);
        const questions = poolQuestions[pool.id] || [];
        const poolTaskIds = questions.map((q) => q.task_id);
        const selectedCount = poolTaskIds.filter((id) => selectedTaskIds.has(id)).length;
        const allSelected = questions.length > 0 && selectedCount === questions.length;

        return (
          <div key={pool.id}>
            <div
              style={S.poolHeader}
              onClick={() => pool.duel_task_count > 0 && onTogglePool(pool.id)}
            >
              <span style={{ ...S.chevron, ...(isExpanded ? S.chevronOpen : {}) }}>&#9654;</span>
              <span style={S.poolName}>{pool.name}</span>
              <span style={S.poolCount}>
                {selectedCount > 0 && <strong>{selectedCount}/</strong>}
                {pool.duel_task_count} Fragen
              </span>
            </div>

            {isExpanded && questions.length > 0 && (
              <div style={S.questionsBox}>
                <div
                  style={{ ...S.row, ...S.rowSelectAll }}
                  onClick={() => onToggleAllInPool(pool.id)}
                >
                  <span style={S.questionText}>Alle auswählen</span>
                  <input type="checkbox" checked={allSelected} readOnly style={S.checkbox} />
                </div>

                {questions.map((q) => {
                  const isSelected = selectedTaskIds.has(q.task_id);
                  const typeLabel = q.task_type === "multichoice" ? "MC" : q.task_type === "truefalse" ? "W/F" : "Num";
                  const preview = stripMarkdown(q.text || q.title).substring(0, 120);

                  return (
                    <div
                      key={q.task_id}
                      style={{ ...S.row, ...(isSelected ? S.rowSelected : {}) }}
                      onClick={() => onToggleTask(q.task_id)}
                    >
                      <span style={S.typeBadge}>{typeLabel}</span>
                      <span style={S.questionText}>{preview || "(kein Text)"}</span>
                      <input type="checkbox" checked={isSelected} readOnly style={S.checkbox} />
                    </div>
                  );
                })}
              </div>
            )}

            {isExpanded && questions.length === 0 && (
              <div style={{ ...S.questionsBox, padding: "8px 24px", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                Keine Duell-Fragen in diesem Pool
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}


/** Inline mobile preview for pool-based questions (no room needed) */
function DuelPreviewInline({ questions, showSolutions, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [localShowSolutions, setLocalShowSolutions] = useState(showSolutions);
  const q = questions[currentIndex];

  const COLORS = ["duel-opt-red", "duel-opt-blue", "duel-opt-yellow", "duel-opt-green"];
  const LABELS = ["A", "B", "C", "D"];

  return (
    <div className="modal-overlay">
      <div className="modal duel-preview-modal duel-preview-mobile-only">
        <div className="modal-header">
          <h3>Handy-Vorschau</h3>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <div className="duel-preview-controls">
          <div className="duel-preview-nav">
            {questions.map((_, i) => (
              <button key={i} className={`duel-preview-dot ${i === currentIndex ? "active" : ""}`} onClick={() => setCurrentIndex(i)}>{i + 1}</button>
            ))}
          </div>
          <label className="preview-solutions-toggle">
            <input type="checkbox" checked={localShowSolutions} onChange={(e) => setLocalShowSolutions(e.target.checked)} />
            Lösungen
          </label>
        </div>
        <div className="duel-preview-body">
          {q && (
            <div className="phone-frame">
              <div className="phone-notch" />
              <div className="phone-screen">
                <div className="duel-question-container">
                  <div className="duel-timer-bar"><div className="duel-timer-fill" style={{ width: "60%" }} /></div>
                  <div className="duel-timer-text">12s</div>
                  <div className="duel-question-text">
                    {q.title && q.text && <h3 className="duel-question-title">{q.title}</h3>}
                    <Markdown>{q.text || q.title}</Markdown>
                  </div>
                  {q.task_type === "numerical" ? (
                    <div className="duel-numerical-form">
                      <input type="text" className="duel-numerical-input" disabled placeholder={localShowSolutions ? q.correct_answer : "Antwort eingeben..."} value={localShowSolutions ? q.correct_answer || "" : ""} />
                      <button className="duel-btn duel-btn-submit" disabled>Antworten</button>
                    </div>
                  ) : (
                    <div className="duel-options-grid">
                      {q.options?.map((opt, i) => {
                        const isCorrect = q.task_type === "multichoice" ? q.correct_indices?.includes(opt.index) : String(opt.index) === q.correct_answer;
                        return (
                          <button key={i} className={`duel-option ${COLORS[i % 4]} ${localShowSolutions && isCorrect ? "correct-glow" : ""}`} disabled>
                            <span className="duel-option-label">{LABELS[i]}</span>
                            <span className="duel-option-text">{opt.text}</span>
                            {localShowSolutions && isCorrect && <span className="duel-check">&#10003;</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="duel-preview-footer">
          <button className="btn-secondary" onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))} disabled={currentIndex === 0}>&larr; Vorherige</button>
          <span className="duel-preview-counter">Frage {currentIndex + 1} / {questions.length}</span>
          <button className="btn-secondary" onClick={() => setCurrentIndex(Math.min(questions.length - 1, currentIndex + 1))} disabled={currentIndex === questions.length - 1}>Nächste &rarr;</button>
        </div>
      </div>
    </div>
  );
}
