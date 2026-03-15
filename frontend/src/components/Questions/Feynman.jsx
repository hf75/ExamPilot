import { useState, useRef, useEffect } from "react";
import { api } from "../../api/client";
import Markdown from "../Markdown";

export default function Feynman({ task, questionData, answer, onChange, disabled, sessionId }) {
  const [messages, setMessages] = useState(() => {
    try { return answer ? JSON.parse(answer) : []; }
    catch { return []; }
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);
  const maxTurns = questionData?.max_turns || 10;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Restore from answer on mount
  useEffect(() => {
    if (answer) {
      try {
        const parsed = JSON.parse(answer);
        if (Array.isArray(parsed)) setMessages(parsed);
      } catch { /* ignore */ }
    }
  }, []);

  async function handleSend() {
    if (!input.trim() || loading || disabled) return;

    const studentMsg = { role: "student", content: input.trim() };
    const updatedMessages = [...messages, studentMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const data = await api.post("/api/student/feynman-chat", {
        session_id: sessionId,
        task_id: task.id,
        messages: updatedMessages,
      });

      const aiMsg = { role: "ai", content: data.response };
      const finalMessages = [...updatedMessages, aiMsg];
      setMessages(finalMessages);
      onChange(JSON.stringify(finalMessages));
    } catch (err) {
      onChange(JSON.stringify(updatedMessages));
    } finally {
      setLoading(false);
    }
  }

  const studentMsgCount = messages.filter(m => m.role === "student").length;
  const turnsLeft = maxTurns - studentMsgCount;

  return (
    <div className="feynman-chat">
      <div className="feynman-info">
        <span>{turnsLeft} {turnsLeft === 1 ? "Nachricht" : "Nachrichten"} übrig</span>
      </div>
      <div className="feynman-messages">
        {messages.length === 0 && !disabled && (
          <div className="feynman-empty">
            Erkläre das Konzept deinem Kollegen. Schreibe deine erste Nachricht!
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`feynman-msg feynman-msg-${msg.role}`}>
            <div className="feynman-msg-label">
              {msg.role === "student" ? "Du" : "Kollege"}
            </div>
            <div className="feynman-msg-content"><Markdown>{msg.content}</Markdown></div>
          </div>
        ))}
        {loading && (
          <div className="feynman-msg feynman-msg-ai">
            <div className="feynman-msg-label">Kollege</div>
            <div className="feynman-msg-content feynman-typing">tippt...</div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
      {!disabled && turnsLeft > 0 && (
        <div className="feynman-input-row">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Deine Erklärung..."
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={loading}
          />
          <button
            className="btn-primary-sm"
            onClick={handleSend}
            disabled={loading || !input.trim()}
          >
            Senden
          </button>
        </div>
      )}
      {turnsLeft <= 0 && !disabled && (
        <div className="feynman-done">
          Maximale Nachrichtenanzahl erreicht.
        </div>
      )}
    </div>
  );
}
