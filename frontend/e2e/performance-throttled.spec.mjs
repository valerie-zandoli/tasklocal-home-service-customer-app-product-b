// performance.spec.mjs proves the app stays under budget on a fast CI
// runner's own connection -- it says nothing about a real user on a real,
// degraded mobile connection. Playwright has no built-in network-throttling
// API; this uses Chromium's CDP Network domain directly, which is why the
// "throttled-mobile" project (playwright.config.mjs) is Chromium-based, not
// WebKit.
//
// Deliberately not a tight budget like performance.spec.mjs's -- the point
// here is "does the app still become usable at all under a real bad
// connection," not chasing a specific number under throttling.
import { test, expect } from "@playwright/test";
import { DEMO_USERS } from "../js/demo-users.js";

const [alex] = DEMO_USERS;

// Matches Chrome DevTools' own "Slow 4G" preset: ~400 Kbps, 400ms RTT.
const SLOW_4G = {
  offline: false,
  downloadThroughput: (400 * 1024) / 8,
  uploadThroughput: (400 * 1024) / 8,
  latency: 400,
};

async function throttle(page) {
  const client = await page.context().newCDPSession(page);
  await client.send("Network.enable");
  await client.send("Network.emulateNetworkConditions", SLOW_4G);
}

test("login page still becomes interactive on a throttled, Slow-4G-like connection", async ({ page }) => {
  await throttle(page);
  const started = Date.now();
  await page.goto("/login.html", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: alex.displayName }).waitFor({ state: "visible", timeout: 20000 });
  const elapsedMs = Date.now() - started;
  // Generous on purpose -- this is a "does it still work at all" check, not
  // a regression budget the way performance.spec.mjs's numbers are.
  expect(elapsedMs).toBeLessThan(20000);
});
