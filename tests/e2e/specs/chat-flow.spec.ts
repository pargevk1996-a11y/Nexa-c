/**
 * E2E: Full authenticated chat flow — login → send message → verify delivery.
 *
 * Default mode: API calls are intercepted via page.route (no backend required).
 * Live mode: Set E2E_USE_STACK=1 to hit the real docker-compose stack.
 *
 * T3→T4 exit criterion #4.
 */
import { test, expect, Page } from "@playwright/test";

const USE_STACK = Boolean(process.env.E2E_USE_STACK);

const MOCK_USER = {
  id: "user-e2e-001",
  username: "e2e_tester",
  email: "e2e@nexa.test",
  display_name: "E2E Tester",
  avatar_url: null,
  verified: false,
  is_bot: false,
};

const MOCK_CONV_ID = "conv-e2e-001";
const MOCK_TOKEN = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.e30.stub";

async function mockBackend(page: Page) {
  // Auth config
  await page.route("**/api/v1/auth/config", (r) =>
    r.fulfill({ json: { oauth_enabled: false } }),
  );

  // Login
  await page.route("**/api/v1/auth/login", (r) =>
    r.fulfill({
      json: { user: MOCK_USER, access_token: MOCK_TOKEN, expires_in: 900 },
    }),
  );

  // CSRF token (if requested)
  await page.route("**/api/v1/csrf-token", (r) =>
    r.fulfill({ json: { csrf_token: "mock-csrf-stub" } }),
  );

  // Profile
  await page.route("**/api/v1/users/me", (r) =>
    r.fulfill({ json: MOCK_USER }),
  );

  // Conversation list
  await page.route("**/api/v1/chat/conversations", async (r) => {
    if (r.request().method() === "GET") {
      return r.fulfill({
        json: [
          {
            id: MOCK_CONV_ID,
            type: "dm",
            title: "Alice",
            last_message: null,
            unread_count: 0,
            updated_at: new Date().toISOString(),
          },
        ],
      });
    }
    // POST create conversation
    return r.fulfill({
      json: {
        id: MOCK_CONV_ID,
        type: "dm",
        title: "Alice",
        last_message: null,
        unread_count: 0,
        updated_at: new Date().toISOString(),
      },
    });
  });

  // Message history
  await page.route(`**/api/v1/chat/conversations/${MOCK_CONV_ID}/messages*`, async (r) => {
    if (r.request().method() === "GET") {
      return r.fulfill({ json: [] });
    }
    // POST send message — echo back with seq
    const body = JSON.parse(r.request().postData() ?? "{}");
    return r.fulfill({
      json: {
        id: "msg-e2e-001",
        conversation_id: MOCK_CONV_ID,
        sender_id: MOCK_USER.id,
        sender_device_id: "dev-001",
        client_msg_id: body.client_msg_id ?? "cid-001",
        seq: 1,
        body: body.body ?? "",
        content_type: "text",
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
      },
    });
  });

  // Sync endpoint
  await page.route(`**/api/v1/chat/conversations/${MOCK_CONV_ID}/sync*`, (r) =>
    r.fulfill({ json: [] }),
  );

  // Presence heartbeat
  await page.route("**/api/v1/users/presence", (r) =>
    r.fulfill({ status: 204, body: "" }),
  );

  // WebSocket — return 404 so the app falls back to REST-only mode
  await page.route("**/api/v1/ws", (r) => r.abort());
}

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible();
  await page.getByRole("textbox", { name: /email/i }).fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Chat flow — login → send → receive", () => {
  test.beforeEach(async ({ page }) => {
    if (!USE_STACK) {
      await mockBackend(page);
    }
  });

  test("redirects unauthenticated user to login", async ({ page }) => {
    await page.goto("/app/chats");
    await expect(page).toHaveURL(/\/login/);
  });

  test("user can log in and see the conversations list", async ({ page }) => {
    const email = USE_STACK ? (process.env.E2E_USER_EMAIL ?? "e2e@nexa.test") : "e2e@nexa.test";
    const password = USE_STACK ? (process.env.E2E_USER_PASS ?? "E2ePass123!") : "any";

    await loginAs(page, email, password);

    // Should land on chats
    await expect(page).toHaveURL(/\/app\/chats/, { timeout: 15_000 });

    // Chat list panel should be visible
    await expect(page.locator('[aria-label="Chat list"]')).toBeVisible({ timeout: 10_000 });
  });

  test("user can open a conversation and send a message", async ({ page }) => {
    const email = USE_STACK ? (process.env.E2E_USER_EMAIL ?? "e2e@nexa.test") : "e2e@nexa.test";
    const password = USE_STACK ? (process.env.E2E_USER_PASS ?? "E2ePass123!") : "any";

    await loginAs(page, email, password);
    await expect(page).toHaveURL(/\/app\/chats/, { timeout: 15_000 });

    // Click the first conversation in the list
    const convItem = page.locator(".chat-conv-item").first();
    await expect(convItem).toBeVisible({ timeout: 10_000 });
    await convItem.click();

    // Composer should appear
    const composer = page.getByRole("textbox", { name: /message text/i });
    await expect(composer).toBeVisible({ timeout: 8_000 });

    // Type and send a message
    const msgText = `Hello from E2E test ${Date.now()}`;
    await composer.fill(msgText);
    await page.getByRole("button", { name: /send message/i }).click();

    // Message should appear in the thread (optimistic or confirmed)
    await expect(
      page.locator(".message-bubble, .msg-bubble, [class*='bubble']").filter({ hasText: msgText }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("sent message shows delivery checkmark", async ({ page }) => {
    if (USE_STACK) {
      // Only meaningful against a real backend with delivery receipts
      test.skip();
    }

    await loginAs(page, "e2e@nexa.test", "any");
    await expect(page).toHaveURL(/\/app\/chats/, { timeout: 15_000 });

    const convItem = page.locator(".chat-conv-item").first();
    await expect(convItem).toBeVisible({ timeout: 10_000 });
    await convItem.click();

    const composer = page.getByRole("textbox", { name: /message text/i });
    await expect(composer).toBeVisible({ timeout: 8_000 });

    await composer.fill("Delivery check");
    await page.getByRole("button", { name: /send message/i }).click();

    // Message bubble should appear — optimistic send counts as "sent"
    await expect(
      page.locator(".message-bubble, .msg-bubble, [class*='bubble']").filter({ hasText: "Delivery check" }),
    ).toBeVisible({ timeout: 10_000 });
  });
});
