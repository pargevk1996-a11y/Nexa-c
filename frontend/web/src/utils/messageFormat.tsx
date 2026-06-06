import type { ReactNode } from "react";

const URL_RE = /https?:\/\/[^\s<]+[^\s<.,;:!?)\]}'"]/gi;

type Segment =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "code"; value: string }
  | { type: "spoiler"; value: string }
  | { type: "url"; value: string }
  | { type: "mention"; value: string }
  | { type: "hashtag"; value: string };

function splitInline(text: string): Segment[] {
  const parts: Segment[] = [];
  const pattern =
    /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\|\|[^|]+\|\||https?:\/\/[^\s<]+[^\s<.,;:!?)\]}'"]|@[a-zA-Z0-9_]{2,32}|#[a-zA-Z0-9_]{2,48})/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(pattern.source, "gi");
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", value: text.slice(last, m.index) });
    const raw = m[0];
    if (raw.startsWith("**") && raw.endsWith("**")) {
      parts.push({ type: "bold", value: raw.slice(2, -2) });
    } else if (raw.startsWith("*") && raw.endsWith("*")) {
      parts.push({ type: "italic", value: raw.slice(1, -1) });
    } else if (raw.startsWith("`") && raw.endsWith("`")) {
      parts.push({ type: "code", value: raw.slice(1, -1) });
    } else if (raw.startsWith("||") && raw.endsWith("||")) {
      parts.push({ type: "spoiler", value: raw.slice(2, -2) });
    } else if (/^https?:\/\//i.test(raw)) {
      parts.push({ type: "url", value: raw });
    } else if (raw.startsWith("@")) {
      parts.push({ type: "mention", value: raw.slice(1) });
    } else if (raw.startsWith("#")) {
      parts.push({ type: "hashtag", value: raw.slice(1) });
    } else {
      parts.push({ type: "text", value: raw });
    }
    last = m.index + raw.length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts.length ? parts : [{ type: "text", value: text }];
}

function renderSegments(segments: Segment[], keyPrefix: string): ReactNode[] {
  return segments.flatMap((seg, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (seg.type) {
      case "bold":
        return <strong key={key}>{renderSegments(splitInline(seg.value), `${key}-b`)}</strong>;
      case "italic":
        return <em key={key}>{renderSegments(splitInline(seg.value), `${key}-i`)}</em>;
      case "code":
        return (
          <code key={key} className="formatted-msg__code">
            {seg.value}
          </code>
        );
      case "spoiler":
        return (
          <span key={key} className="formatted-msg__spoiler" tabIndex={0} role="button">
            {seg.value}
          </span>
        );
      case "url":
        return (
          <a key={key} href={seg.value} className="formatted-msg__link" target="_blank" rel="noopener noreferrer">
            {seg.value}
          </a>
        );
      case "mention":
        return (
          <span key={key} className="formatted-msg__mention">
            @{seg.value}
          </span>
        );
      case "hashtag":
        return (
          <span key={key} className="formatted-msg__hashtag">
            #{seg.value}
          </span>
        );
      default:
        return seg.value ? <span key={key}>{seg.value}</span> : [];
    }
  });
}

function formatPlainBlock(block: string, keyPrefix: string): ReactNode[] {
  const lines = block.split("\n");
  const nodes: ReactNode[] = [];
  let quoteBlock: string[] = [];

  function flushQuote() {
    if (quoteBlock.length === 0) return;
    nodes.push(
      <blockquote key={`${keyPrefix}-q-${nodes.length}`} className="formatted-msg__quote">
        {quoteBlock.map((line, li) => (
          <span key={li}>
            {li > 0 ? <br /> : null}
            {renderSegments(splitInline(line), `${keyPrefix}-ql-${li}`)}
          </span>
        ))}
      </blockquote>,
    );
    quoteBlock = [];
  }

  lines.forEach((line, idx) => {
    const trimmed = line.trimStart();
    if (trimmed.startsWith(">")) {
      quoteBlock.push(trimmed.replace(/^>\s?/, ""));
      return;
    }
    flushQuote();
    if (idx > 0 && nodes.length > 0) nodes.push(<br key={`${keyPrefix}-br-${idx}`} />);
    nodes.push(...renderSegments(splitInline(line), `${keyPrefix}-l-${idx}`));
  });
  flushQuote();
  return nodes.length ? nodes : renderSegments(splitInline(block), `${keyPrefix}-root`);
}

const FENCE_RE = /```[\w-]*\n?([\s\S]*?)```/g;

export function formatMessageText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(FENCE_RE.source, "g");
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(...formatPlainBlock(text.slice(last, match.index), `pre-${last}`));
    }
    const code = match[1]?.replace(/\n$/, "") ?? "";
    nodes.push(
      <pre key={`fence-${match.index}`} className="formatted-msg__pre">
        <code>{code}</code>
      </pre>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    nodes.push(...formatPlainBlock(text.slice(last), `tail-${last}`));
  }
  return nodes.length ? nodes : formatPlainBlock(text, "only");
}

export function extractFirstUrl(text: string): string | undefined {
  URL_RE.lastIndex = 0;
  const m = URL_RE.exec(text);
  return m?.[0];
}

export function messageMatchesKeyword(text: string, keyword: string): boolean {
  const q = keyword.trim().toLowerCase();
  if (!q) return true;
  return text.toLowerCase().includes(q);
}
