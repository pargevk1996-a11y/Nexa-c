import { apiFetch, saveSession, clearSession, Session } from "./client";

export async function login(email: string, password: string): Promise<Session> {
  const data = await apiFetch<{ user: Session["user"]; access_token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const session: Session = { user: data.user, accessToken: data.access_token };
  await saveSession(session);
  return session;
}

export async function register(email: string, password: string, username: string): Promise<string> {
  const data = await apiFetch<{ message: string }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, username }),
  });
  return data.message;
}

export async function logout(): Promise<void> {
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } catch {
    /* best-effort */
  }
  await clearSession();
}
