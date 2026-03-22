import { useState } from "react";

export default function DuelPairSelection({ players, pairHistory, onSelectPair, onRandomPair, onEndGame, questionsLeft }) {
  const [selected, setSelected] = useState([]);

  function handleClick(playerId) {
    if (selected.includes(playerId)) {
      setSelected(selected.filter((id) => id !== playerId));
    } else if (selected.length < 2) {
      const next = [...selected, playerId];
      if (next.length === 2) {
        onSelectPair(next[0], next[1]);
        setSelected([]);
      } else {
        setSelected(next);
      }
    }
  }

  function handleRandom() {
    setSelected([]);
    onRandomPair();
  }

  // Build per-player stats from history
  const playerStats = {};
  players.forEach((p) => { playerStats[p.id] = { name: p.name, rounds: [], wins: 0, losses: 0 }; });
  pairHistory.forEach((h) => {
    [h.player1, h.player2].forEach((px) => {
      if (playerStats[px.id]) {
        playerStats[px.id].rounds.push({
          correct: px.correct,
          won: h.winner_id === px.id,
          draw: !h.winner_id,
        });
        if (h.winner_id === px.id) playerStats[px.id].wins++;
        else if (h.winner_id) playerStats[px.id].losses++;
      }
    });
  });

  return (
    <div className="duel-pair-selection">
      <h2 className="duel-pair-title">Nächstes Duell</h2>
      <p className="duel-pair-subtitle">
        Wähle zwei Spieler oder klicke auf Zufall.
        {questionsLeft > 0 && <span> ({questionsLeft} {questionsLeft === 1 ? "Frage" : "Fragen"} übrig)</span>}
      </p>

      <div className="duel-pair-grid">
        {players.map((p) => {
          const stats = playerStats[p.id];
          return (
            <button
              key={p.id}
              className={`duel-pair-player ${selected.includes(p.id) ? "selected" : ""}`}
              onClick={() => handleClick(p.id)}
            >
              <span className="duel-pair-player-name">{p.name}</span>
              {stats && stats.rounds.length > 0 && (
                <span className="duel-pair-player-record">
                  {stats.wins}W {stats.losses}L
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="duel-pair-actions">
        <button className="duel-btn duel-btn-random" onClick={handleRandom}>
          Zufall
        </button>
        {onEndGame && (
          <button className="duel-btn duel-btn-end" onClick={onEndGame}>
            Spiel beenden
          </button>
        )}
      </div>

      {pairHistory.length > 0 && (
        <div className="duel-match-tracker">
          <h3>Match-Verlauf</h3>
          <div className="duel-match-timeline">
            {pairHistory.map((h, i) => {
              const p1Won = h.winner_id === h.player1.id;
              const p2Won = h.winner_id === h.player2.id;
              return (
                <div key={i} className="duel-match-card match-enter">
                  <div className="duel-match-round">Runde {i + 1}</div>
                  <div className="duel-match-players">
                    <div className={`duel-match-p ${p1Won ? "won" : h.player1.correct ? "correct" : "wrong"}`}>
                      <span className="duel-match-name">{h.player1.name}</span>
                      <span className={`duel-match-dot ${h.player1.correct ? "green" : "red"}`} />
                      {p1Won && <span className="duel-match-crown">&#9733;</span>}
                    </div>
                    <div className="duel-match-vs">VS</div>
                    <div className={`duel-match-p ${p2Won ? "won" : h.player2.correct ? "correct" : "wrong"}`}>
                      {p2Won && <span className="duel-match-crown">&#9733;</span>}
                      <span className={`duel-match-dot ${h.player2.correct ? "green" : "red"}`} />
                      <span className="duel-match-name">{h.player2.name}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Per-player timeline */}
          <div className="duel-player-timelines">
            {players.map((p) => {
              const stats = playerStats[p.id];
              if (!stats || stats.rounds.length === 0) return null;
              return (
                <div key={p.id} className="duel-player-timeline">
                  <span className="duel-timeline-name">{p.name}</span>
                  <div className="duel-timeline-dots">
                    {stats.rounds.map((r, i) => (
                      <div
                        key={i}
                        className={`duel-timeline-dot ${r.correct ? "green" : "red"} ${r.won ? "star" : ""} dot-pop`}
                        title={`Runde ${i + 1}: ${r.correct ? "Richtig" : "Falsch"}${r.won ? " (Gewonnen)" : ""}`}
                        style={{ animationDelay: `${i * 0.1}s` }}
                      />
                    ))}
                  </div>
                  <span className="duel-timeline-score">
                    {stats.wins}/{stats.rounds.length}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
