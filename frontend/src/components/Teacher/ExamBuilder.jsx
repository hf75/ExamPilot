import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";

export default function ExamBuilder() {
  const navigate = useNavigate();
  const [exams, setExams] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    loadExams();
  }, []);

  async function loadExams() {
    const data = await api.get("/api/exams");
    setExams(data);
  }

  async function handleDelete(id) {
    if (!confirm("Klassenarbeit wirklich löschen?")) return;
    await api.delete(`/api/exams/${id}`);
    loadExams();
  }

  async function handleStatusChange(id, status) {
    await api.put(`/api/exams/${id}`, { status });
    loadExams();
  }

  if (editing) {
    return (
      <ExamDetail
        exam={editing}
        onBack={() => {
          setEditing(null);
          loadExams();
        }}
      />
    );
  }

  if (showCreate) {
    return (
      <ExamForm
        onSave={() => {
          setShowCreate(false);
          loadExams();
        }}
        onCancel={() => setShowCreate(false)}
      />
    );
  }

  const STATUS_LABELS = {
    draft: "Entwurf",
    active: "Aktiv",
    closed: "Geschlossen",
  };

  return (
    <div className="exam-builder">
      <div className="page-header">
        <h2>Klassenarbeiten</h2>
        <button className="btn-primary-sm" onClick={() => setShowCreate(true)}>
          + Neue Klassenarbeit
        </button>
      </div>

      <div className="exam-list">
        {exams.map((exam) => (
          <div key={exam.id} className="exam-card">
            <div className="exam-card-header">
              <div>
                <h3>{exam.title}</h3>
                <div className="exam-meta">
                  {exam.class_name && (
                    <span className="exam-class">{exam.class_name}</span>
                  )}
                  {exam.date && <span className="exam-date">{exam.date}</span>}
                  {exam.duration_minutes && (
                    <span className="exam-duration">
                      {exam.duration_minutes} Min.
                    </span>
                  )}
                </div>
              </div>
              <span className={`status-badge status-${exam.status}`}>
                {STATUS_LABELS[exam.status]}
              </span>
            </div>
            {exam.description && (
              <p className="exam-description">{exam.description}</p>
            )}
            <div className="task-actions">
              <button
                className="btn-small"
                onClick={() => setEditing(exam)}
              >
                Bearbeiten
              </button>
              <button
                className="btn-small"
                onClick={() => navigate(`/teacher/exams/${exam.id}/preview`)}
              >
                Vorschau
              </button>
              {exam.status === "active" && (
                <button
                  className="btn-small"
                  onClick={() => navigate(`/teacher/exams/${exam.id}/monitor`)}
                >
                  Live-Monitor
                </button>
              )}
              <button
                className="btn-small"
                onClick={() => navigate(`/teacher/exams/${exam.id}/results`)}
              >
                Ergebnisse
              </button>
              {exam.status === "draft" && (
                <button
                  className="btn-small"
                  onClick={() => handleStatusChange(exam.id, "active")}
                >
                  Aktivieren
                </button>
              )}
              {exam.status === "active" && (
                <button
                  className="btn-small"
                  onClick={() => handleStatusChange(exam.id, "closed")}
                >
                  Schließen
                </button>
              )}
              {exam.status === "closed" && (
                <button
                  className="btn-small"
                  onClick={() => handleStatusChange(exam.id, "draft")}
                >
                  Zurück zu Entwurf
                </button>
              )}
              <button
                className="btn-small btn-danger"
                onClick={() => handleDelete(exam.id)}
              >
                Löschen
              </button>
            </div>
          </div>
        ))}
        {exams.length === 0 && (
          <p className="empty-state">
            Noch keine Klassenarbeiten vorhanden.
          </p>
        )}
      </div>
    </div>
  );
}

function ExamForm({ exam, onSave, onCancel }) {
  const isNew = !exam;
  const [form, setForm] = useState({
    title: exam?.title || "",
    description: exam?.description || "",
    class_name: exam?.class_name || "",
    date: exam?.date || "",
    duration_minutes: exam?.duration_minutes || "",
  });
  const [saving, setSaving] = useState(false);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        duration_minutes: form.duration_minutes
          ? parseInt(form.duration_minutes)
          : null,
      };
      if (isNew) {
        await api.post("/api/exams", payload);
      } else {
        await api.put(`/api/exams/${exam.id}`, payload);
      }
      onSave();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="task-editor">
      <h2>{isNew ? "Neue Klassenarbeit" : "Klassenarbeit bearbeiten"}</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Titel</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            placeholder="z.B. Klassenarbeit 1 - Mathematik"
            required
          />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Klasse</label>
            <input
              type="text"
              value={form.class_name}
              onChange={(e) => update("class_name", e.target.value)}
              placeholder="z.B. WI25Z1"
            />
          </div>
          <div className="form-group">
            <label>Datum</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => update("date", e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Zeitlimit (Min.)</label>
            <input
              type="number"
              value={form.duration_minutes}
              onChange={(e) => update("duration_minutes", e.target.value)}
              placeholder="optional"
              min="1"
            />
          </div>
        </div>
        <div className="form-group">
          <label>Beschreibung</label>
          <textarea
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            placeholder="Optionale Beschreibung"
            rows={2}
          />
        </div>
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Abbrechen
          </button>
          <button type="submit" className="btn-primary-sm" disabled={saving}>
            {saving ? "..." : isNew ? "Erstellen" : "Speichern"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ExamDetail({ exam, onBack }) {
  const [examTasks, setExamTasks] = useState([]);
  const [pools, setPools] = useState([]);
  const [selectedPoolId, setSelectedPoolId] = useState(null);
  const [poolTasks, setPoolTasks] = useState([]);
  const [search, setSearch] = useState("");
  const [showPool, setShowPool] = useState(false);

  useEffect(() => {
    loadExamTasks();
    loadPools();
  }, []);

  useEffect(() => {
    if (selectedPoolId !== null) {
      loadPoolTasks();
    }
  }, [selectedPoolId]);

  async function loadExamTasks() {
    const data = await api.get(`/api/exams/${exam.id}/tasks`);
    setExamTasks(data);
  }

  async function loadPools() {
    const data = await api.get("/api/pools");
    setPools(data);
    if (data.length > 0) {
      setSelectedPoolId(data[0].id);
    }
  }

  async function loadPoolTasks() {
    const data = await api.get(`/api/tasks?pool_id=${selectedPoolId}`);
    setPoolTasks(data);
  }

  async function addTask(taskId) {
    await api.post(`/api/exams/${exam.id}/tasks`, { task_id: taskId });
    loadExamTasks();
  }

  async function removeTask(taskId) {
    await api.delete(`/api/exams/${exam.id}/tasks/${taskId}`);
    loadExamTasks();
  }

  const examTaskIds = new Set(examTasks.map((t) => t.id));
  const availableTasks = poolTasks.filter(
    (t) =>
      !examTaskIds.has(t.id) &&
      (!search ||
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        t.text.toLowerCase().includes(search.toLowerCase()))
  );

  const totalPoints = examTasks.reduce((sum, t) => sum + (t.points || 0), 0);

  return (
    <div className="exam-detail">
      <button className="btn-secondary" onClick={onBack}>
        &larr; Zurück
      </button>

      <div className="exam-detail-header">
        <h2>{exam.title}</h2>
        <div className="exam-meta">
          {exam.class_name && <span className="exam-class">{exam.class_name}</span>}
          <span className="exam-points-total">{totalPoints} Punkte gesamt</span>
          <span className="task-count">{examTasks.length} Aufgaben</span>
        </div>
      </div>

      <div className="exam-tasks-section">
        <h3>Aufgaben in dieser Klassenarbeit</h3>
        {examTasks.length === 0 ? (
          <p className="empty-state">
            Noch keine Aufgaben. Füge Aufgaben aus dem Pool hinzu.
          </p>
        ) : (
          <div className="exam-task-list">
            {examTasks.map((task, index) => (
              <div key={task.id} className="exam-task-item">
                <span className="exam-task-pos">{index + 1}.</span>
                <div className="exam-task-info">
                  <strong>{task.title}</strong>
                  <span className="task-text-preview">
                    {task.text.substring(0, 100)}
                    {task.text.length > 100 ? "..." : ""}
                  </span>
                </div>
                <span className="task-points">{task.points} Pkt.</span>
                <button
                  className="btn-small btn-danger"
                  onClick={() => removeTask(task.id)}
                >
                  Entfernen
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pool-section">
        <div className="pool-header">
          <h3>Aufgaben aus Pool hinzufügen</h3>
          <button
            className="btn-small"
            onClick={() => setShowPool(!showPool)}
          >
            {showPool ? "Ausblenden" : "Pool anzeigen"}
          </button>
        </div>

        {showPool && (
          <>
            <div className="pool-filter-row">
              <select
                className="pool-select"
                value={selectedPoolId || ""}
                onChange={(e) => setSelectedPoolId(parseInt(e.target.value))}
              >
                {pools.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.task_count})
                  </option>
                ))}
              </select>
              <input
                type="text"
                className="search-input"
                placeholder="Aufgaben durchsuchen..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="pool-task-list">
              {availableTasks.map((task) => (
                <div key={task.id} className="pool-task-item">
                  <div className="exam-task-info">
                    <strong>{task.title}</strong>
                    <span className="task-text-preview">
                      {task.text.substring(0, 80)}...
                    </span>
                  </div>
                  <span className="task-points">{task.points} Pkt.</span>
                  <button
                    className="btn-primary-sm"
                    onClick={() => addTask(task.id)}
                  >
                    Hinzufügen
                  </button>
                </div>
              ))}
              {availableTasks.length === 0 && (
                <p className="empty-state">Keine verfügbaren Aufgaben in diesem Pool.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
