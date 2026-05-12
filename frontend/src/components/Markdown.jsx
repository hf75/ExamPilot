import { useState, useEffect, useRef, useId, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
const RELATIVE_URL_PATTERN = /^(#|\/(?!\/)|\.{1,2}\/|[^:/?#]+(?:[/?#]|$))/;
const SAFE_IMAGE_DATA_URL_PATTERN = /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=\s]+$/i;

function safeMarkdownUrl(url, key) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (RELATIVE_URL_PATTERN.test(value)) return value;
  if (key === "src" && SAFE_IMAGE_DATA_URL_PATTERN.test(value)) return value;

  try {
    const parsed = new URL(value);
    if (SAFE_PROTOCOLS.has(parsed.protocol)) return value;
  } catch {
    return "";
  }

  return "";
}

let mermaidPromise = null;
function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, theme: "default", securityLevel: "strict" });
      return mermaid;
    });
  }
  return mermaidPromise;
}

function MermaidBlock({ code }) {
  const ref = useRef(null);
  const id = "mermaid-" + useId().replace(/:/g, "");

  useEffect(() => {
    let cancelled = false;
    getMermaid().then(async (mermaid) => {
      if (cancelled || !ref.current) return;
      try {
        const { svg } = await mermaid.render(id, code.trim());
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
        }
      } catch {
        if (!cancelled && ref.current) {
          ref.current.innerHTML = `<pre class="mermaid-error">${code}</pre>`;
        }
      }
    });
    return () => { cancelled = true; };
  }, [code, id]);

  return <div ref={ref} className="mermaid-diagram" />;
}

function ImageLightbox({ src, onClose }) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  function handleWheel(e) {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((s) => Math.min(10, Math.max(0.5, s * delta)));
  }

  function handlePointerDown(e) {
    if (e.button !== 0) return;
    e.stopPropagation();
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
    e.target.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e) {
    if (!dragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setTranslate((t) => ({ x: t.x + dx, y: t.y + dy }));
  }

  function handlePointerUp() {
    dragging.current = false;
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  function resetView() {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }

  return (
    <div className="image-lightbox" onClick={handleBackdropClick} onWheel={handleWheel}>
      <div className="lightbox-controls">
        <button onClick={() => setScale((s) => Math.min(10, s * 1.3))}>+</button>
        <button onClick={() => setScale((s) => Math.max(0.5, s / 1.3))}>-</button>
        <button onClick={resetView}>1:1</button>
        <button onClick={onClose}>&times;</button>
      </div>
      <img
        src={src}
        alt=""
        style={{
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          cursor: dragging.current ? "grabbing" : "grab",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        draggable={false}
      />
    </div>
  );
}

export default function Markdown({ children }) {
  const [lightbox, setLightbox] = useState(null);

  const closeLightbox = useCallback((e) => {
    if (e.key === "Escape") setLightbox(null);
  }, []);

  useEffect(() => {
    if (lightbox) {
      document.addEventListener("keydown", closeLightbox);
      return () => document.removeEventListener("keydown", closeLightbox);
    }
  }, [lightbox, closeLightbox]);

  if (!children) return null;
  return (
    <div className="md-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={safeMarkdownUrl}
        components={{
          code({ className, children: codeChildren, ...props }) {
            const match = /language-mermaid/.test(className || "");
            if (match) {
              return <MermaidBlock code={String(codeChildren).replace(/\n$/, "")} />;
            }
            return <code className={className} {...props}>{codeChildren}</code>;
          },
          img({ src, alt, ...props }) {
            return (
              <img
                src={src}
                alt={alt || ""}
                className="md-embedded-image"
                loading="lazy"
                onDoubleClick={() => setLightbox(src)}
                title="Doppelklick zum Vergrößern"
                {...props}
              />
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>

      {lightbox && (
        <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}
