import { useCallback, useRef, useState, type ReactNode } from "react";

interface ChatDropZoneProps {
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  children: ReactNode;
}

export function ChatDropZone({ disabled, onFiles, children }: ChatDropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const depthRef = useRef(0);

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list?.length || disabled) return;
      onFiles(Array.from(list));
    },
    [disabled, onFiles],
  );

  return (
    <div
      className={`chat-drop-zone ${dragOver ? "chat-drop-zone--active" : ""}`}
      onDragEnter={(e) => {
        if (disabled) return;
        e.preventDefault();
        depthRef.current += 1;
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        depthRef.current = Math.max(0, depthRef.current - 1);
        if (depthRef.current === 0) setDragOver(false);
      }}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        e.preventDefault();
        depthRef.current = 0;
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      {children}
      {dragOver && !disabled ? (
        <div className="chat-drop-zone__overlay" role="status">
          <span>Drop files to send</span>
        </div>
      ) : null}
    </div>
  );
}
