import { useState, useEffect } from "react";
import { api } from "../api/client";

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

// Cache to avoid re-fetching on every component mount
let _cache = null;
let _loading = false;
let _listeners = [];

function notifyListeners(data) {
  _listeners.forEach((fn) => fn(data));
}

async function fetchEnabledTypes() {
  if (_cache) return _cache;
  if (_loading) {
    return new Promise((resolve) => {
      _listeners.push(resolve);
    });
  }
  _loading = true;
  try {
    const data = await api.get("/api/auth/settings");
    if (data.enabled_task_types) {
      const parsed = JSON.parse(data.enabled_task_types);
      if (Array.isArray(parsed) && parsed.length > 0) {
        _cache = parsed;
        notifyListeners(parsed);
        return parsed;
      }
    }
  } catch {}
  const all = Object.keys(ALL_TASK_TYPES);
  _cache = all;
  notifyListeners(all);
  return all;
}

/** Invalidate cache when settings are saved */
export function invalidateTaskTypeCache() {
  _cache = null;
  _loading = false;
}

/**
 * Hook that returns { enabledTypes, allTypes, loading }
 * enabledTypes: string[] of enabled task type keys
 * allTypes: object mapping all type keys to labels
 * filteredTypes: object with only enabled types
 */
export default function useEnabledTaskTypes() {
  const [enabledTypes, setEnabledTypes] = useState(_cache || Object.keys(ALL_TASK_TYPES));
  const [loading, setLoading] = useState(!_cache);

  useEffect(() => {
    let cancelled = false;
    fetchEnabledTypes().then((types) => {
      if (!cancelled) {
        setEnabledTypes(types);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const filteredTypes = {};
  for (const key of enabledTypes) {
    if (ALL_TASK_TYPES[key]) {
      filteredTypes[key] = ALL_TASK_TYPES[key];
    }
  }

  return { enabledTypes, allTypes: ALL_TASK_TYPES, filteredTypes, loading };
}
