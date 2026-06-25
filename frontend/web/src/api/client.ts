import { getCsrfToken } from "@/security/csrf";

const API_BASE = "/api/v1";

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = import("@/api/auth")
      .then((m) => m.refreshAccessToken())
      .then((s) => Boolean(s?.user?.id))
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details: string[] = [],
    public retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retried = false,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  // The access token travels as an httpOnly Secure SameSite=Lax cookie —
  // credentials:"include" below ensures the browser attaches it automatically.
  // No Authorization header is set from JS; the api-gateway reads the cookie
  // and injects Bearer for downstream microservices.
  const csrf = getCsrfToken();
  if (csrf && options.method && options.method !== "GET") {
    headers["X-CSRF-Token"] = csrf;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers,
  });

  if (
    res.status === 401 &&
    !retried &&
    !path.startsWith("/auth/login") &&
    !path.startsWith("/auth/register") &&
    path !== "/auth/refresh"
  ) {
    const refreshed = await tryRefreshSession();
    if (refreshed) return apiFetch<T>(path, options, true);
  }

  if (!res.ok) {
    let code = "REQUEST_FAILED";
    let message = res.statusText;
    try {
      const body = await res.json();
      let details: string[] = [];
      const err = body?.error ?? body?.detail?.error ?? body?.detail;
      let retryAfterSeconds: number | undefined;
      if (typeof err === "object" && err !== null) {
        code = err.code ?? code;
        message = err.message ?? message;
        if (Array.isArray(err.details)) details = err.details;
        if (typeof err.retry_after_seconds === "number") {
          retryAfterSeconds = err.retry_after_seconds;
        }
      }
      // PIN enforcement: signal LockContext to show PIN screen
      if (
        res.status === 403 &&
        (code === "PIN_SETUP_REQUIRED" || code === "PIN_REQUIRED") &&
        !path.startsWith("/auth/pin/")
      ) {
        window.dispatchEvent(new CustomEvent("nexa:pin_blocked", { detail: { code } }));
      }
      throw new ApiError(message, res.status, code, details, retryAfterSeconds);
    } catch (e) {
      if (e instanceof ApiError) throw e;
      /* empty json */
    }
    throw new ApiError(message, res.status, code);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function isBackendUnavailable(err: unknown): boolean {
  // A network-level failure (fetch throws TypeError) or a gateway/upstream error.
  // NOTE: 404 is intentionally NOT treated as "unavailable" — it is a definitive
  // "resource not found", not a transient backend outage, and must not trigger
  // retry/offline handling.
  if (err instanceof TypeError) return true;
  if (err instanceof ApiError) {
    return err.status === 502 || err.status === 503 || err.status === 504;
  }
  return false;
}
