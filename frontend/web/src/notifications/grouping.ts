export interface GroupBuffer {
  conversationId: string;
  title: string;
  bodies: string[];
  silent: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

const GROUP_DELAY_MS = 2200;
const buffers = new Map<string, GroupBuffer>();

export function enqueueGroupedNotification(
  conversationId: string,
  opts: { title: string; body: string; silent?: boolean },
  flush: (payload: { title: string; body: string; conversationId: string; silent: boolean; count: number }) => void,
): void {
  let buf = buffers.get(conversationId);
  if (!buf) {
    buf = {
      conversationId,
      title: opts.title,
      bodies: [],
      silent: Boolean(opts.silent),
      timer: null,
    };
    buffers.set(conversationId, buf);
  }
  buf.title = opts.title;
  buf.bodies.push(opts.body);
  buf.silent = buf.silent && Boolean(opts.silent);

  if (buf.timer) clearTimeout(buf.timer);
  buf.timer = setTimeout(() => {
    const count = buf!.bodies.length;
    const body = buf!.bodies[buf!.bodies.length - 1] ?? "";
    const title = count > 1 ? `${buf!.title} (${count} new)` : buf!.title;
    flush({
      title,
      body,
      conversationId,
      silent: buf!.silent,
      count,
    });
    buffers.delete(conversationId);
  }, GROUP_DELAY_MS);
}

export function clearGroupedNotifications(): void {
  for (const buf of buffers.values()) {
    if (buf.timer) clearTimeout(buf.timer);
  }
  buffers.clear();
}
