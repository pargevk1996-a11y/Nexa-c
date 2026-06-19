import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.5rem",
        background: "var(--bg, #050508)",
        color: "var(--text, #f4f4f8)",
        fontFamily: "var(--font)",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      <p style={{ fontSize: "5rem", lineHeight: 1, margin: 0, opacity: 0.25 }}>404</p>
      <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 600 }}>Page not found</h1>
      <p style={{ margin: 0, color: "var(--text-muted, #888)", maxWidth: "30ch" }}>
        The link you followed may be broken or the page may have been removed.
      </p>
      <Link
        to="/"
        style={{
          display: "inline-block",
          marginTop: "0.5rem",
          padding: "0.75rem 2rem",
          borderRadius: "12px",
          background: "linear-gradient(135deg, #4f7cff 0%, #3b6dff 50%, #6a5cff 100%)",
          color: "#fff",
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Go home
      </Link>
    </div>
  );
}
