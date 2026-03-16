export default function DuelScoreboard({ rankings, round, totalRounds }) {
  const maxScore = rankings.length > 0 ? Math.max(rankings[0]?.score || 1, 1) : 1;
  const isLastRound = round >= totalRounds;

  return (
    <div className="duel-scoreboard">
      <h2 className="duel-scoreboard-title">
        Runde {round} / {totalRounds}
      </h2>

      <div className="duel-ranking-list">
        {rankings.map((p, i) => (
          <div
            key={p.id}
            className={`duel-ranking-row ${!p.alive ? "eliminated" : ""}`}
            style={{ animationDelay: `${i * 0.1}s` }}
          >
            <span className="duel-rank">
              {i === 0 ? "\u{1F947}" : i === 1 ? "\u{1F948}" : i === 2 ? "\u{1F949}" : `${i + 1}.`}
            </span>
            <span className="duel-rank-name">{p.name}</span>
            {p.streak >= 2 && (
              <span className="duel-streak-badge" title={`${p.streak}er Streak`}>
                {p.streak}x
              </span>
            )}
            <div className="duel-score-bar-container">
              <div
                className="duel-score-bar"
                style={{ width: `${(p.score / maxScore) * 100}%` }}
              />
            </div>
            <span className="duel-rank-score">{p.score}</span>
            {!p.alive && <span className="duel-eliminated-tag">OUT</span>}
          </div>
        ))}
      </div>

      {!isLastRound && (
        <div className="duel-auto-advance-hint">Nächste Frage kommt gleich...</div>
      )}
    </div>
  );
}
