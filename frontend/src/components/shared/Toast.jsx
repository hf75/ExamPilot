import { useState, useEffect, useCallback } from "react";

let _addToast = () => {};

/**
 * Global toast function. Usage: toast.error("message"), toast.success("message"), etc.
 */
export const toast = {
  info: (msg) => _addToast(msg, "info"),
  success: (msg) => _addToast(msg, "success"),
  error: (msg) => _addToast(msg, "error"),
  warning: (msg) => _addToast(msg, "warning"),
};

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  useEffect(() => {
    _addToast = addToast;
    return () => { _addToast = () => {}; };
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
