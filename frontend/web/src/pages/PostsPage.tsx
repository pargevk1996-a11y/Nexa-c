import { FormEvent, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { FileAttachButton } from "@/components/ui/FileAttachButton";
import { useSocial } from "@/store/SocialContext";
import { getFileCategory } from "@/utils/files";

export function PostsPage() {
  const { posts, addPost, togglePostLike } = useSocial();
  const [text, setText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const previewUrlRef = useRef<string | null>(null);

  function clearPendingFile() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPendingFile(null);
  }

  function onPickFiles(files: FileList) {
    const file = files[0];
    if (!file) return;
    clearPendingFile();
    previewUrlRef.current = URL.createObjectURL(file);
    setPendingFile(file);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting || (!text.trim() && !pendingFile)) return;
    setSubmitting(true);
    try {
      await addPost(text, pendingFile ?? undefined);
      setText("");
      clearPendingFile();
    } finally {
      setSubmitting(false);
    }
  }

  const previewUrl = pendingFile ? previewUrlRef.current : null;
  const previewCategory = pendingFile
    ? getFileCategory(pendingFile.type)
    : null;

  return (
    <div className="page-shell">
    <div className="section-page section-page--posts posts-page page-shell__inner">
      <header className="section-page__header">
        <h1>Posts</h1>
        <p>Updates from your contacts — private by default</p>
      </header>

      <form className="post-composer" onSubmit={handleSubmit}>
        <textarea
          className="field__input post-composer__input"
          rows={3}
          placeholder="What's on your mind?"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {pendingFile && previewUrl ? (
          <div className="post-composer__preview">
            {previewCategory === "image" ? (
              <img src={previewUrl} alt="" />
            ) : previewCategory === "video" ? (
              <video src={previewUrl} controls playsInline />
            ) : (
              <span className="post-composer__file-name">{pendingFile.name}</span>
            )}
            <button type="button" className="post-composer__remove" onClick={clearPendingFile}>
              Remove attachment
            </button>
          </div>
        ) : null}
        <div className="post-composer__actions">
          <FileAttachButton
            label="Attach file to post"
            disabled={submitting}
            onFiles={onPickFiles}
            className="btn btn--ghost"
          >
            📎 Attach file
          </FileAttachButton>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={submitting || (!text.trim() && !pendingFile)}
          >
            {submitting ? "Posting…" : "Post"}
          </button>
        </div>
      </form>

      <div className="posts-feed">
        {posts.map((post) => (
          <article key={post.id} className="post-card">
            <header className="post-card__head">
              <Avatar name={post.author} size="md" />
              <div>
                <strong>{post.author}</strong>
                <span className="post-card__meta">
                  {post.uid} · {post.time}
                </span>
              </div>
            </header>
            {post.text ? <p className="post-card__text">{post.text}</p> : null}
            {post.mediaUrl ? (
              <div className="post-card__media">
                {post.mediaMimeType?.startsWith("image/") ? (
                  <img src={post.mediaUrl} alt={post.fileName ?? "Post attachment"} />
                ) : post.mediaMimeType?.startsWith("video/") ? (
                  <video src={post.mediaUrl} controls playsInline />
                ) : (
                  <a href={post.mediaUrl} download={post.fileName} target="_blank" rel="noopener noreferrer">
                    📎 {post.fileName ?? "Download file"}
                  </a>
                )}
              </div>
            ) : null}
            <footer className="post-card__foot">
              <button
                type="button"
                className={`post-card__action ${post.likedByMe ? "post-card__action--active" : ""}`}
                onClick={() => togglePostLike(post.id)}
              >
                ♥ {post.likes}
              </button>
              <button type="button" className="post-card__action">
                💬 {post.comments}
              </button>
            </footer>
          </article>
        ))}
      </div>
    </div>
    </div>
  );
}
