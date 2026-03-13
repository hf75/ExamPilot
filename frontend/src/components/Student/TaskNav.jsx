export default function TaskNav({ tasks, currentIndex, answers, onSelect }) {
  return (
    <div className="task-nav-sidebar">
      <h4>Aufgaben</h4>
      <div className="task-nav-list">
        {tasks.map((task, index) => {
          const isAnswered = !!answers[task.id];
          const isCurrent = index === currentIndex;

          return (
            <button
              key={task.id}
              className={`task-nav-item ${isCurrent ? "active" : ""} ${isAnswered ? "answered" : ""}`}
              onClick={() => onSelect(index)}
            >
              <span className="task-nav-number">{index + 1}</span>
              <span className="task-nav-title">{task.title}</span>
              {isAnswered && <span className="task-nav-check">&#10003;</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
