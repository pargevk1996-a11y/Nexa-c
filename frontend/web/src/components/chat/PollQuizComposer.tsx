import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { IconX } from "@/components/icons/Icons";
import type { PollData, QuizData } from "@/types";

export type PollQuizDraft =
  | { kind: "poll"; data: PollData }
  | { kind: "quiz"; data: QuizData };

interface PollQuizComposerProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (draft: PollQuizDraft) => void;
}

function parseOptions(raw: string): { id: string; text: string; votes: number }[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((text, i) => ({ id: `opt-${i}`, text, votes: 0 }));
}

export function PollQuizComposer({ open, onClose, onSubmit }: PollQuizComposerProps) {
  const [mode, setMode] = useState<"poll" | "quiz">("poll");
  const [question, setQuestion] = useState("");
  const [optionsRaw, setOptionsRaw] = useState("Option A\nOption B\nOption C");
  const [correctIndex, setCorrectIndex] = useState(0);
  const [explanation, setExplanation] = useState("");

  if (!open) return null;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    const options = parseOptions(optionsRaw);
    if (!q || options.length < 2) return;
    if (mode === "poll") {
      onSubmit({
        kind: "poll",
        data: { question: q, options, multiple: false },
      });
    } else {
      const correct = options[correctIndex] ?? options[0];
      onSubmit({
        kind: "quiz",
        data: {
          question: q,
          options,
          correctOptionId: correct.id,
          explanation: explanation.trim() || undefined,
        },
      });
    }
    setQuestion("");
    setOptionsRaw("Option A\nOption B\nOption C");
    setCorrectIndex(0);
    setExplanation("");
    onClose();
  }

  const options = parseOptions(optionsRaw);

  return (
    <div className="poll-quiz-composer" role="dialog" aria-label={mode === "poll" ? "Create poll" : "Create quiz"}>
      <header className="poll-quiz-composer__head">
        <div className="poll-quiz-composer__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "poll"}
            className={mode === "poll" ? "poll-quiz-composer__tab--active" : ""}
            onClick={() => setMode("poll")}
          >
            Poll
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "quiz"}
            className={mode === "quiz" ? "poll-quiz-composer__tab--active" : ""}
            onClick={() => setMode("quiz")}
          >
            Quiz
          </button>
        </div>
        <button type="button" className="poll-quiz-composer__close" onClick={onClose} aria-label="Close">
          <IconX size={18} />
        </button>
      </header>
      <form className="poll-quiz-composer__form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field__label">Question</span>
          <input
            className="field__input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={mode === "poll" ? "Ask the group…" : "Quiz question…"}
            required
          />
        </label>
        <label className="field">
          <span className="field__label">Options (one per line)</span>
          <textarea
            className="field__input"
            rows={4}
            value={optionsRaw}
            onChange={(e) => setOptionsRaw(e.target.value)}
            required
          />
        </label>
        {mode === "quiz" && options.length > 0 ? (
          <label className="field">
            <span className="field__label">Correct answer</span>
            <select
              className="field__input"
              value={correctIndex}
              onChange={(e) => setCorrectIndex(Number(e.target.value))}
            >
              {options.map((opt, i) => (
                <option key={opt.id} value={i}>
                  {opt.text}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {mode === "quiz" ? (
          <label className="field">
            <span className="field__label">Explanation (optional)</span>
            <input
              className="field__input"
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Shown after answering"
            />
          </label>
        ) : null}
        <Button type="submit" disabled={!question.trim() || options.length < 2}>
          Send {mode === "poll" ? "poll" : "quiz"}
        </Button>
      </form>
    </div>
  );
}
