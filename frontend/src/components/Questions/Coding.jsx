import { useState, useEffect, useRef, useCallback } from "react";

const LANG_LABELS = {
  javascript: "JavaScript",
  python: "Python",
  sql: "SQL",
  html: "HTML/CSS",
  typescript: "TypeScript",
  blockly: "Blockly (visuell)",
};

// Lazy-load Blockly from CDN
let blocklyPromise = null;
function getBlockly() {
  if (!blocklyPromise) {
    blocklyPromise = new Promise((resolve, reject) => {
      if (window.Blockly) { resolve(window.Blockly); return; }
      const script = document.createElement("script");
      script.src = "https://unpkg.com/blockly/blockly_compressed.js";
      script.onload = () => {
        // Load German locale + JS generator
        const msgs = document.createElement("script");
        msgs.src = "https://unpkg.com/blockly/msg/de.js";
        msgs.onload = () => {
          const gen = document.createElement("script");
          gen.src = "https://unpkg.com/blockly/javascript_compressed.js";
          gen.onload = () => resolve(window.Blockly);
          gen.onerror = reject;
          document.head.appendChild(gen);
        };
        msgs.onerror = reject;
        document.head.appendChild(msgs);
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  return blocklyPromise;
}

export default function Coding({ task, questionData, answer, onChange, disabled }) {
  const lang = questionData.language || "javascript";
  const [code, setCode] = useState(questionData.starter_code || "");
  const [output, setOutput] = useState("");
  const [testResults, setTestResults] = useState([]);
  const [running, setRunning] = useState(false);
  const [runtimeReady, setRuntimeReady] = useState(lang === "javascript" || lang === "html");
  const [blocklyReady, setBlocklyReady] = useState(false);
  const [blocksXml, setBlocksXml] = useState("");
  const iframeRef = useRef(null);
  const timeoutRef = useRef(null);
  const blocklyDivRef = useRef(null);
  const workspaceRef = useRef(null);

  // Restore code from saved answer
  useEffect(() => {
    if (answer) {
      try {
        const parsed = JSON.parse(answer);
        if (parsed.code) setCode(parsed.code);
        if (parsed.test_results) setTestResults(parsed.test_results);
        if (parsed.blocks_xml) setBlocksXml(parsed.blocks_xml);
      } catch {
        // not JSON, ignore
      }
    }
  }, []);

  // For Python/SQL/TS: check if runtime loads (they always load in-iframe)
  useEffect(() => {
    if (lang !== "javascript" && lang !== "html" && lang !== "blockly") {
      setRuntimeReady(true); // Runtime loads inside iframe on demand
    }
  }, [lang]);

  // Initialize Blockly workspace
  useEffect(() => {
    if (lang !== "blockly" || !blocklyDivRef.current) return;
    let ws = null;
    getBlockly().then((Blockly) => {
      if (!blocklyDivRef.current) return;
      setBlocklyReady(true);

      const toolbox = {
        kind: "categoryToolbox",
        contents: [
          { kind: "category", name: "Logik", categorystyle: "logic_category", contents: [
            { kind: "block", type: "controls_if" },
            { kind: "block", type: "logic_compare" },
            { kind: "block", type: "logic_operation" },
            { kind: "block", type: "logic_negate" },
            { kind: "block", type: "logic_boolean" },
          ]},
          { kind: "category", name: "Schleifen", categorystyle: "loop_category", contents: [
            { kind: "block", type: "controls_repeat_ext" },
            { kind: "block", type: "controls_whileUntil" },
            { kind: "block", type: "controls_for" },
            { kind: "block", type: "controls_forEach" },
          ]},
          { kind: "category", name: "Mathe", categorystyle: "math_category", contents: [
            { kind: "block", type: "math_number" },
            { kind: "block", type: "math_arithmetic" },
            { kind: "block", type: "math_modulo" },
            { kind: "block", type: "math_round" },
            { kind: "block", type: "math_random_int" },
          ]},
          { kind: "category", name: "Text", categorystyle: "text_category", contents: [
            { kind: "block", type: "text" },
            { kind: "block", type: "text_join" },
            { kind: "block", type: "text_length" },
            { kind: "block", type: "text_print" },
          ]},
          { kind: "category", name: "Listen", categorystyle: "list_category", contents: [
            { kind: "block", type: "lists_create_empty" },
            { kind: "block", type: "lists_create_with" },
            { kind: "block", type: "lists_length" },
            { kind: "block", type: "lists_getIndex" },
            { kind: "block", type: "lists_setIndex" },
          ]},
          { kind: "category", name: "Variablen", categorystyle: "variable_category", custom: "VARIABLE" },
          { kind: "category", name: "Funktionen", categorystyle: "procedure_category", custom: "PROCEDURE" },
        ],
      };

      ws = Blockly.inject(blocklyDivRef.current, {
        toolbox,
        grid: { spacing: 20, length: 3, colour: "#ccc", snap: true },
        zoom: { controls: true, wheel: true, startScale: 1.0, maxScale: 2, minScale: 0.5 },
        trashcan: true,
      });
      workspaceRef.current = ws;

      // Restore saved blocks
      if (blocksXml) {
        try {
          const dom = Blockly.utils.xml.textToDom(blocksXml);
          Blockly.Xml.domToWorkspace(dom, ws);
        } catch { /* ignore restore errors */ }
      }

      // On workspace change: generate code and save
      ws.addChangeListener(() => {
        if (!workspaceRef.current) return;
        try {
          const generatedCode = Blockly.JavaScript.workspaceToCode(ws);
          setCode(generatedCode);
          const dom = Blockly.Xml.workspaceToDom(ws);
          const xml = Blockly.Xml.domToText(dom);
          setBlocksXml(xml);
        } catch { /* ignore */ }
      });
    });

    return () => {
      if (ws) { ws.dispose(); workspaceRef.current = null; }
    };
  }, [lang, blocklyDivRef.current]);

  const saveAnswer = useCallback((newCode, newResults, xml) => {
    const payload = { code: newCode, test_results: newResults };
    if (xml || lang === "blockly") payload.blocks_xml = xml || blocksXml;
    onChange(JSON.stringify(payload));
  }, [onChange, lang, blocksXml]);

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
    } else if (lang === "blockly") {
      runInSandbox("javascript"); // Blockly generates JS
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
    // Create sandboxed iframe
    const iframe = document.createElement("iframe");
    iframe.sandbox = "allow-scripts";
    iframe.style.display = "none";

    let cleaned = false;
    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      window.removeEventListener("message", handler);
      clearTimeout(timeoutRef.current);
      try { document.body.removeChild(iframe); } catch {}
    }

    // Listen for results
    function handler(event) {
      if (event.data?.type === "coding-result") {
        cleanup();
        setOutput(event.data.output || "");
        setTestResults(event.data.testResults || []);
        setRunning(false);
        saveAnswer(code, event.data.testResults || [], blocksXml);
      }
    }
    window.addEventListener("message", handler);

    // Timeout after 15s
    timeoutRef.current = setTimeout(() => {
      cleanup();
      setOutput("Zeitueberschreitung: Code hat zu lange gebraucht (>15s).");
      setRunning(false);
    }, 15000);

    iframe.srcdoc = html;
    document.body.appendChild(iframe);
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

      {/* Blockly Editor */}
      {lang === "blockly" ? (
        <div className="coding-blockly-wrap">
          <div ref={blocklyDivRef} className="coding-blockly-editor" />
          {code && (
            <details className="coding-generated-code">
              <summary>Generierter JavaScript-Code</summary>
              <pre className="coding-output">{code}</pre>
            </details>
          )}
          {!blocklyReady && (
            <div className="coding-loading">Blockly wird geladen...</div>
          )}
        </div>
      ) : (
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
      )}

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
