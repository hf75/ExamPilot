import { useState } from "react";
import { api } from "../../api/client";

const TASK_TYPES = {
  multichoice: "Multiple Choice",
  truefalse: "Wahr/Falsch",
  shortanswer: "Kurzantwort",
  numerical: "Numerisch",
  matching: "Zuordnung",
  essay: "Freitext",
  cloze: "Lückentext",
  ordering: "Reihenfolge",
  description: "Beschreibung",
};

function getDefaultQuestionData(type) {
  switch (type) {
    case "multichoice":
      return { single: true, shuffle: true, answers: [
        { text: "", fraction: 100, feedback: "" },
        { text: "", fraction: 0, feedback: "" },
      ]};
    case "truefalse":
      return { correct_answer: true, feedback_true: "", feedback_false: "" };
    case "shortanswer":
      return { answers: [{ text: "", fraction: 100 }] };
    case "numerical":
      return { answers: [{ value: 0, tolerance: 0, fraction: 100, feedback: "" }] };
    case "matching":
      return { shuffle: true, pairs: [{ question: "", answer: "" }, { question: "", answer: "" }] };
    case "ordering":
      return { horizontal: false, items: ["", ""] };
    case "essay":
      return { grader_info: "" };
    case "cloze":
      return { gaps: [] };
    case "description":
      return {};
    default:
      return {};
  }
}

export default function TaskEditor({ task, poolId, onSave, onCancel }) {
  const isNew = task === null;
  const [form, setForm] = useState({
    title: task?.title || "",
    text: task?.text || "",
    hint: task?.hint || "",
    topic: task?.topic || "",
    task_type: task?.task_type || "essay",
    points: task?.points || 1,
    question_data: task?.question_data || getDefaultQuestionData(task?.task_type || "essay"),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateQD(updates) {
    setForm((prev) => ({
      ...prev,
      question_data: { ...prev.question_data, ...updates },
    }));
  }

  function handleTypeChange(newType) {
    update("task_type", newType);
    setForm((prev) => ({
      ...prev,
      task_type: newType,
      question_data: getDefaultQuestionData(newType),
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (isNew) {
        await api.post("/api/tasks", { ...form, source: "manual", pool_id: poolId });
      } else {
        await api.put(`/api/tasks/${task.id}`, form);
      }
      onSave();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const qd = form.question_data || {};

  return (
    <div className="task-editor">
      <h2>{isNew ? "Neue Aufgabe erstellen" : "Aufgabe bearbeiten"}</h2>

      {error && <div className="error-message">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group" style={{ flex: 2 }}>
            <label>Titel</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="z.B. Aufgabe 1"
              required
            />
          </div>
          <div className="form-group">
            <label>Typ</label>
            <select
              value={form.task_type}
              onChange={(e) => handleTypeChange(e.target.value)}
            >
              {Object.entries(TASK_TYPES).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ maxWidth: 100 }}>
            <label>Punkte</label>
            <input
              type="number"
              min="0"
              max="50"
              value={form.points}
              onChange={(e) => update("points", parseInt(e.target.value) || 1)}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Aufgabentext</label>
          <textarea
            value={form.text}
            onChange={(e) => update("text", e.target.value)}
            placeholder={form.task_type === "cloze"
              ? "Text mit Lücken: Die Hauptstadt von Frankreich ist [[1]]."
              : "Die Aufgabenstellung für den Schüler..."}
            rows={4}
            required
          />
        </div>

        <div className="form-group">
          <label>Erwartete Lösung / Hinweis für die Bewertung</label>
          <textarea
            value={form.hint}
            onChange={(e) => update("hint", e.target.value)}
            placeholder="Lösungshinweis (wird auch für KI-Bewertung genutzt)"
            rows={2}
          />
        </div>

        <div className="form-group">
          <label>Themengebiet</label>
          <input
            type="text"
            value={form.topic}
            onChange={(e) => update("topic", e.target.value)}
            placeholder="z.B. Netzwerke, Datenbanken, Programmierung"
          />
        </div>

        {/* Type-specific configuration */}
        <div className="qd-config">
          {form.task_type === "multichoice" && (
            <MultiChoiceConfig qd={qd} onChange={updateQD} />
          )}
          {form.task_type === "truefalse" && (
            <TrueFalseConfig qd={qd} onChange={updateQD} />
          )}
          {form.task_type === "shortanswer" && (
            <ShortAnswerConfig qd={qd} onChange={updateQD} />
          )}
          {form.task_type === "numerical" && (
            <NumericalConfig qd={qd} onChange={updateQD} />
          )}
          {form.task_type === "matching" && (
            <MatchingConfig qd={qd} onChange={updateQD} />
          )}
          {form.task_type === "ordering" && (
            <OrderingConfig qd={qd} onChange={updateQD} />
          )}
          {form.task_type === "essay" && (
            <EssayConfig qd={qd} onChange={updateQD} />
          )}
          {form.task_type === "cloze" && (
            <ClozeConfig qd={qd} onChange={updateQD} />
          )}
        </div>

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Abbrechen
          </button>
          <button type="submit" className="btn-primary-sm" disabled={saving}>
            {saving ? "Wird gespeichert..." : isNew ? "Erstellen" : "Speichern"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* === Type-Specific Config Components === */

function MultiChoiceConfig({ qd, onChange }) {
  const answers = qd.answers || [];

  function updateAnswer(idx, field, value) {
    const next = [...answers];
    next[idx] = { ...next[idx], [field]: value };
    onChange({ answers: next });
  }

  function addAnswer() {
    onChange({ answers: [...answers, { text: "", fraction: 0, feedback: "" }] });
  }

  function removeAnswer(idx) {
    onChange({ answers: answers.filter((_, i) => i !== idx) });
  }

  return (
    <div className="qd-section">
      <h4>Multiple-Choice-Optionen</h4>
      <div className="form-row" style={{ marginBottom: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={qd.single !== false}
            onChange={(e) => onChange({ single: e.target.checked })}
          />
          Nur eine Antwort erlaubt
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={qd.shuffle !== false}
            onChange={(e) => onChange({ shuffle: e.target.checked })}
          />
          Antworten mischen
        </label>
      </div>
      {answers.map((ans, i) => (
        <div key={i} className="qd-answer-row">
          <input
            type="text"
            value={ans.text}
            onChange={(e) => updateAnswer(i, "text", e.target.value)}
            placeholder={`Antwort ${i + 1}`}
            style={{ flex: 2 }}
          />
          <select
            value={ans.fraction}
            onChange={(e) => updateAnswer(i, "fraction", parseInt(e.target.value))}
            style={{ width: 100 }}
          >
            <option value={100}>100%</option>
            <option value={50}>50%</option>
            <option value={33}>33%</option>
            <option value={25}>25%</option>
            <option value={0}>0%</option>
            <option value={-50}>-50%</option>
          </select>
          <input
            type="text"
            value={ans.feedback || ""}
            onChange={(e) => updateAnswer(i, "feedback", e.target.value)}
            placeholder="Feedback"
            style={{ flex: 1 }}
          />
          <button type="button" className="btn-small btn-danger" onClick={() => removeAnswer(i)}>×</button>
        </div>
      ))}
      <button type="button" className="btn-small" onClick={addAnswer} style={{ marginTop: 8 }}>
        + Antwort hinzufügen
      </button>
    </div>
  );
}

function TrueFalseConfig({ qd, onChange }) {
  return (
    <div className="qd-section">
      <h4>Wahr/Falsch-Konfiguration</h4>
      <div className="form-group">
        <label>Richtige Antwort</label>
        <select
          value={qd.correct_answer ? "true" : "false"}
          onChange={(e) => onChange({ correct_answer: e.target.value === "true" })}
        >
          <option value="true">Wahr</option>
          <option value="false">Falsch</option>
        </select>
      </div>
      <div className="form-group">
        <label>Feedback bei "Wahr"</label>
        <input
          type="text"
          value={qd.feedback_true || ""}
          onChange={(e) => onChange({ feedback_true: e.target.value })}
          placeholder="Feedback wenn Wahr gewählt"
        />
      </div>
      <div className="form-group">
        <label>Feedback bei "Falsch"</label>
        <input
          type="text"
          value={qd.feedback_false || ""}
          onChange={(e) => onChange({ feedback_false: e.target.value })}
          placeholder="Feedback wenn Falsch gewählt"
        />
      </div>
    </div>
  );
}

function ShortAnswerConfig({ qd, onChange }) {
  const answers = qd.answers || [];

  function updateAnswer(idx, field, value) {
    const next = [...answers];
    next[idx] = { ...next[idx], [field]: value };
    onChange({ answers: next });
  }

  function addAnswer() {
    onChange({ answers: [...answers, { text: "", fraction: 100 }] });
  }

  function removeAnswer(idx) {
    onChange({ answers: answers.filter((_, i) => i !== idx) });
  }

  return (
    <div className="qd-section">
      <h4>Referenzantworten (für KI-Bewertung)</h4>
      <p className="qd-hint">Die KI nutzt diese als Referenz für die semantische Bewertung.</p>
      {answers.map((ans, i) => (
        <div key={i} className="qd-answer-row">
          <input
            type="text"
            value={ans.text}
            onChange={(e) => updateAnswer(i, "text", e.target.value)}
            placeholder={`Akzeptierte Antwort ${i + 1}`}
            style={{ flex: 1 }}
          />
          <button type="button" className="btn-small btn-danger" onClick={() => removeAnswer(i)}>×</button>
        </div>
      ))}
      <button type="button" className="btn-small" onClick={addAnswer} style={{ marginTop: 8 }}>
        + Alternative Antwort
      </button>
    </div>
  );
}

function NumericalConfig({ qd, onChange }) {
  const answers = qd.answers || [];

  function updateAnswer(idx, field, value) {
    const next = [...answers];
    next[idx] = { ...next[idx], [field]: value };
    onChange({ answers: next });
  }

  function addAnswer() {
    onChange({ answers: [...answers, { value: 0, tolerance: 0, fraction: 100, feedback: "" }] });
  }

  function removeAnswer(idx) {
    onChange({ answers: answers.filter((_, i) => i !== idx) });
  }

  return (
    <div className="qd-section">
      <h4>Numerische Antworten</h4>
      {answers.map((ans, i) => (
        <div key={i} className="qd-answer-row">
          <div className="form-group" style={{ flex: 1 }}>
            <label>Wert</label>
            <input
              type="number"
              step="any"
              value={ans.value}
              onChange={(e) => updateAnswer(i, "value", parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Toleranz (±)</label>
            <input
              type="number"
              step="any"
              min="0"
              value={ans.tolerance}
              onChange={(e) => updateAnswer(i, "tolerance", parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="form-group" style={{ width: 80 }}>
            <label>%</label>
            <input
              type="number"
              value={ans.fraction}
              onChange={(e) => updateAnswer(i, "fraction", parseInt(e.target.value) || 0)}
            />
          </div>
          <button type="button" className="btn-small btn-danger" onClick={() => removeAnswer(i)}
            style={{ alignSelf: "flex-end", marginBottom: 4 }}>×</button>
        </div>
      ))}
      <button type="button" className="btn-small" onClick={addAnswer} style={{ marginTop: 8 }}>
        + Alternativer Wert
      </button>
    </div>
  );
}

function MatchingConfig({ qd, onChange }) {
  const pairs = qd.pairs || [];

  function updatePair(idx, field, value) {
    const next = [...pairs];
    next[idx] = { ...next[idx], [field]: value };
    onChange({ pairs: next });
  }

  function addPair() {
    onChange({ pairs: [...pairs, { question: "", answer: "" }] });
  }

  function removePair(idx) {
    onChange({ pairs: pairs.filter((_, i) => i !== idx) });
  }

  return (
    <div className="qd-section">
      <h4>Zuordnungspaare</h4>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <input
          type="checkbox"
          checked={qd.shuffle !== false}
          onChange={(e) => onChange({ shuffle: e.target.checked })}
        />
        Antworten mischen
      </label>
      {pairs.map((pair, i) => (
        <div key={i} className="qd-answer-row">
          <input
            type="text"
            value={pair.question}
            onChange={(e) => updatePair(i, "question", e.target.value)}
            placeholder="Begriff / Frage"
            style={{ flex: 1 }}
          />
          <span style={{ color: "var(--text-secondary)" }}>&rarr;</span>
          <input
            type="text"
            value={pair.answer}
            onChange={(e) => updatePair(i, "answer", e.target.value)}
            placeholder="Zuordnung / Antwort"
            style={{ flex: 1 }}
          />
          <button type="button" className="btn-small btn-danger" onClick={() => removePair(i)}>×</button>
        </div>
      ))}
      <button type="button" className="btn-small" onClick={addPair} style={{ marginTop: 8 }}>
        + Paar hinzufügen
      </button>
    </div>
  );
}

function OrderingConfig({ qd, onChange }) {
  const items = qd.items || [];

  function updateItem(idx, value) {
    const next = [...items];
    next[idx] = value;
    onChange({ items: next });
  }

  function addItem() {
    onChange({ items: [...items, ""] });
  }

  function removeItem(idx) {
    onChange({ items: items.filter((_, i) => i !== idx) });
  }

  return (
    <div className="qd-section">
      <h4>Elemente (in korrekter Reihenfolge)</h4>
      <p className="qd-hint">Die Reihenfolge hier ist die richtige Lösung. Schüler sehen die Elemente gemischt.</p>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <input
          type="checkbox"
          checked={qd.horizontal || false}
          onChange={(e) => onChange({ horizontal: e.target.checked })}
        />
        Horizontal anzeigen
      </label>
      {items.map((item, i) => (
        <div key={i} className="qd-answer-row">
          <span style={{ color: "var(--accent)", fontWeight: 700, minWidth: 24 }}>{i + 1}.</span>
          <input
            type="text"
            value={item}
            onChange={(e) => updateItem(i, e.target.value)}
            placeholder={`Element ${i + 1}`}
            style={{ flex: 1 }}
          />
          <button type="button" className="btn-small btn-danger" onClick={() => removeItem(i)}>×</button>
        </div>
      ))}
      <button type="button" className="btn-small" onClick={addItem} style={{ marginTop: 8 }}>
        + Element hinzufügen
      </button>
    </div>
  );
}

function EssayConfig({ qd, onChange }) {
  return (
    <div className="qd-section">
      <h4>Freitext-Konfiguration</h4>
      <div className="form-group">
        <label>Bewertungshinweis für die KI</label>
        <textarea
          value={qd.grader_info || ""}
          onChange={(e) => onChange({ grader_info: e.target.value })}
          placeholder="Bewertungskriterien und erwartete Inhalte für die KI-Bewertung..."
          rows={3}
        />
      </div>
    </div>
  );
}

function ClozeConfig({ qd, onChange }) {
  const gaps = qd.gaps || [];

  function updateGap(idx, updates) {
    const next = [...gaps];
    next[idx] = { ...next[idx], ...updates };
    onChange({ gaps: next });
  }

  function addGap() {
    onChange({ gaps: [...gaps, { type: "shortanswer", answers: [{ text: "", fraction: 100 }] }] });
  }

  function removeGap(idx) {
    onChange({ gaps: gaps.filter((_, i) => i !== idx) });
  }

  function updateGapAnswer(gapIdx, ansIdx, field, value) {
    const next = [...gaps];
    const answers = [...(next[gapIdx].answers || [])];
    answers[ansIdx] = { ...answers[ansIdx], [field]: value };
    next[gapIdx] = { ...next[gapIdx], answers };
    onChange({ gaps: next });
  }

  function addGapAnswer(gapIdx) {
    const next = [...gaps];
    const answers = [...(next[gapIdx].answers || []), { text: "", fraction: 0 }];
    next[gapIdx] = { ...next[gapIdx], answers };
    onChange({ gaps: next });
  }

  return (
    <div className="qd-section">
      <h4>Lücken-Konfiguration</h4>
      <p className="qd-hint">
        Verwende [[1]], [[2]], etc. im Aufgabentext um die Lücken zu markieren.
        Definiere hier die erwarteten Antworten für jede Lücke.
      </p>
      {gaps.map((gap, i) => (
        <div key={i} className="qd-gap-section">
          <div className="qd-answer-row" style={{ marginBottom: 8 }}>
            <strong style={{ color: "var(--accent)" }}>Lücke [[{i + 1}]]</strong>
            <select
              value={gap.type || "shortanswer"}
              onChange={(e) => updateGap(i, { type: e.target.value })}
              style={{ width: 140 }}
            >
              <option value="shortanswer">Kurzantwort</option>
              <option value="multichoice">Multiple Choice</option>
              <option value="numerical">Numerisch</option>
            </select>
            <button type="button" className="btn-small btn-danger" onClick={() => removeGap(i)}>×</button>
          </div>
          {(gap.answers || []).map((ans, j) => (
            <div key={j} className="qd-answer-row" style={{ paddingLeft: 20 }}>
              <input
                type="text"
                value={ans.text ?? ans.value ?? ""}
                onChange={(e) => updateGapAnswer(i, j, gap.type === "numerical" ? "value" : "text", e.target.value)}
                placeholder={gap.type === "multichoice" ? `Option ${j + 1}` : `Antwort ${j + 1}`}
                style={{ flex: 1 }}
              />
              <select
                value={ans.fraction ?? 0}
                onChange={(e) => updateGapAnswer(i, j, "fraction", parseInt(e.target.value))}
                style={{ width: 80 }}
              >
                <option value={100}>100%</option>
                <option value={50}>50%</option>
                <option value={0}>0%</option>
              </select>
            </div>
          ))}
          <button type="button" className="btn-small" onClick={() => addGapAnswer(i)}
            style={{ marginLeft: 20, marginBottom: 12 }}>
            + Option
          </button>
        </div>
      ))}
      <button type="button" className="btn-small" onClick={addGap} style={{ marginTop: 8 }}>
        + Lücke hinzufügen
      </button>
    </div>
  );
}
