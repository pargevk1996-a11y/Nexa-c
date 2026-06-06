import type { LinkPreview as LinkPreviewData } from "@/types";

interface LinkPreviewProps {
  preview: LinkPreviewData;
}

export function LinkPreview({ preview }: LinkPreviewProps) {
  return (
    <a
      className="link-preview"
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {preview.imageUrl ? (
        <img className="link-preview__img" src={preview.imageUrl} alt="" loading="lazy" />
      ) : null}
      <div className="link-preview__body">
        {preview.siteName ? <span className="link-preview__site">{preview.siteName}</span> : null}
        {preview.title ? <span className="link-preview__title">{preview.title}</span> : null}
        {preview.description ? (
          <span className="link-preview__desc">{preview.description}</span>
        ) : null}
        <span className="link-preview__url">{preview.url}</span>
      </div>
    </a>
  );
}
