import { useState, useEffect } from "react";
import { api } from "../../api/client";
import TaskEditor from "./TaskEditor";
import Markdown from "../Markdown";

const TASK_TYPES = {
  multichoice: "Multiple Choice",
  truefalse: "Wahr/Falsch",
  shortanswer: "Kurzantwort",
  numerical: "Numerisch",
  matching: "Zuordnung",
  ordering: "Reihenfolge",
  cloze: "Lückentext",
  essay: "Freitext",
  drawing: "Zeichnung",
  description: "Beschreibung",
  webapp: "Web-App",
  feynman: "Feynman-Erklärung",
  scenario: "Branching-Szenario",
};

const GENERATABLE_TYPES = {
  multichoice: "Multiple Choice",
  truefalse: "Wahr/Falsch",
  shortanswer: "Kurzantwort",
  numerical: "Numerisch",
  matching: "Zuordnung",
  ordering: "Reihenfolge",
  essay: "Freitext",
  drawing: "Zeichnung",
  webapp: "Web-App",
  feynman: "Feynman-Erklärung",
  scenario: "Branching-Szenario",
};

function TaskTypeFilter({ selected, onChange }) {
  const allKeys = Object.keys(GENERATABLE_TYPES);
  const allSelected = selected.length === allKeys.length;

  function toggleType(type) {
    if (selected.includes(type)) {
      onChange(selected.filter(t => t !== type));
    } else {
      onChange([...selected, type]);
    }
  }

  return (
    <div className="form-group">
      <label>Erlaubte Aufgabentypen</label>
      <div className="type-filter-grid">
        <button
          type="button"
          className={`type-filter-chip ${allSelected ? "active" : ""}`}
          onClick={() => onChange(allSelected ? [] : [...allKeys])}
        >
          Alle
        </button>
        {Object.entries(GENERATABLE_TYPES).map(([key, label]) => (
          <button
            type="button"
            key={key}
            className={`type-filter-chip ${selected.includes(key) ? "active" : ""}`}
            onClick={() => toggleType(key)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function TaskPool() {
  const [pools, setPools] = useState([]);
  const [selectedPoolId, setSelectedPoolId] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [editingTask, setEditingTask] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [showMoodleImport, setShowMoodleImport] = useState(false);
  const [aiEditTask, setAiEditTask] = useState(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [renamingPool, setRenamingPool] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [newPoolName, setNewPoolName] = useState("");
  const [showNewPool, setShowNewPool] = useState(false);

  useEffect(() => {
    loadPools();
  }, []);

  useEffect(() => {
    if (selectedPoolId !== null) {
      loadTasks();
    }
  }, [selectedPoolId]);

  async function loadPools() {
    const data = await api.get("/api/pools");
    setPools(data);
    if (data.length > 0 && selectedPoolId === null) {
      setSelectedPoolId(data[0].id);
    }
  }

  async function loadTasks() {
    if (selectedPoolId === null) return;
    const data = await api.get(`/api/tasks?pool_id=${selectedPoolId}`);
    setTasks(data);
  }

  async function handleCreatePool() {
    if (!newPoolName.trim()) return;
    const pool = await api.post("/api/pools", { name: newPoolName.trim() });
    setNewPoolName("");
    setShowNewPool(false);
    await loadPools();
    setSelectedPoolId(pool.id);
  }

  async function handleRenamePool() {
    if (!renameValue.trim() || !renamingPool) return;
    await api.put(`/api/pools/${renamingPool}`, { name: renameValue.trim() });
    setRenamingPool(null);
    setRenameValue("");
    loadPools();
  }

  async function handleDeletePool(poolId) {
    if (!confirm("Pool und alle enthaltenen Aufgaben wirklich löschen?")) return;
    try {
      await api.delete(`/api/pools/${poolId}`);
      if (selectedPoolId === poolId) {
        setSelectedPoolId(null);
        setTasks([]);
      }
      const data = await api.get("/api/pools");
      setPools(data);
      if (data.length > 0 && (selectedPoolId === poolId || selectedPoolId === null)) {
        setSelectedPoolId(data[0].id);
      }
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Aufgabe wirklich löschen?")) return;
    await api.delete(`/api/tasks/${id}`);
    loadTasks();
    loadPools();
  }

  async function handleAiEdit(task) {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      await api.post(`/api/tasks/${task.id}/ai-edit`, { prompt: aiPrompt });
      setAiEditTask(null);
      setAiPrompt("");
      loadTasks();
    } catch (err) {
      alert(err.message);
    } finally {
      setAiLoading(false);
    }
  }

  const filtered = tasks.filter(
    (t) =>
      !filter ||
      t.title.toLowerCase().includes(filter.toLowerCase()) ||
      t.text.toLowerCase().includes(filter.toLowerCase()) ||
      (t.topic && t.topic.toLowerCase().includes(filter.toLowerCase()))
  );

  if (editingTask !== null) {
    return (
      <TaskEditor
        task={editingTask}
        poolId={selectedPoolId}
        onSave={() => {
          setEditingTask(null);
          loadTasks();
          loadPools();
        }}
        onCancel={() => setEditingTask(null)}
      />
    );
  }

  if (showCreate) {
    return (
      <TaskEditor
        task={null}
        poolId={selectedPoolId}
        onSave={() => {
          setShowCreate(false);
          loadTasks();
          loadPools();
        }}
        onCancel={() => setShowCreate(false)}
      />
    );
  }

  const selectedPool = pools.find((p) => p.id === selectedPoolId);

  return (
    <div className="task-pool-layout">
      {/* Pool Sidebar */}
      <div className="pool-sidebar">
        <div className="pool-sidebar-header">
          <h3>Pools</h3>
          <button
            className="btn-small"
            onClick={() => setShowNewPool(true)}
            title="Neuen Pool erstellen"
          >
            +
          </button>
        </div>

        {showNewPool && (
          <div className="pool-new-form">
            <input
              type="text"
              placeholder="Pool-Name..."
              value={newPoolName}
              onChange={(e) => setNewPoolName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreatePool();
                if (e.key === "Escape") setShowNewPool(false);
              }}
              autoFocus
            />
            <button className="btn-small" onClick={handleCreatePool}>OK</button>
            <button className="btn-small" onClick={() => setShowNewPool(false)}>×</button>
          </div>
        )}

        <div className="pool-list">
          {pools.map((pool) => (
            <div
              key={pool.id}
              className={`pool-item ${pool.id === selectedPoolId ? "active" : ""}`}
              onClick={() => setSelectedPoolId(pool.id)}
            >
              {renamingPool === pool.id ? (
                <div className="pool-rename-form" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenamePool();
                      if (e.key === "Escape") setRenamingPool(null);
                    }}
                    autoFocus
                  />
                  <button className="btn-small" onClick={handleRenamePool}>OK</button>
                </div>
              ) : (
                <>
                  <span className="pool-name">{pool.name}</span>
                  <span className="pool-count">{pool.task_count}</span>
                  <div className="pool-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="btn-icon"
                      title="Umbenennen"
                      onClick={() => {
                        setRenamingPool(pool.id);
                        setRenameValue(pool.name);
                      }}
                    >
                      ✎
                    </button>
                    <button
                      className="btn-icon btn-danger-icon"
                      title="Löschen"
                      onClick={() => handleDeletePool(pool.id)}
                    >
                      ×
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="task-pool">
        <div className="page-header">
          <h2>{selectedPool ? selectedPool.name : "Aufgabenpool"}</h2>
          <div className="header-actions">
            <button className="btn-secondary" onClick={() => setShowImport(true)}>
              Dokument importieren
            </button>
            <button className="btn-secondary" onClick={() => setShowMoodleImport(true)}>
              Moodle XML
            </button>
            <button className="btn-secondary" onClick={() => setShowGenerate(true)}>
              KI generieren
            </button>
            <button
              className="btn-secondary"
              onClick={async () => {
                try {
                  const url = `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/api/tasks/export-moodle-xml${selectedPoolId ? `?pool_id=${selectedPoolId}` : ""}`;
                  const res = await fetch(url, {
                    headers: { Authorization: `Bearer ${localStorage.getItem("teacher_token")}` },
                  });
                  if (!res.ok) throw new Error("Export fehlgeschlagen");
                  const blob = await res.blob();
                  const blobUrl = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = blobUrl;
                  a.download = `${selectedPool?.name || "tasks"}.xml`;
                  a.click();
                  URL.revokeObjectURL(blobUrl);
                } catch (err) {
                  alert(err.message);
                }
              }}
            >
              XML Export
            </button>
            <button className="btn-primary-sm" onClick={() => setShowCreate(true)}>
              + Neue Aufgabe
            </button>
          </div>
        </div>

        <div className="filter-bar">
          <input
            type="text"
            placeholder="Aufgaben durchsuchen..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="search-input"
          />
          <span className="task-count">{filtered.length} Aufgaben</span>
        </div>

        {showImport && (
          <DocumentImportModal
            poolId={selectedPoolId}
            onClose={() => setShowImport(false)}
            onImported={() => { loadTasks(); loadPools(); }}
          />
        )}

        {showGenerate && (
          <AiGenerateModal
            poolId={selectedPoolId}
            onClose={() => setShowGenerate(false)}
            onGenerated={() => { loadTasks(); loadPools(); }}
          />
        )}

        {showMoodleImport && (
          <MoodleImportModal
            poolId={selectedPoolId}
            onClose={() => setShowMoodleImport(false)}
            onImported={() => { loadTasks(); loadPools(); }}
          />
        )}

        <div className="task-list">
          {filtered.map((task) => (
            <div key={task.id} className="task-card">
              <div className="task-card-header">
                <div className="task-title-row">
                  <h3>{task.title}</h3>
                  <span className={`task-type-badge ${task.task_type}`}>
                    {TASK_TYPES[task.task_type] || task.task_type}
                  </span>
                </div>
                <div className="task-meta">
                  {task.topic && <span className="task-topic">{task.topic}</span>}
                  <span className="task-points">{task.points} Pkt.</span>
                </div>
              </div>
              <div className="task-text"><Markdown>{task.text}</Markdown></div>
              {task.solution && (
                <div className="task-hint">
                  <strong>Musterlösung:</strong> <Markdown>{task.solution}</Markdown>
                </div>
              )}
              {task.hint && (
                <div className="task-hint" style={{ opacity: 0.7 }}>
                  <strong>Hinweis:</strong> <Markdown>{task.hint}</Markdown>
                </div>
              )}
              <div className="task-actions">
                <button className="btn-small" onClick={() => setEditingTask(task)}>
                  Bearbeiten
                </button>
                <button
                  className="btn-small"
                  onClick={() => {
                    setAiEditTask(task);
                    setAiPrompt("");
                  }}
                >
                  KI bearbeiten
                </button>
                <button
                  className="btn-small btn-danger"
                  onClick={() => handleDelete(task.id)}
                >
                  Löschen
                </button>
              </div>

              {aiEditTask?.id === task.id && (
                <div className="ai-edit-bar">
                  <input
                    type="text"
                    placeholder='z.B. "Mach die Aufgabe schwieriger"'
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAiEdit(task)}
                    disabled={aiLoading}
                  />
                  <button
                    className="btn-primary-sm"
                    onClick={() => handleAiEdit(task)}
                    disabled={aiLoading}
                  >
                    {aiLoading ? "..." : "Anwenden"}
                  </button>
                  <button className="btn-small" onClick={() => setAiEditTask(null)}>
                    Abbrechen
                  </button>
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="empty-state">
              Noch keine Aufgaben in diesem Pool. Erstelle eine neue Aufgabe,
              importiere ein Dokument oder lasse Aufgaben per KI generieren.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function DocumentImportModal({ poolId, onClose, onImported }) {
  const [files, setFiles] = useState([]);
  const [allowedTypes, setAllowedTypes] = useState(Object.keys(GENERATABLE_TYPES));
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [saving, setSaving] = useState(false);

  function addFiles(newFiles) {
    const valid = Array.from(newFiles).filter((f) => {
      const ext = f.name.split(".").pop().toLowerCase();
      return ext === "pdf" || ext === "docx";
    });
    setFiles((prev) => [...prev, ...valid]);
  }

  function removeFile(idx) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleUpload() {
    if (files.length === 0) return;
    setLoading(true);
    const allTasks = [];
    const errors = [];
    try {
      for (let i = 0; i < files.length; i++) {
        setLoadingStatus(`Dokument ${i + 1} von ${files.length}: ${files[i].name}`);
        const formData = new FormData();
        formData.append("file", files[i]);
        if (allowedTypes.length > 0) {
          formData.append("allowed_types", allowedTypes.join(","));
        }
        const res = await fetch(
          `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/api/tasks/import-document`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${localStorage.getItem("teacher_token")}`,
            },
            body: formData,
          }
        );
        if (!res.ok) {
          const err = await res.json();
          errors.push(`${files[i].name}: ${err.detail || "Fehler"}`);
          continue;
        }
        const data = await res.json();
        allTasks.push(...data.tasks.map((t) => ({ ...t, _source: files[i].name })));
      }
      if (errors.length > 0) {
        alert("Fehler bei:\n" + errors.join("\n"));
      }
      if (allTasks.length > 0) {
        setPreview(allTasks);
      } else if (errors.length > 0) {
        setLoading(false);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
      setLoadingStatus("");
    }
  }

  async function handleSaveAll() {
    setSaving(true);
    try {
      for (const task of preview) {
        await api.post("/api/tasks", {
          title: task.title,
          text: task.text,
          hint: task.hint || "",
          solution: task.solution || "",
          topic: task.topic || "",
          task_type: task.task_type || "essay",
          points: task.points || 1,
          question_data: task.question_data || {},
          source: "doc_import",
          pool_id: poolId,
        });
      }
      onImported();
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3>Dokumente importieren</h3>
          <button className="btn-close" onClick={onClose}>
            ×
          </button>
        </div>

        {!preview ? (
          <div className="modal-body">
            <div
              className="dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                addFiles(e.dataTransfer.files);
              }}
            >
              <p>PDF- oder DOCX-Dateien hierher ziehen oder klicken</p>
              <input
                type="file"
                accept=".pdf,.docx"
                multiple
                onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
              />
            </div>
            {files.length > 0 && (
              <div className="import-file-list">
                {files.map((f, i) => (
                  <div key={i} className="import-file-item">
                    <span className="file-name">{f.name}</span>
                    <button className="btn-icon btn-danger-icon" onClick={() => removeFile(i)}>×</button>
                  </div>
                ))}
              </div>
            )}
            <p className="qd-hint">Die KI analysiert jedes Dokument einzeln und erstellt automatisch passende Aufgaben.</p>
            <TaskTypeFilter selected={allowedTypes} onChange={setAllowedTypes} />
            {loading && loadingStatus && (
              <p className="import-status">{loadingStatus}</p>
            )}
            <button
              className="btn-primary"
              onClick={handleUpload}
              disabled={files.length === 0 || loading}
            >
              {loading ? `Analysiere... (${loadingStatus})` : `${files.length} Dokument${files.length !== 1 ? "e" : ""} hochladen & analysieren`}
            </button>
          </div>
        ) : (
          <div className="modal-body">
            <p className="import-count">{preview.length} Aufgaben aus {files.length} Dokument{files.length !== 1 ? "en" : ""} erkannt</p>
            <div className="import-preview">
              {preview.map((task, i) => (
                <div key={i} className="import-task">
                  <div className="task-title-row">
                    <strong>{task.title}</strong>
                    <span className={`task-type-badge ${task.task_type}`}>
                      {TASK_TYPES[task.task_type] || task.task_type}
                    </span>
                  </div>
                  <div><Markdown>{task.text}</Markdown></div>
                  {task._source && <p className="import-source">Quelle: {task._source}</p>}
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => { setPreview(null); setFiles([]); }}>
                Erneut hochladen
              </button>
              <button
                className="btn-primary"
                onClick={handleSaveAll}
                disabled={saving}
              >
                {saving ? "Wird gespeichert..." : "Alle importieren"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AiGenerateModal({ poolId, onClose, onGenerated }) {
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState("mittel");
  const [instructions, setInstructions] = useState("");
  const [allowedTypes, setAllowedTypes] = useState(Object.keys(GENERATABLE_TYPES));
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleGenerate() {
    if (!topic.trim()) return;
    setLoading(true);
    try {
      const data = await api.post("/api/tasks/generate", {
        topic,
        count,
        difficulty,
        instructions: instructions.trim() || undefined,
        allowed_types: allowedTypes.length > 0 ? allowedTypes : undefined,
      });
      setPreview(data.tasks);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveAll() {
    setSaving(true);
    try {
      for (const task of preview) {
        await api.post("/api/tasks", {
          title: task.title,
          text: task.text,
          hint: task.hint || "",
          solution: task.solution || "",
          topic: task.topic || topic,
          task_type: task.task_type || "essay",
          points: task.points || 1,
          question_data: task.question_data || {},
          source: "ai_generated",
          pool_id: poolId,
        });
      }
      onGenerated();
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3>Aufgaben per KI generieren</h3>
          <button className="btn-close" onClick={onClose}>
            ×
          </button>
        </div>

        {!preview ? (
          <div className="modal-body">
            <div className="form-group">
              <label>Themengebiet</label>
              <input
                type="text"
                placeholder="z.B. Bruchrechnung, Netzwerktechnik, ..."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Anzahl</label>
                <select
                  value={count}
                  onChange={(e) => setCount(parseInt(e.target.value))}
                >
                  {[3, 5, 8, 10].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Schwierigkeit</label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                >
                  <option value="leicht">Leicht</option>
                  <option value="mittel">Mittel</option>
                  <option value="schwer">Schwer</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Zusätzliche Anweisungen (optional)</label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="z.B. 'Die Datenbank-ERMs sollen von den Schülern gezeichnet werden'"
                rows={3}
              />
            </div>
            <TaskTypeFilter selected={allowedTypes} onChange={setAllowedTypes} />
            <button
              className="btn-primary"
              onClick={handleGenerate}
              disabled={!topic.trim() || loading}
            >
              {loading ? "KI generiert..." : "Aufgaben generieren"}
            </button>
          </div>
        ) : (
          <div className="modal-body">
            <p className="import-count">{preview.length} Aufgaben generiert</p>
            <div className="import-preview">
              {preview.map((task, i) => (
                <div key={i} className="import-task">
                  <div className="task-title-row">
                    <strong>{task.title}</strong>
                    <span className={`task-type-badge ${task.task_type}`}>
                      {TASK_TYPES[task.task_type] || task.task_type}
                    </span>
                  </div>
                  <div><Markdown>{task.text}</Markdown></div>
                  {task.solution && (
                    <div className="task-hint">
                      <em>Musterlösung:</em> <Markdown>{task.solution}</Markdown>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setPreview(null)}>
                Neu generieren
              </button>
              <button
                className="btn-primary"
                onClick={handleSaveAll}
                disabled={saving}
              >
                {saving ? "Wird gespeichert..." : "Alle speichern"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MoodleImportModal({ poolId, onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/api/tasks/import-moodle-xml`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("teacher_token")}`,
          },
          body: formData,
        }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Import fehlgeschlagen");
      }
      const data = await res.json();
      setPreview(data.tasks);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveAll() {
    setSaving(true);
    try {
      for (const task of preview) {
        await api.post("/api/tasks", {
          title: task.title,
          text: task.text,
          hint: task.hint || "",
          solution: task.solution || "",
          topic: task.topic || "",
          task_type: task.task_type || "essay",
          points: task.points || 1,
          question_data: task.question_data || {},
          source: "moodle_import",
          pool_id: poolId,
        });
      }
      onImported();
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3>Moodle XML importieren</h3>
          <button className="btn-close" onClick={onClose}>
            ×
          </button>
        </div>

        {!preview ? (
          <div className="modal-body">
            <div
              className="dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                setFile(e.dataTransfer.files[0]);
              }}
            >
              <p>Moodle XML-Datei hierher ziehen oder klicken</p>
              <input
                type="file"
                accept=".xml"
                onChange={(e) => setFile(e.target.files[0])}
              />
            </div>
            {file && <p className="file-name">Datei: {file.name}</p>}
            <button
              className="btn-primary"
              onClick={handleUpload}
              disabled={!file || loading}
            >
              {loading ? "Wird analysiert..." : "Hochladen & Analysieren"}
            </button>
          </div>
        ) : (
          <div className="modal-body">
            <p className="import-count">{preview.length} Aufgaben erkannt</p>
            <div className="import-preview">
              {preview.map((task, i) => (
                <div key={i} className="import-task">
                  <div className="task-title-row">
                    <strong>{task.title}</strong>
                    <span className={`task-type-badge ${task.task_type}`}>
                      {TASK_TYPES[task.task_type] || task.task_type}
                    </span>
                  </div>
                  <div><Markdown>{task.text}</Markdown></div>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setPreview(null)}>
                Andere Datei
              </button>
              <button
                className="btn-primary"
                onClick={handleSaveAll}
                disabled={saving}
              >
                {saving ? "Wird gespeichert..." : "Alle importieren"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
