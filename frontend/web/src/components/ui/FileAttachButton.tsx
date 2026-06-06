import { useRef, type ReactNode } from "react";
import { FILE_INPUT_ACCEPT } from "@/utils/files";

interface FileAttachButtonProps {
  label: string;
  disabled?: boolean;
  multiple?: boolean;
  accept?: string;
  onFiles: (files: FileList) => void;
  children: ReactNode;
  className?: string;
}

export function FileAttachButton({
  label,
  disabled,
  multiple,
  accept = FILE_INPUT_ACCEPT,
  onFiles,
  children,
  className = "",
}: FileAttachButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => {
          const list = e.target.files;
          if (list && list.length > 0) onFiles(list);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        className={className}
        disabled={disabled}
        aria-label={label}
        title={label}
        onClick={() => inputRef.current?.click()}
      >
        {children}
      </button>
    </>
  );
}
