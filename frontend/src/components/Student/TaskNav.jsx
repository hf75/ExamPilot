export default function TaskNav({ tasks, currentIndex, answers, gradingTasks, onSelect }) {
  const grading = gradingTasks || new Set();
  return (
    <div className="task-nav-sidebar">
      <h4>Aufgaben</h4>
      <div className="task-nav-list">
        {tasks.map((task, index) => {
          const isAnswered = !!answers[task.id];
          const isGrading = grading.has(task.id);
          const isCurrent = index === currentIndex;

          return (
            <button
              key={task.id}
              className={`task-nav-item ${isCurrent ? "active" : ""} ${isAnswered ? "answered" : ""} ${isGrading ? "grading" : ""}`}
              onClick={() => onSelect(index)}
            >
              <span className="task-nav-number">{index + 1}</span>
              <span className="task-nav-title">{task.title}</span>
              {isGrading ? (
                <span className="task-nav-grading" title="Wird bewertet...">&#9697;</span>
              ) : isAnswered ? (
                <span className="task-nav-check">&#10003;</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
