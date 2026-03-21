export default function TaskNav({ tasks, currentIndex, answers, flagged, onSelect, onToggleFlag }) {
  return (
    <div className="task-nav-sidebar">
      <h4>Aufgaben</h4>
      <div className="task-nav-list">
        {tasks.map((task, index) => {
          const isAnswered = !!answers[task.id];
          const isCurrent = index === currentIndex;
          const isFlagged = flagged?.has(task.id);

          return (
            <button
              key={task.id}
              className={`task-nav-item ${isCurrent ? "active" : ""} ${isAnswered ? "answered" : ""} ${isFlagged ? "flagged" : ""}`}
              onClick={() => onSelect(index)}
            >
              <span className="task-nav-number">{index + 1}</span>
              <span className="task-nav-title">{task.title}</span>
              <span className="task-nav-icons">
                {isFlagged && <span className="task-nav-flag" title="Markiert">&#9873;</span>}
                {isAnswered && <span className="task-nav-check">&#10003;</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
