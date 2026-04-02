import { useState, useEffect, useRef, useId, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Lazy-load mermaid from CDN
let mermaidPromise = null;
function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = new Promise((resolve, reject) => {
      if (window.mermaid) {
        resolve(window.mermaid);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";
      script.onload = () => {
        window.mermaid.initialize({ startOnLoad: false, theme: "default", securityLevel: "loose" });
        resolve(window.mermaid);
      };
      script.onerror = reject;
      document.head.appendChild(script);
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
        urlTransform={(url) => url}
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
        <div className="image-lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" />
        </div>
      )}
    </div>
  );
}
