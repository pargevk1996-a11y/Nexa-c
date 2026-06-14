import { memo } from "react";
import { formatMessageText } from "@/utils/messageFormat";

interface FormattedMessageTextProps {
  text: string;
  className?: string;
}

// memo: text parsing (formatMessageText) is pure in `text`, so re-rendering the
// message list never re-parses an unchanged bubble's text.
export const FormattedMessageText = memo(function FormattedMessageText({
  text,
  className,
}: FormattedMessageTextProps) {
  return <div className={className ?? "formatted-msg"}>{formatMessageText(text)}</div>;
});
