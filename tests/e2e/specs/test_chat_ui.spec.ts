import { test, expect, Page } from "@playwright/test";

const MOCK_USER = {
  id: "user-e2e-001",
  username: "e2e_tester",
  email: "e2e@nexa.test",
  display_name: "E2E Tester",
  avatar_url: null,
  verified: false,
  is_bot: false,
  uid: "SC-DEMO001",
};
const MOCK_TOKEN = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.e30.stub";

const MOCK_CONVERSATIONS = [
  {
    id: "conv-alpha",
    type: "dm",
    title: "Alice",
    description: null,
    slug: null,
    is_public: false,
    member_count: 2,
    last_message_preview: "Hey there!",
    unread_count: 0,
    pinned_message_ids: [],
    peer_user_id: "u-alice",
    member_ids: ["user-e2e-001", "u-alice"],
  },
  {
    id: "conv-beta",
    type: "dm",
    title: "Bob",
    description: null,
    slug: null,
    is_public: false,
    member_count: 2,
    last_message_preview: "What's up?",
    unread_count: 2,
    pinned_message_ids: [],
    peer_user_id: "u-bob",
    member_ids: ["user-e2e-001", "u-bob"],
  },
  {
    id: "conv-gamma",
    type: "group",
    title: "Team Chat",
    description: null,
    slug: null,
    is_public: false,
    member_count: 5,
    last_message_preview: "Meeting at 3pm",
    unread_count: 0,
    pinned_message_ids: [],
    peer_user_id: null,
    member_ids: ["user-e2e-001", "u-alice", "u-bob"],
  },
];

async function mockBackend(page: Page) {
  // Register catch-all FIRST — Playwright uses last-registered-wins priority,
  // so specific routes registered below will override this fallback.
  await page.route("**/api/v1/**", (r) => r.fulfill({ json: {} }));

  // Specific routes override the catch-all above
  await page.route("**/api/v1/auth/config", (r) =>
    r.fulfill({ json: { oauth_enabled: false } }),
  );
  await page.route("**/api/v1/auth/login", (r) =>
    r.fulfill({
      json: { user: MOCK_USER, access_token: MOCK_TOKEN, expires_in: 900 },
    }),
  );
  await page.route("**/api/v1/csrf-token", (r) =>
    r.fulfill({ json: { csrf_token: "mock-csrf-stub" } }),
  );
  await page.route("**/api/v1/users/me", (r) => r.fulfill({ json: MOCK_USER }));
  // Bootstrap/profile endpoints need a full UserProfile shape to avoid Avatar crash
  const MOCK_PROFILE = {
    id: "user-e2e-001",
    username: "e2e_tester",
    nickname: "E2E Tester",
    uid: "SC-DEMO001",
    bio: "",
    status_text: "",
    avatar_url: null,
    animated_avatar_url: null,
    avatar_kind: "initial",
    is_online: true,
    last_seen_at: null,
    verification_badge: "none",
    privacy: {
      show_last_seen: true,
      show_online_status: true,
      show_bio: true,
      show_status_text: true,
      show_avatar: true,
      allow_search_by_username: true,
    },
  };
  await page.route("**/api/v1/users/bootstrap", (r) => r.fulfill({ json: MOCK_PROFILE }));
  await page.route("**/api/v1/users/me/profile", (r) => r.fulfill({ json: MOCK_PROFILE }));
  await page.route("**/api/v1/auth/refresh", (r) =>
    r.fulfill({ status: 401, json: {} }),
  );
  await page.route("**/api/v1/chat/conversations", async (r) => {
    if (r.request().method() === "GET") {
      return r.fulfill({ json: MOCK_CONVERSATIONS });
    }
    return r.fulfill({ json: MOCK_CONVERSATIONS[0] });
  });
  await page.route("**/api/v1/chat/conversations/*/messages*", (r) =>
    r.fulfill({ json: [] }),
  );
  await page.route("**/api/v1/chat/conversations/*/sync*", (r) =>
    r.fulfill({ json: [] }),
  );
  await page.route("**/api/v1/chat/conversations/*/read", (r) =>
    r.fulfill({ status: 204, body: "" }),
  );
  await page.route("**/api/v1/users/presence", (r) =>
    r.fulfill({ status: 204, body: "" }),
  );
  await page.route("**/api/v1/notifications/**", (r) =>
    r.fulfill({ status: 204, body: "" }),
  );
  // Abort WebSocket so app falls back to REST mode
  await page.route("**/api/v1/ws", (r) => r.abort());
}

async function loginAndWait(page: Page) {
  await page.goto("/login");
  await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("textbox", { name: /email/i }).fill("e2e@nexa.test");
  await page.locator('input[type="password"]').fill("any");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/app\/chats/, { timeout: 15_000 });
  // Wait for at least one chat item to appear
  await page.waitForSelector(".chat-conv-item", { timeout: 10_000 });
  // Small extra wait for API conversations to settle
  await page.waitForTimeout(500);
}

/** Find the first chat item that is NOT saved messages (can be pinned/unpinned). */
async function findPinnableChat(page: Page) {
  const items = page.locator(".chat-conv-item");
  const count = await items.count();
  for (let i = 0; i < count; i++) {
    const item = items.nth(i);
    const nameEl = item.locator(".chat-conv-item__name span").last();
    const name = await nameEl.textContent();
    if (name && name.trim() !== "Saved Messages") {
      return { item, name: name.trim() };
    }
  }
  return null;
}

test.describe("Chat sidebar — pin/unpin and draft sort", () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page);
  });

  test("conversations list renders after login", async ({ page }) => {
    await loginAndWait(page);
    const items = page.locator(".chat-conv-item");
    const count = await items.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const name = await items.nth(i).locator(".chat-conv-item__name span").last().textContent();
      console.log(`  [${i}] ${name?.trim()}`);
    }
  });

  test("pin chat moves it to Pinned section", async ({ page }) => {
    await loginAndWait(page);

    // Find a non-saved chat to pin
    const target = await findPinnableChat(page);
    expect(target).not.toBeNull();
    if (!target) return;

    console.log("Pinning chat:", target.name);

    // Right-click to open context menu
    await target.item.click({ button: "right" });
    const contextMenu = page.locator(".msg-context-menu");
    await expect(contextMenu).toBeVisible({ timeout: 3_000 });

    // If already pinned, unpin first
    const unpinFirst = contextMenu.locator(".msg-context-menu__item", { hasText: "Unpin chat" });
    if ((await unpinFirst.count()) > 0) {
      await unpinFirst.click();
      await page.waitForTimeout(300);
      // Right-click again to pin
      const freshTarget = await findPinnableChat(page);
      if (!freshTarget) return;
      await freshTarget.item.click({ button: "right" });
      await expect(contextMenu).toBeVisible({ timeout: 3_000 });
    }

    // Click "Pin chat"
    const pinBtn = contextMenu.locator(".msg-context-menu__item", { hasText: "Pin chat" });
    await expect(pinBtn).toBeVisible({ timeout: 2_000 });
    await pinBtn.click();
    await page.waitForTimeout(300);

    // Verify a "Pinned" section now exists
    const pinnedSection = page.locator(".chat-sidebar__section-title", { hasText: "Pinned" });
    await expect(pinnedSection).toBeVisible({ timeout: 3_000 });
    console.log("Pinned section appeared ✓");
  });

  test("unpin chat removes it from Pinned section", async ({ page }) => {
    await loginAndWait(page);

    // Find a non-saved chat and pin it first
    const target = await findPinnableChat(page);
    expect(target).not.toBeNull();
    if (!target) return;

    // Pin it
    await target.item.click({ button: "right" });
    const contextMenu = page.locator(".msg-context-menu");
    await expect(contextMenu).toBeVisible({ timeout: 3_000 });

    const unpinFirst = contextMenu.locator(".msg-context-menu__item", { hasText: "Unpin chat" });
    if ((await unpinFirst.count()) > 0) {
      // Already pinned — just close and proceed
      await page.keyboard.press("Escape");
    } else {
      const pinBtn = contextMenu.locator(".msg-context-menu__item", { hasText: "Pin chat" });
      await expect(pinBtn).toBeVisible({ timeout: 2_000 });
      await pinBtn.click();
      await page.waitForTimeout(300);
    }

    // Verify pinned section exists
    const pinnedSection = page.locator(".chat-sidebar__section-title", { hasText: "Pinned" });
    await expect(pinnedSection).toBeVisible({ timeout: 3_000 });

    // Find the pinned item (it'll be first in the Pinned section)
    // Right-click the pinned section's first item
    const pinnedItems = pinnedSection.locator("~ section .chat-conv-item");
    // Use a different approach: find any item showing "Unpin chat" in its menu
    const allItems = page.locator(".chat-conv-item");
    const count = await allItems.count();
    let foundPinned = false;
    for (let i = 0; i < count; i++) {
      await allItems.nth(i).click({ button: "right" });
      const menu = page.locator(".msg-context-menu");
      await expect(menu).toBeVisible({ timeout: 2_000 });
      const unpinBtn = menu.locator(".msg-context-menu__item", { hasText: "Unpin chat" });
      if ((await unpinBtn.count()) > 0) {
        console.log("Found pinned item, unpinning...");
        await unpinBtn.click();
        foundPinned = true;
        break;
      }
      await page.keyboard.press("Escape");
      await page.waitForTimeout(100);
    }

    expect(foundPinned).toBe(true);
    await page.waitForTimeout(300);

    // Verify the Pinned section is gone
    const titles: string[] = [];
    const sectionTitles = page.locator(".chat-sidebar__section-title");
    for (let i = 0; i < await sectionTitles.count(); i++) {
      titles.push((await sectionTitles.nth(i).textContent()) ?? "");
    }
    console.log("Sections after unpin:", titles);
    expect(titles).not.toContain("Pinned");
  });

  test("typing draft causes chat to rise to top of regular section", async ({ page }) => {
    await loginAndWait(page);

    // Get all non-saved items in the Chats section
    const allItems = page.locator(".chat-conv-item");
    const count = await allItems.count();
    expect(count).toBeGreaterThanOrEqual(3); // saved + at least 2 chats

    // Find the last non-saved chat
    let lastChatIndex = -1;
    let lastChatName = "";
    for (let i = count - 1; i >= 0; i--) {
      const name = (await allItems.nth(i).locator(".chat-conv-item__name span").last().textContent()) ?? "";
      if (name.trim() !== "Saved Messages") {
        lastChatIndex = i;
        lastChatName = name.trim();
        break;
      }
    }
    expect(lastChatIndex).toBeGreaterThanOrEqual(0);
    console.log(`Last non-saved chat [${lastChatIndex}]: "${lastChatName}"`);

    // Click the last non-saved chat to open it
    await allItems.nth(lastChatIndex).click();
    await page.waitForTimeout(300);

    // Find and type in the message composer
    const composer = page.locator("textarea").first();
    await expect(composer).toBeVisible({ timeout: 5_000 });
    await composer.fill("draft message");
    await page.waitForTimeout(500);

    // Now check if the chat has moved up
    const updatedItems = page.locator(".chat-conv-item");
    const updatedCount = await updatedItems.count();
    let newFirstNonSaved = "";
    for (let i = 0; i < updatedCount; i++) {
      const name = (await updatedItems.nth(i).locator(".chat-conv-item__name span").last().textContent()) ?? "";
      if (name.trim() !== "Saved Messages") {
        newFirstNonSaved = name.trim();
        break;
      }
    }
    console.log(`First non-saved after typing: "${newFirstNonSaved}" (expected: "${lastChatName}")`);
    expect(newFirstNonSaved).toBe(lastChatName);
  });
});
