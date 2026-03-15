import { useEffect, useRef, useCallback } from "react";

export default function WebApp({ task, questionData, answer, onChange, disabled }) {
  const iframeRef = useRef(null);
  const hasRestoredRef = useRef(false);

  // Listen for state updates from the iframe app
  useEffect(() => {
    if (disabled) return;

    function handleMessage(e) {
      if (e.data && e.data.type === "examPilotState") {
        onChange(JSON.stringify(e.data.state));
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onChange, disabled]);

  // Restore state into iframe when it loads
  const handleLoad = useCallback(() => {
    if (!iframeRef.current) return;
    const iframe = iframeRef.current;
    let state = null;

    if (answer) {
      try {
        state = JSON.parse(answer);
      } catch {
        // ignore invalid JSON
      }
    }

    if (state) {
      iframe.contentWindow.postMessage(
        { type: "examPilotRestore", state },
        "*"
      );
      hasRestoredRef.current = true;
    }
  }, [answer]);

  if (!questionData?.app_html) {
    return (
      <div className="question-webapp-empty">
        <p>Keine Web-App konfiguriert.</p>
      </div>
    );
  }

  return (
    <div className="question-webapp">
      <div className="webapp-iframe-container">
        {disabled && <div className="webapp-overlay" />}
        <iframe
          ref={iframeRef}
          srcDoc={questionData.app_html}
          sandbox="allow-scripts"
          onLoad={handleLoad}
          title={task?.title || "Web-App Aufgabe"}
          className="webapp-iframe"
        />
      </div>
    </div>
  );
}
