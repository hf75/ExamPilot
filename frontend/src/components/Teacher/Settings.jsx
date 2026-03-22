import { useState, useEffect } from "react";
import { api } from "../../api/client";
import { toast } from "../shared/Toast";
import { invalidateTaskTypeCache } from "../../hooks/useEnabledTaskTypes";

const ALL_TASK_TYPES = {
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
  coding: "Programmierung",
  photo: "Foto-Aufgabe",
};

export default function Settings() {
  const [enabledTypes, setEnabledTypes] = useState(Object.keys(ALL_TASK_TYPES));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiKeyMasked, setApiKeyMasked] = useState("");
  const [apiKeySet, setApiKeySet] = useState(false);
  const [newApiKey, setNewApiKey] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [showKeyInput, setShowKeyInput] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const data = await api.get("/api/auth/settings");
      if (data.enabled_task_types) {
        try {
          const parsed = JSON.parse(data.enabled_task_types);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setEnabledTypes(parsed);
          }
        } catch {}
      }
      setApiKeyMasked(data.api_key_masked || "");
      setApiKeySet(data.api_key_set || false);
    } catch (err) {
      toast.error("Einstellungen konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (enabledTypes.length === 0) {
      toast.warning("Mindestens ein Aufgabentyp muss aktiviert sein");
      return;
    }
    setSaving(true);
    try {
      await api.put("/api/auth/settings", {
        enabled_task_types: JSON.stringify(enabledTypes),
      });
      invalidateTaskTypeCache();
      toast.success("Einstellungen gespeichert");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  function toggleType(type) {
    setEnabledTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  async function handleSaveApiKey() {
    if (!newApiKey.trim()) {
      toast.warning("Bitte einen API-Key eingeben");
      return;
    }
    setSavingKey(true);
    try {
      await api.put("/api/auth/settings", {
        anthropic_api_key: newApiKey.trim(),
      });
      toast.success("API-Key gespeichert");
      setNewApiKey("");
      setShowKeyInput(false);
      // Reload to get new masked key
      const data = await api.get("/api/auth/settings");
      setApiKeyMasked(data.api_key_masked || "");
      setApiKeySet(data.api_key_set || false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingKey(false);
    }
  }

  async function handleRemoveApiKey() {
    setSavingKey(true);
    try {
      await api.put("/api/auth/settings", {
        anthropic_api_key: "",
      });
      toast.success("API-Key entfernt (Umgebungsvariable wird verwendet)");
      setApiKeyMasked("");
      setApiKeySet(false);
      setShowKeyInput(false);
      // Reload
      const data = await api.get("/api/auth/settings");
      setApiKeyMasked(data.api_key_masked || "");
      setApiKeySet(data.api_key_set || false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingKey(false);
    }
  }

  const allKeys = Object.keys(ALL_TASK_TYPES);
  const allSelected = enabledTypes.length === allKeys.length;

  if (loading) return <p>Laden...</p>;

  return (
    <div className="settings-page">
      <h2>Einstellungen</h2>

      <div className="settings-section">
        <h3>API-Key (Anthropic / Claude)</h3>
        <p className="settings-description">
          Der API-Key wird für KI-Bewertung, Aufgabengenerierung und Feynman/Szenario-Aufgaben benötigt.
        </p>

        {apiKeySet ? (
          <div className="settings-api-status">
            <span className="settings-api-badge active">Aktiv</span>
            <code className="settings-api-masked">{apiKeyMasked}</code>
          </div>
        ) : (
          <div className="settings-api-status">
            <span className="settings-api-badge inactive">Nicht konfiguriert</span>
          </div>
        )}

        {!showKeyInput ? (
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button className="btn-primary-sm" onClick={() => setShowKeyInput(true)}>
              {apiKeySet ? "Key ändern" : "Key eingeben"}
            </button>
            {apiKeySet && (
              <button className="btn-secondary" onClick={handleRemoveApiKey} disabled={savingKey} style={{ fontSize: "0.85rem" }}>
                Entfernen
              </button>
            )}
          </div>
        ) : (
          <div className="settings-api-input-row">
            <input
              type="password"
              value={newApiKey}
              onChange={(e) => setNewApiKey(e.target.value)}
              placeholder="sk-ant-..."
              className="settings-api-input"
              autoFocus
            />
            <button className="btn-primary-sm" onClick={handleSaveApiKey} disabled={savingKey || !newApiKey.trim()}>
              {savingKey ? "..." : "Speichern"}
            </button>
            <button className="btn-secondary" onClick={() => { setShowKeyInput(false); setNewApiKey(""); }} style={{ fontSize: "0.85rem" }}>
              Abbrechen
            </button>
          </div>
        )}
      </div>

      <div className="settings-section">
        <h3>Aufgabentypen</h3>
        <p className="settings-description">
          Wähle aus, welche Aufgabentypen dir zur Verfügung stehen sollen.
          Deaktivierte Typen werden im Aufgaben-Editor, bei der KI-Generierung
          und in der Ad-Hoc-Erstellung ausgeblendet.
        </p>

        <div className="type-filter-grid">
          <button
            type="button"
            className={`type-filter-chip ${allSelected ? "active" : ""}`}
            onClick={() => setEnabledTypes(allSelected ? [] : [...allKeys])}
          >
            Alle
          </button>
          {Object.entries(ALL_TASK_TYPES).map(([key, label]) => (
            <button
              type="button"
              key={key}
              className={`type-filter-chip ${enabledTypes.includes(key) ? "active" : ""}`}
              onClick={() => toggleType(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 20 }}>
          <button
            className="btn-primary-sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Speichert..." : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}
