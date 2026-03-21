import { useState, useEffect, useRef, useCallback } from "react";

const LANG_LABELS = {
  javascript: "JavaScript",
  python: "Python",
  sql: "SQL",
  html: "HTML/CSS",
  typescript: "TypeScript",
};

export default function Coding({ task, questionData, answer, onChange, disabled }) {
  const lang = questionData.language || "javascript";
  const [code, setCode] = useState(questionData.starter_code || "");
  const [output, setOutput] = useState("");
  const [testResults, setTestResults] = useState([]);
  const [running, setRunning] = useState(false);
  const [runtimeReady, setRuntimeReady] = useState(lang === "javascript" || lang === "html");
  const iframeRef = useRef(null);
  const timeoutRef = useRef(null);

  // Restore code from saved answer
  useEffect(() => {
    if (answer) {
      try {
        const parsed = JSON.parse(answer);
        if (parsed.code) setCode(parsed.code);
        if (parsed.test_results) setTestResults(parsed.test_results);
      } catch {
        // not JSON, ignore
      }
    }
  }, []);

  // For Python/SQL/TS: check if runtime loads (they always load in-iframe)
  useEffect(() => {
    if (lang !== "javascript" && lang !== "html") {
      setRuntimeReady(true); // Runtime loads inside iframe on demand
    }
  }, [lang]);

  const saveAnswer = useCallback((newCode, newResults) => {
    const data = JSON.stringify({ code: newCode, test_results: newResults });
    onChange(data);
  }, [onChange]);

  function handleCodeChange(e) {
    const val = e.target.value;
    setCode(val);
    // Save code on change (no test results yet)
    saveAnswer(val, testResults);
  }

  function handleKeyDown(e) {
    if (e.key === "Tab") {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const val = code.substring(0, start) + "  " + code.substring(end);
      setCode(val);
      // Restore cursor position after React re-render
      setTimeout(() => {
        e.target.selectionStart = e.target.selectionEnd = start + 2;
      }, 0);
    }
  }

  function handleRun() {
    if (running || disabled) return;
    setRunning(true);
    setOutput("");
    setTestResults([]);

    if (lang === "html") {
      runHTML();
    } else if (lang === "sql") {
      runSQL();
    } else {
      runInSandbox(lang);
    }
  }

  function runHTML() {
    // HTML just renders in iframe
    if (iframeRef.current) {
      iframeRef.current.srcdoc = code;
    }
    setOutput("HTML-Vorschau aktualisiert.");
    setRunning(false);
    saveAnswer(code, []);
  }

  function runSQL() {
    const schema = questionData.sql_schema || "";
    const expected = questionData.sql_expected;

    const harness = `<!DOCTYPE html><html><head>
<script src="https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.11.0/sql-wasm.js"></script>
</head><body><script>
(async () => {
  try {
    const SQL = await initSqlJs({ locateFile: f => 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.11.0/' + f });
    const db = new SQL.Database();
    // Run schema
    db.run(${JSON.stringify(schema)});
    // Run student query
    const result = db.exec(${"`"}${"${"}studentCode}${"`"});
    const rows = result.length > 0 ? [result[0].columns, ...result[0].values] : [];
    const expected = ${JSON.stringify(expected)};
    let passed = false;
    if (expected && expected.length > 0) {
      passed = JSON.stringify(rows) === JSON.stringify(expected);
    }
    parent.postMessage({ type: 'coding-result', output: JSON.stringify(rows, null, 2), testResults: [{ passed, actual_output: JSON.stringify(rows) }] }, '*');
  } catch (err) {
    parent.postMessage({ type: 'coding-result', output: 'Fehler: ' + err.message, testResults: [{ passed: false, actual_output: '', error: err.message }] }, '*');
  }
})();
</script></body></html>`.replace("${studentCode}", code.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$"));

    executeInIframe(harness);
  }

  function runInSandbox(language) {
    const testCases = questionData.test_cases || [];
    const hiddenTests = questionData.hidden_tests || false;

    if (language === "python") {
      const testCode = testCases.map((tc, i) => `
try:
    __result = str(${tc.input})
    __expected = ${JSON.stringify(tc.expected_output)}
    __results.append({"passed": __result.strip() == __expected.strip(), "actual_output": __result})
except Exception as e:
    __results.append({"passed": False, "actual_output": "", "error": str(e)})
`).join("");

      const harness = `<!DOCTYPE html><html><head>
<script src="https://cdn.jsdelivr.net/pyodide/v0.27.0/full/pyodide.js"></script>
</head><body><script>
(async () => {
  try {
    const pyodide = await loadPyodide();
    let __output = [];
    pyodide.runPython(\`
import sys, io
__old_stdout = sys.stdout
sys.stdout = io.StringIO()
__results = []
\`);
    pyodide.runPython(${JSON.stringify(code)});
    pyodide.runPython(${JSON.stringify(testCode)});
    const captured = pyodide.runPython("sys.stdout.getvalue()");
    const results = pyodide.runPython("import json; json.dumps(__results)");
    parent.postMessage({ type: 'coding-result', output: captured, testResults: JSON.parse(results) }, '*');
  } catch (err) {
    parent.postMessage({ type: 'coding-result', output: 'Fehler: ' + err.message, testResults: [] }, '*');
  }
})();
</script></body></html>`;
      executeInIframe(harness);

    } else {
      // JavaScript or TypeScript
      const tsTranspile = language === "typescript" ? `
<script src="https://cdn.jsdelivr.net/npm/typescript@5/lib/typescript.min.js"></script>
<script>
function transpileTS(code) {
  return ts.transpile(code, { target: ts.ScriptTarget.ES2020 });
}
</script>` : "";

      const testRunnerCode = testCases.map((tc, i) => `
try {
  var __r = String(${tc.input});
  __results.push({passed: __r.trim() === ${JSON.stringify(tc.expected_output)}.trim(), actual_output: __r});
} catch(e) {
  __results.push({passed: false, actual_output: '', error: e.message});
}`).join("\n");

      const harness = `<!DOCTYPE html><html><head>${tsTranspile}</head><body><script>
(function() {
  var __output = [];
  var __results = [];
  var __origLog = console.log;
  console.log = function() {
    __output.push(Array.from(arguments).map(String).join(' '));
    __origLog.apply(console, arguments);
  };
  try {
    var __code = ${JSON.stringify(code)};
    ${language === "typescript" ? "eval(transpileTS(__code));" : "eval(__code);"}
    ${testRunnerCode}
  } catch(e) {
    __output.push('Fehler: ' + e.message);
  }
  parent.postMessage({type:'coding-result', output: __output.join('\\n'), testResults: __results}, '*');
})();
</script></body></html>`;
      executeInIframe(harness);
    }
  }

  function executeInIframe(html) {
    // Listen for results
    function handler(event) {
      if (event.data?.type === "coding-result") {
        window.removeEventListener("message", handler);
        clearTimeout(timeoutRef.current);
        setOutput(event.data.output || "");
        setTestResults(event.data.testResults || []);
        setRunning(false);
        saveAnswer(code, event.data.testResults || []);
      }
    }
    window.addEventListener("message", handler);

    // Timeout after 15s
    timeoutRef.current = setTimeout(() => {
      window.removeEventListener("message", handler);
      setOutput("Zeitueberschreitung: Code hat zu lange gebraucht (>15s).");
      setRunning(false);
    }, 15000);

    // Create sandboxed iframe
    const iframe = document.createElement("iframe");
    iframe.sandbox = "allow-scripts";
    iframe.style.display = "none";
    iframe.srcdoc = html;
    document.body.appendChild(iframe);

    // Cleanup after result or timeout
    const cleanup = () => { try { document.body.removeChild(iframe); } catch {} };
    setTimeout(cleanup, 16000);
  }

  const testCases = questionData.test_cases || [];
  const hiddenTests = questionData.hidden_tests || false;
  const passedCount = testResults.filter(r => r.passed).length;

  return (
    <div className="question-coding">
      <div className="coding-toolbar">
        <span className="coding-language-badge">{LANG_LABELS[lang] || lang}</span>
        <button
          type="button"
          className="btn-primary-sm"
          onClick={handleRun}
          disabled={running || disabled || !code.trim()}
        >
          {running ? (lang === "python" ? "Python laedt..." : "Wird ausgefuehrt...") : "Ausfuehren"}
        </button>
        {testResults.length > 0 && (
          <span className={`coding-test-summary ${passedCount === testCases.length ? "all-pass" : ""}`}>
            {passedCount}/{testCases.length} Tests bestanden
          </span>
        )}
      </div>

      <div className="coding-editor">
        <textarea
          value={code}
          onChange={handleCodeChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={`${LANG_LABELS[lang]} Code hier eingeben...`}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />
      </div>

      {/* HTML Preview */}
      {lang === "html" && (
        <div className="coding-html-preview">
          <label>Vorschau:</label>
          <iframe
            ref={iframeRef}
            srcDoc={code}
            sandbox="allow-scripts"
            title="HTML Vorschau"
            className="coding-preview-iframe"
          />
        </div>
      )}

      {/* Output */}
      {output && (
        <div className="coding-output-section">
          <label>Ausgabe:</label>
          <pre className="coding-output">{output}</pre>
        </div>
      )}

      {/* Test Cases */}
      {testCases.length > 0 && lang !== "sql" && (
        <div className="coding-tests">
          <label>Testfaelle:</label>
          <div className="coding-test-list">
            {testCases.map((tc, i) => {
              const result = testResults[i];
              return (
                <div key={i} className={`coding-test-item ${result ? (result.passed ? "pass" : "fail") : ""}`}>
                  <span className="coding-test-status">
                    {result ? (result.passed ? "\u2713" : "\u2717") : "\u25CB"}
                  </span>
                  <div className="coding-test-info">
                    <span className="coding-test-desc">{tc.description || `Test ${i + 1}`}</span>
                    {!hiddenTests && (
                      <span className="coding-test-io">
                        <code>{tc.input}</code> → <code>{tc.expected_output}</code>
                      </span>
                    )}
                    {result && !result.passed && result.actual_output && (
                      <span className="coding-test-actual">
                        Erhalten: <code>{result.actual_output}</code>
                        {result.error && <> (Fehler: {result.error})</>}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SQL expected result hint */}
      {lang === "sql" && testResults.length > 0 && (
        <div className="coding-tests">
          <div className={`coding-test-item ${testResults[0]?.passed ? "pass" : "fail"}`}>
            <span className="coding-test-status">
              {testResults[0]?.passed ? "\u2713" : "\u2717"}
            </span>
            <span className="coding-test-desc">
              {testResults[0]?.passed ? "Query liefert das erwartete Ergebnis" : "Query liefert nicht das erwartete Ergebnis"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
