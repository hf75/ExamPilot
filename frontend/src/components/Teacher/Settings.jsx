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
      setTunnelEnabled(data.tunnel_enabled || false);
      setTunnelUrl(data.tunnel_url || null);
      setTunnelInstalled(data.tunnel_installed || false);
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

  // Tunnel state
  const [tunnelEnabled, setTunnelEnabled] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState(null);
  const [tunnelInstalled, setTunnelInstalled] = useState(false);
  const [savingTunnel, setSavingTunnel] = useState(false);

  // LTI state
  const [ltiPlatforms, setLtiPlatforms] = useState([]);
  const [showLtiForm, setShowLtiForm] = useState(false);
  const [ltiForm, setLtiForm] = useState({ issuer: "", client_id: "", auth_login_url: "", auth_token_url: "", keyset_url: "", deployment_id: "1" });
  const [savingLti, setSavingLti] = useState(false);
  const [ltiToolConfig, setLtiToolConfig] = useState(null);

  useEffect(() => { loadLtiPlatforms(); }, []);

  async function loadLtiPlatforms() {
    try {
      const data = await api.get("/api/lti/platforms");
      setLtiPlatforms(data);
    } catch {}
  }

  async function handleRegisterPlatform() {
    setSavingLti(true);
    try {
      const result = await api.post("/api/lti/platforms", ltiForm);
      toast.success("Plattform registriert");
      setShowLtiForm(false);
      setLtiForm({ issuer: "", client_id: "", auth_login_url: "", auth_token_url: "", keyset_url: "", deployment_id: "1" });
      loadLtiPlatforms();
      // Show tool config
      const config = await api.get(`/api/lti/platforms/${result.id}/config`);
      setLtiToolConfig(config);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingLti(false);
    }
  }

  async function handleDeletePlatform(id) {
    if (!confirm("Plattform wirklich entfernen?")) return;
    try {
      await api.delete(`/api/lti/platforms/${id}`);
      loadLtiPlatforms();
      toast.success("Plattform entfernt");
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleShowToolConfig(id) {
    try {
      const config = await api.get(`/api/lti/platforms/${id}/config`);
      setLtiToolConfig(config);
    } catch (err) {
      toast.error(err.message);
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
        <h3>HTTPS-Tunnel (Cloudflare)</h3>
        <p className="settings-description">
          Aktiviert einen sicheren HTTPS-Tunnel über Cloudflare.
          Schüler können sich dann über eine öffentliche URL verbinden — ohne Portfreigabe
          oder Netzwerkkonfiguration. Beim ersten Aktivieren wird cloudflared
          automatisch heruntergeladen (~30 MB). Der Tunnel startet beim nächsten Server-Neustart.
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <label className="checkbox-label" style={{ margin: 0 }}>
            <input
              type="checkbox"
              checked={tunnelEnabled}
              onChange={async (e) => {
                const val = e.target.checked;
                setSavingTunnel(true);
                try {
                  await api.put("/api/auth/settings", { tunnel_enabled: val ? "true" : "false" });
                  setTunnelEnabled(val);
                  toast.success(
                    val
                      ? "Tunnel aktiviert. Bitte Server neu starten."
                      : "Tunnel deaktiviert. Bitte Server neu starten."
                  );
                } catch (err) {
                  toast.error(err.message);
                } finally {
                  setSavingTunnel(false);
                }
              }}
              disabled={savingTunnel}
            />
            HTTPS-Tunnel aktivieren
          </label>
        </div>

        {tunnelUrl && (
          <div className="settings-tunnel-status">
            <span className="settings-api-badge active">Aktiv</span>
            <a href={tunnelUrl} target="_blank" rel="noopener noreferrer" className="settings-tunnel-url">
              {tunnelUrl}
            </a>
          </div>
        )}
        {tunnelEnabled && !tunnelUrl && (
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            {tunnelInstalled
              ? "Tunnel ist aktiviert — wird beim nächsten Server-Neustart gestartet."
              : "Tunnel ist aktiviert — cloudflared wird beim nächsten Server-Neustart heruntergeladen und gestartet."}
          </p>
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

      <div className="settings-section">
        <h3>LTI 1.3 / Moodle-Anbindung</h3>
        <p className="settings-description">
          Verbinde ExamPilot mit Moodle oder einem anderen LMS.
          Schüler starten Klassenarbeiten direkt aus Moodle — ohne separaten Login.
        </p>

        {ltiPlatforms.length > 0 && (
          <div className="lti-platform-list">
            {ltiPlatforms.map((p) => (
              <div key={p.id} className="lti-platform-card">
                <div className="lti-platform-info">
                  <strong>{p.issuer}</strong>
                  <span className="lti-platform-client">Client: {p.client_id}</span>
                </div>
                <div className="lti-platform-actions">
                  <button className="btn-small" onClick={() => handleShowToolConfig(p.id)}>
                    Konfiguration
                  </button>
                  <button className="btn-small btn-danger" onClick={() => handleDeletePlatform(p.id)}>
                    Entfernen
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {ltiToolConfig && (
          <div className="lti-tool-config">
            <h4>In Moodle eintragen:</h4>
            <div className="lti-config-grid">
              <label>Tool URL (Launch URL):</label>
              <code>{ltiToolConfig.launch_url}</code>
              <label>Login Initiation URL:</label>
              <code>{ltiToolConfig.login_initiation_url}</code>
              <label>Public Keyset URL:</label>
              <code>{ltiToolConfig.jwks_url}</code>
              <label>Redirect URI:</label>
              <code>{ltiToolConfig.redirect_uris?.[0]}</code>
              <label>Custom Parameter:</label>
              <code>{ltiToolConfig.custom_parameters}</code>
            </div>
            <button className="btn-small" onClick={() => setLtiToolConfig(null)} style={{ marginTop: 12 }}>
              Schließen
            </button>
          </div>
        )}

        {!showLtiForm ? (
          <button className="btn-primary-sm" onClick={() => setShowLtiForm(true)} style={{ marginTop: 12 }}>
            Plattform hinzufügen
          </button>
        ) : (
          <div className="lti-register-form">
            <h4>Neue Plattform registrieren</h4>
            <p className="settings-description">
              Die folgenden Werte findest du in Moodle unter:<br />
              Website-Administration &gt; Plugins &gt; Externes Tool &gt; Tool manuell konfigurieren
            </p>
            <div className="form-group">
              <label>Issuer (Platform ID / URL)</label>
              <input value={ltiForm.issuer} onChange={(e) => setLtiForm({ ...ltiForm, issuer: e.target.value })} placeholder="https://moodle.deine-schule.de" />
            </div>
            <div className="form-group">
              <label>Client ID</label>
              <input value={ltiForm.client_id} onChange={(e) => setLtiForm({ ...ltiForm, client_id: e.target.value })} placeholder="z.B. abc123def456" />
            </div>
            <div className="form-group">
              <label>Authentication Login URL</label>
              <input value={ltiForm.auth_login_url} onChange={(e) => setLtiForm({ ...ltiForm, auth_login_url: e.target.value })} placeholder="https://moodle.../mod/lti/auth.php" />
            </div>
            <div className="form-group">
              <label>Auth Token URL</label>
              <input value={ltiForm.auth_token_url} onChange={(e) => setLtiForm({ ...ltiForm, auth_token_url: e.target.value })} placeholder="https://moodle.../mod/lti/token.php" />
            </div>
            <div className="form-group">
              <label>Public Keyset URL</label>
              <input value={ltiForm.keyset_url} onChange={(e) => setLtiForm({ ...ltiForm, keyset_url: e.target.value })} placeholder="https://moodle.../mod/lti/certs.php" />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="btn-primary-sm" onClick={handleRegisterPlatform} disabled={savingLti}>
                {savingLti ? "..." : "Registrieren"}
              </button>
              <button className="btn-secondary" onClick={() => setShowLtiForm(false)}>Abbrechen</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
