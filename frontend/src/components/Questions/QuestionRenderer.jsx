import MultiChoice from "./MultiChoice";
import TrueFalse from "./TrueFalse";
import ShortAnswer from "./ShortAnswer";
import Numerical from "./Numerical";
import Matching from "./Matching";
import Essay from "./Essay";
import Cloze from "./Cloze";
import Ordering from "./Ordering";
import Description from "./Description";

const COMPONENTS = {
  multichoice: MultiChoice,
  truefalse: TrueFalse,
  shortanswer: ShortAnswer,
  numerical: Numerical,
  matching: Matching,
  essay: Essay,
  cloze: Cloze,
  ordering: Ordering,
  description: Description,
};

export default function QuestionRenderer({ task, answer, onChange, disabled }) {
  const Component = COMPONENTS[task.task_type] || Essay;

  return (
    <div className="question-renderer">
      <Component
        task={task}
        questionData={task.question_data || {}}
        answer={answer}
        onChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}
