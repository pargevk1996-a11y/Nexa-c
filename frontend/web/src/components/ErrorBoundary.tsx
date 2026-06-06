import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI error:", error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100dvh",
            display: "grid",
            placeItems: "center",
            padding: "2rem",
            background: "#0c0a14",
            color: "#f8f7fc",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div style={{ maxWidth: 480, textAlign: "center" }}>
            <h1 style={{ fontSize: "1.25rem" }}>Something went wrong</h1>
            <p style={{ opacity: 0.8, fontSize: "0.9rem" }}>{this.state.error.message}</p>
            <button
              type="button"
              style={{
                marginTop: "1rem",
                padding: "0.6rem 1.2rem",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                background: "#8b5cf6",
                color: "#fff",
              }}
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
