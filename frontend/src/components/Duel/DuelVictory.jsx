import { useEffect, useRef } from "react";

export default function DuelVictory({ rankings, winner, mode }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = [];
    const colors = ["#ff0", "#0ff", "#f0f", "#0f0", "#f44", "#44f"];
    for (let i = 0; i < 150; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        vx: (Math.random() - 0.5) * 4,
        vy: Math.random() * 3 + 2,
        size: Math.random() * 6 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 10,
      });
    }

    let raf;
    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotSpeed;
        if (p.y > canvas.height) {
          p.y = -10;
          p.x = Math.random() * canvas.width;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      raf = requestAnimationFrame(animate);
    }
    animate();
    return () => cancelAnimationFrame(raf);
  }, []);

  const podium = rankings.slice(0, 3);

  return (
    <div className="duel-victory">
      <canvas ref={canvasRef} className="duel-confetti-canvas" />

      <div className="duel-victory-content">
        <h1 className="duel-victory-title">
          {mode === "royale" ? "Battle Royale" : "Duell"} beendet!
        </h1>

        {winner && (
          <div className="duel-winner-spotlight">
            <div className="duel-winner-crown">👑</div>
            <div className="duel-winner-name">{winner.name}</div>
            <div className="duel-winner-score">{winner.score} Punkte</div>
          </div>
        )}

        <div className="duel-podium">
          {podium.map((p, i) => (
            <div
              key={p.id}
              className={`duel-podium-place duel-podium-${i + 1}`}
            >
              <div className="duel-podium-medal">
                {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
              </div>
              <div className="duel-podium-name">{p.name}</div>
              <div className="duel-podium-score">{p.score}</div>
              <div className="duel-podium-bar" />
            </div>
          ))}
        </div>

        {rankings.length > 3 && (
          <div className="duel-rest-rankings">
            {rankings.slice(3).map((p, i) => (
              <div key={p.id} className="duel-rest-row">
                <span>{i + 4}.</span>
                <span>{p.name}</span>
                <span>{p.score}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
