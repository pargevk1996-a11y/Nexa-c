import { formatMessageText } from "@/utils/messageFormat";

interface FormattedMessageTextProps {
  text: string;
  className?: string;
}

export function FormattedMessageText({ text, className }: FormattedMessageTextProps) {
  return <div className={className ?? "formatted-msg"}>{formatMessageText(text)}</div>;
}
