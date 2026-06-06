import { useState } from "react";
import type { Message, PollData, QuizData } from "@/types";

interface PollMessageProps {
  message: Message;
  isSecret?: boolean;
}

function PollBody({
  data,
  isQuiz,
  outgoing,
}: {
  data: PollData | QuizData;
  isQuiz: boolean;
  outgoing: boolean;
}) {
  const [voted, setVoted] = useState<string[]>(data.votedOptionIds ?? []);
  const [revealed, setRevealed] = useState(false);
  const totalVotes = data.options.reduce((s, o) => s + o.votes, 0) + voted.length;
  const closed = data.closed;

  function toggleOption(id: string) {
    if (closed) return;
    if (data.multiple) {
      setVoted((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      );
    } else {
      setVoted([id]);
    }
  }

  const quiz = isQuiz ? (data as QuizData) : null;

  return (
    <div className={`poll-msg ${outgoing ? "poll-msg--out" : ""}`}>
      <p className="poll-msg__question">{data.question}</p>
      <ul className="poll-msg__options" role="list">
        {data.options.map((opt) => {
          const selected = voted.includes(opt.id);
          const pct =
            totalVotes > 0
              ? Math.round(((opt.votes + (selected ? 1 : 0)) / (totalVotes + (selected && !data.votedOptionIds?.includes(opt.id) ? 1 : 0))) * 100)
              : 0;
          const isCorrect = quiz && revealed && opt.id === quiz.correctOptionId;
          const isWrong =
            quiz && revealed && selected && opt.id !== quiz.correctOptionId;
          return (
            <li key={opt.id}>
              <button
                type="button"
                className={`poll-msg__option ${selected ? "poll-msg__option--selected" : ""} ${isCorrect ? "poll-msg__option--correct" : ""} ${isWrong ? "poll-msg__option--wrong" : ""}`}
                disabled={closed}
                onClick={() => toggleOption(opt.id)}
              >
                <span className="poll-msg__option-text">{opt.text}</span>
                {(voted.length > 0 || closed) && (
                  <span className="poll-msg__option-bar" style={{ width: `${pct}%` }} aria-hidden />
                )}
                <span className="poll-msg__option-votes">{opt.votes + (selected ? 1 : 0)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {isQuiz && voted.length > 0 ? (
        <button type="button" className="poll-msg__reveal" onClick={() => setRevealed(true)}>
          {revealed ? quiz?.explanation ?? "Correct!" : "Show answer"}
        </button>
      ) : null}
      {closed ? <span className="poll-msg__closed">Poll closed</span> : null}
    </div>
  );
}

export function PollMessage({ message, isSecret }: PollMessageProps) {
  if (message.kind === "quiz" && message.quiz) {
    return (
      <div className={`chat-bubble ${isSecret ? "chat-bubble--secret" : ""}`}>
        <span className="poll-msg__type">Quiz</span>
        <PollBody data={message.quiz} isQuiz outgoing={message.outgoing} />
      </div>
    );
  }
  if ((message.kind === "poll" || message.poll) && message.poll) {
    return (
      <div className={`chat-bubble ${isSecret ? "chat-bubble--secret" : ""}`}>
        <PollBody data={message.poll} isQuiz={false} outgoing={message.outgoing} />
      </div>
    );
  }
  return null;
}
