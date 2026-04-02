import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { toast } from "../shared/Toast";
import useEnabledTaskTypes from "../../hooks/useEnabledTaskTypes";
import QuestionRenderer from "../Questions/QuestionRenderer";
import Markdown from "../Markdown";

function TaskTypeFilter({ selected, onChange, availableTypes }) {
  const allKeys = Object.keys(availableTypes);
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
        {Object.entries(availableTypes).map(([key, label]) => (
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

export default function ExamBuilder() {
  const navigate = useNavigate();
  const [exams, setExams] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showAdhoc, setShowAdhoc] = useState(false);

  useEffect(() => {
    loadExams();
  }, []);

  async function loadExams() {
    try {
      const data = await api.get("/api/exams");
      setExams(data);
    } catch (err) {
      toast.error("Klassenarbeiten konnten nicht geladen werden");
    }
  }

  async function handleDuplicate(id) {
    try {
      await api.post(`/api/exams/${id}/duplicate`);
      loadExams();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Klassenarbeit wirklich löschen? Alle Ergebnisse gehen verloren.")) return;
    try {
      await api.delete(`/api/exams/${id}`);
      loadExams();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleStatusChange(id, status) {
    const messages = {
      active: "Klassenarbeit aktivieren? Schüler können dann sofort beitreten.",
      closed: "Klassenarbeit schließen? Schüler können dann nicht mehr antworten.",
      draft: "Klassenarbeit zurück auf Entwurf setzen?",
    };
    if (!confirm(messages[status] || "Status ändern?")) return;
    try {
      await api.put(`/api/exams/${id}`, { status });
      loadExams();
    } catch (err) {
      toast.error(err.message);
    }
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

  if (showAdhoc) {
    return (
      <AdhocExamForm
        onDone={(exam) => {
          setShowAdhoc(false);
          if (exam) setEditing(exam);
          loadExams();
        }}
        onCancel={() => setShowAdhoc(false)}
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
        <div className="page-header-actions">
          <button className="btn-primary-sm" onClick={() => setShowCreate(true)}>
            + Neue Klassenarbeit
          </button>
          <button className="btn-primary-sm btn-adhoc" onClick={() => setShowAdhoc(true)}>
            + Ad-Hoc aus Dokumenten
          </button>
        </div>
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
              <button
                className="btn-small"
                onClick={() => handleDuplicate(exam.id)}
              >
                Duplizieren
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

const GRADING_PRESETS = {
  ihk: {
    label: "IHK (Standard)",
    scale: [
      { percent: 90, grade: "1", label: "sehr gut" },
      { percent: 75, grade: "2", label: "gut" },
      { percent: 60, grade: "3", label: "befriedigend" },
      { percent: 45, grade: "4", label: "ausreichend" },
      { percent: 25, grade: "5", label: "mangelhaft" },
      { percent: 0, grade: "6", label: "ungenuegend" },
    ],
  },
  linear: {
    label: "Linear",
    scale: [
      { percent: 85, grade: "1", label: "sehr gut" },
      { percent: 70, grade: "2", label: "gut" },
      { percent: 55, grade: "3", label: "befriedigend" },
      { percent: 40, grade: "4", label: "ausreichend" },
      { percent: 20, grade: "5", label: "mangelhaft" },
      { percent: 0, grade: "6", label: "ungenuegend" },
    ],
  },
  strict: {
    label: "Streng",
    scale: [
      { percent: 92, grade: "1", label: "sehr gut" },
      { percent: 81, grade: "2", label: "gut" },
      { percent: 67, grade: "3", label: "befriedigend" },
      { percent: 50, grade: "4", label: "ausreichend" },
      { percent: 30, grade: "5", label: "mangelhaft" },
      { percent: 0, grade: "6", label: "ungenuegend" },
    ],
  },
};

function ExamForm({ exam, onSave, onCancel }) {
  const isNew = !exam;
  const [form, setForm] = useState({
    title: exam?.title || "",
    description: exam?.description || "",
    class_name: exam?.class_name || "",
    date: exam?.date || "",
    duration_minutes: exam?.duration_minutes || "",
    password: exam?.password || "",
    shuffle_tasks: exam?.shuffle_tasks || false,
  });
  const [gradingScale, setGradingScale] = useState(exam?.grading_scale || null);
  const [showGradingEditor, setShowGradingEditor] = useState(!!exam?.grading_scale);
  const [saving, setSaving] = useState(false);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    // Validate grading scale if set
    if (gradingScale && gradingScale.length > 0) {
      for (const entry of gradingScale) {
        const p = entry.percent;
        if (p < 0 || p > 100 || isNaN(p)) {
          toast.error("Notenschlüssel: Alle Prozentwerte müssen zwischen 0 und 100 liegen.");
          return;
        }
        if (!entry.grade.trim() || !entry.label.trim()) {
          toast.error("Notenschlüssel: Note und Bezeichnung dürfen nicht leer sein.");
          return;
        }
      }
      const percents = gradingScale.map(e => e.percent);
      for (let i = 1; i < percents.length; i++) {
        if (percents[i] >= percents[i - 1]) {
          toast.error("Notenschlüssel: Prozentwerte müssen absteigend sortiert sein.");
          return;
        }
      }
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        duration_minutes: form.duration_minutes
          ? parseInt(form.duration_minutes)
          : null,
        password: form.password || null,
        shuffle_tasks: form.shuffle_tasks,
        grading_scale: gradingScale,
      };
      if (isNew) {
        await api.post("/api/exams", payload);
      } else {
        await api.put(`/api/exams/${exam.id}`, payload);
      }
      onSave();
    } catch (err) {
      toast.error(err.message);
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
          <div className="form-group">
            <label>Passwort (optional)</label>
            <input
              type="text"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              placeholder="Zugangscode für Schüler"
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
        <div className="form-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={form.shuffle_tasks}
              onChange={(e) => update("shuffle_tasks", e.target.checked)}
            />
            Aufgabenreihenfolge pro Schueler zufaellig mischen (gegen Abschreiben)
          </label>
        </div>

        <div className="form-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={showGradingEditor}
              onChange={(e) => {
                setShowGradingEditor(e.target.checked);
                if (!e.target.checked) setGradingScale(null);
                else if (!gradingScale) setGradingScale([...GRADING_PRESETS.ihk.scale]);
              }}
            />
            Eigenen Notenschluessel verwenden (Standard: IHK)
          </label>
        </div>

        {showGradingEditor && (
          <div className="grading-editor">
            <div className="grading-presets">
              {Object.entries(GRADING_PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  type="button"
                  className={`btn-small ${JSON.stringify(gradingScale) === JSON.stringify(preset.scale) ? "active" : ""}`}
                  onClick={() => setGradingScale([...preset.scale.map(s => ({...s}))])}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <table className="grading-table">
              <thead>
                <tr>
                  <th>Ab %</th>
                  <th>Note</th>
                  <th>Bezeichnung</th>
                </tr>
              </thead>
              <tbody>
                {(gradingScale || []).map((entry, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={entry.percent}
                        onChange={(e) => {
                          const next = [...gradingScale];
                          next[i] = { ...next[i], percent: parseInt(e.target.value) || 0 };
                          setGradingScale(next);
                        }}
                        style={{ width: 70 }}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={entry.grade}
                        onChange={(e) => {
                          const next = [...gradingScale];
                          next[i] = { ...next[i], grade: e.target.value };
                          setGradingScale(next);
                        }}
                        style={{ width: 50 }}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={entry.label}
                        onChange={(e) => {
                          const next = [...gradingScale];
                          next[i] = { ...next[i], label: e.target.value };
                          setGradingScale(next);
                        }}
                        style={{ width: 140 }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

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

function AdhocExamForm({ onDone, onCancel }) {
  const { filteredTypes } = useEnabledTaskTypes();
  const [form, setForm] = useState({
    title: "",
    class_name: "",
    date: "",
    duration_minutes: "",
    description: "",
    instructions: "",
  });
  const [files, setFiles] = useState([]);
  const [allowedTypes, setAllowedTypes] = useState([]);
  const [codingLanguage, setCodingLanguage] = useState("python");

  // Initialize allowedTypes from enabled settings
  useEffect(() => {
    setAllowedTypes(Object.keys(filteredTypes));
  }, [Object.keys(filteredTypes).join(",")]);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState("");

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleFileChange(e) {
    const selected = Array.from(e.target.files || []);
    setFiles(selected);
  }

  async function handleGenerate(e) {
    e.preventDefault();
    if (files.length === 0) {
      toast.error("Bitte mindestens ein Dokument hochladen.");
      return;
    }
    if (!form.title.trim()) {
      toast.error("Bitte einen Titel eingeben.");
      return;
    }

    setGenerating(true);
    setProgress("Dokumente werden analysiert und Aufgaben generiert...");

    try {
      const formData = new FormData();
      for (const f of files) {
        formData.append("files", f);
      }
      formData.append("title", form.title);
      formData.append("description", form.description);
      formData.append("class_name", form.class_name);
      formData.append("date", form.date);
      formData.append("duration_minutes", form.duration_minutes || "");
      let finalInstructions = form.instructions;
      if (allowedTypes.includes("coding") && codingLanguage) {
        const langLabels = { javascript: "JavaScript", python: "Python", sql: "SQL", html: "HTML/CSS", typescript: "TypeScript" };
        const langHint = `Programmieraufgaben sollen in ${langLabels[codingLanguage] || codingLanguage} (language: "${codingLanguage}") erstellt werden.`;
        finalInstructions = finalInstructions ? `${finalInstructions}\n${langHint}` : langHint;
      }
      formData.append("instructions", finalInstructions);
      if (allowedTypes.length > 0) {
        formData.append("allowed_types", allowedTypes.join(","));
      }

      const result = await api.postForm("/api/exams/generate-adhoc", formData);
      setProgress(
        `Fertig! ${result.task_count} Aufgaben erstellt.` +
          (result.errors?.length
            ? ` (${result.errors.length} Fehler)`
            : "")
      );
      setTimeout(() => onDone(result.exam), 1500);
    } catch (err) {
      setProgress("");
      toast.error(err.message || "Unbekannter Fehler");
      setGenerating(false);
    }
  }

  return (
    <div className="task-editor">
      <h2>Ad-Hoc Klassenarbeit erstellen</h2>
      <p className="adhoc-description">
        Lade Dokumente hoch und beschreibe, wie die Klassenarbeit aussehen soll.
        Die KI erstellt automatisch passende Aufgaben.
      </p>
      <form onSubmit={handleGenerate}>
        <div className="form-group">
          <label>Titel</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            placeholder="z.B. Klassenarbeit 2 - Linux Administration"
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
          <label>Dokumente (PDF / DOCX)</label>
          <input
            type="file"
            accept=".pdf,.docx"
            multiple
            onChange={handleFileChange}
            className="file-input"
          />
          {files.length > 0 && (
            <div className="adhoc-file-list">
              {files.map((f, i) => (
                <span key={i} className="adhoc-file-tag">{f.name}</span>
              ))}
            </div>
          )}
        </div>

        <div className="form-group">
          <label>Anweisungen zur Aufgabenerstellung</label>
          <textarea
            value={form.instructions}
            onChange={(e) => update("instructions", e.target.value)}
            placeholder="Beschreibe, wie die Aufgaben aussehen sollen. Z.B.: 'Erstelle nur Freitextaufgaben bei denen Schüler Linux-Kommandos eingeben müssen' oder 'Erstelle 10 Multiple-Choice-Fragen zum Thema Netzwerke'"
            rows={4}
          />
        </div>

        <TaskTypeFilter selected={allowedTypes} onChange={setAllowedTypes} availableTypes={filteredTypes} />

        {allowedTypes.includes("coding") && (
          <div className="form-group">
            <label>Programmiersprache fuer Coding-Aufgaben</label>
            <select value={codingLanguage} onChange={(e) => setCodingLanguage(e.target.value)}>
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
              <option value="sql">SQL</option>
              <option value="html">HTML/CSS</option>
              <option value="typescript">TypeScript</option>
            </select>
          </div>
        )}

        <div className="form-group">
          <label>Beschreibung (optional)</label>
          <textarea
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            placeholder="Optionale Beschreibung der Klassenarbeit"
            rows={2}
          />
        </div>

        {progress && (
          <div className="adhoc-progress">
            {generating && <span className="grading-spinner"></span>}
            {progress}
          </div>
        )}

        <div className="form-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
            disabled={generating}
          >
            Abbrechen
          </button>
          <button
            type="submit"
            className="btn-primary-sm"
            disabled={generating}
          >
            {generating ? "Wird generiert..." : "Klassenarbeit generieren"}
          </button>
        </div>
      </form>
    </div>
  );
}

function TaskPreview({ task, expanded, onToggle, children }) {
  const TYPE_LABELS = {
    multichoice: "Multiple Choice",
    truefalse: "Wahr/Falsch",
    shortanswer: "Kurzantwort",
    numerical: "Numerisch",
    matching: "Zuordnung",
    ordering: "Reihenfolge",
    cloze: "Lückentext",
    essay: "Freitext",
    description: "Beschreibung",
    webapp: "Web-App",
    feynman: "Feynman-Erklärung",
    scenario: "Branching-Szenario",
    coding: "Programmierung",
    photo: "Foto-Aufgabe",
  };

  // Ensure question_data is parsed (API may return it as JSON string)
  const parsedTask = {
    ...task,
    question_data: typeof task.question_data === "string"
      ? JSON.parse(task.question_data || "{}")
      : (task.question_data || {}),
  };

  return (
    <div className={`task-preview-wrapper ${expanded ? "task-preview-expanded" : ""}`}>
      <div className="task-preview-header" onClick={onToggle}>
        <div className="exam-task-info">
          <strong>{task.title}</strong>
          <span className="task-type-badge">{TYPE_LABELS[task.task_type] || task.task_type}</span>
          {!expanded && task.text && (
            <span className="task-text-preview">
              {task.text.substring(0, 100)}{task.text.length > 100 ? "..." : ""}
            </span>
          )}
        </div>
        <span className="task-points">{task.points} Pkt.</span>
        {children}
        <button className="btn-small btn-preview-toggle" onClick={(e) => { e.stopPropagation(); onToggle(); }}>
          {expanded ? "▲" : "▼"}
        </button>
      </div>
      {expanded && (
        <div className="task-preview-body">
          <div className="task-preview-text"><Markdown>{task.text}</Markdown></div>
          {task.hint && <div className="task-preview-hint">Hinweis: <Markdown>{task.hint}</Markdown></div>}
          <div className="task-preview-box">
            <div className="task-preview-label">Schüler-Vorschau</div>
            <div className="task-preview-content">
              <QuestionRenderer
                task={parsedTask}
                answer=""
                onChange={() => {}}
                disabled={false}
              />
            </div>
          </div>
        </div>
      )}
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
  const [expandedExamTask, setExpandedExamTask] = useState(null);
  const [expandedPoolTask, setExpandedPoolTask] = useState(null);

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
    try {
      const data = await api.get(`/api/exams/${exam.id}/tasks`);
      setExamTasks(data);
    } catch (err) {
      toast.error("Aufgaben konnten nicht geladen werden");
    }
  }

  async function loadPools() {
    try {
      const data = await api.get("/api/pools");
      setPools(data);
      if (data.length > 0) {
        setSelectedPoolId(data[0].id);
      }
    } catch (err) {
      toast.error("Pools konnten nicht geladen werden");
    }
  }

  async function loadPoolTasks() {
    try {
      const data = await api.get(`/api/tasks?pool_id=${selectedPoolId}`);
      setPoolTasks(data);
    } catch (err) {
      toast.error("Pool-Aufgaben konnten nicht geladen werden");
    }
  }

  async function addTask(taskId) {
    try {
      await api.post(`/api/exams/${exam.id}/tasks`, { task_id: taskId });
      loadExamTasks();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function removeTask(taskId) {
    try {
      await api.delete(`/api/exams/${exam.id}/tasks/${taskId}`);
      loadExamTasks();
    } catch (err) {
      toast.error(err.message);
    }
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
      <div className="exam-detail-topbar">
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
      </div>

      <div className="exam-detail-columns">
        {/* Left: Pool browser */}
        <div className="exam-detail-pool">
          <h3>Aufgabenpool</h3>
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
              placeholder="Suchen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="pool-task-list">
            {availableTasks.map((task) => (
              <div key={task.id} className="pool-task-item-wrap">
                <TaskPreview
                  task={task}
                  expanded={expandedPoolTask === task.id}
                  onToggle={() => setExpandedPoolTask(expandedPoolTask === task.id ? null : task.id)}
                >
                  <button
                    className="btn-primary-sm"
                    onClick={(e) => { e.stopPropagation(); addTask(task.id); }}
                  >
                    +
                  </button>
                </TaskPreview>
              </div>
            ))}
            {availableTasks.length === 0 && (
              <p className="empty-state">Keine verfügbaren Aufgaben.</p>
            )}
          </div>
        </div>

        {/* Right: Exam tasks */}
        <div className="exam-detail-tasks">
          <h3>Aufgaben in der Klassenarbeit</h3>
          {examTasks.length === 0 ? (
            <p className="empty-state">
              Noch keine Aufgaben. Füge Aufgaben aus dem Pool links hinzu.
            </p>
          ) : (
            <div className="exam-task-list">
              {examTasks.map((task, index) => (
                <div key={task.id} className="exam-task-item-wrap">
                  <span className="exam-task-pos">{index + 1}.</span>
                  <TaskPreview
                    task={task}
                    expanded={expandedExamTask === task.id}
                    onToggle={() => setExpandedExamTask(expandedExamTask === task.id ? null : task.id)}
                  >
                    <button
                      className="btn-small btn-danger"
                      onClick={(e) => { e.stopPropagation(); removeTask(task.id); }}
                    >
                      Entfernen
                    </button>
                  </TaskPreview>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
