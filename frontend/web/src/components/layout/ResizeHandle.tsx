import { useCallback, useRef } from "react";

interface ResizeHandleProps {
  onDrag: (deltaX: number) => void;
  onDragEnd?: () => void;
  ariaLabel?: string;
}

export function ResizeHandle({
  onDrag,
  onDragEnd,
  ariaLabel = "Resize panel",
}: ResizeHandleProps) {
  const dragging = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragging.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      document.body.classList.add("is-resizing-panels");
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      onDrag(e.movementX);
    },
    [onDrag],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      dragging.current = false;
      e.currentTarget.releasePointerCapture(e.pointerId);
      document.body.classList.remove("is-resizing-panels");
      onDragEnd?.();
    },
    [onDragEnd],
  );

  return (
    <div
      className="resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );
}
