// Runs only on desktop-light (see playwright.config.mjs) -- a budget is a
// budget regardless of viewport, and checking it 3x per push for the same
// number would just be noise. Measures real bytes-over-the-wire and real
// browser timing against the live app, not a synthetic Lighthouse score --
// deliberately no second heavy browser-automation dependency (Lighthouse is
// itself Puppeteer-based) just to get a number Playwright's own APIs
// already expose directly.
//
// Budgets here are generous on purpose: this suite exists to catch a
// regression (a page that used to load 200KB starting to load 4MB), not to
// chase a specific score. A budget this loose failing at all is itself the
// signal something changed a lot.
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DEMO_USERS } from "../js/demo-users.js";

const [alex] = DEMO_USERS;
const PAGE_WEIGHT_BUDGET_BYTES = 2_000_000; // 2MB -- this app ships no images beyond small SVG/PNG icons
const LOAD_TIME_BUDGET_MS = 5000; // generous for a live network call to Supabase, not a synthetic local benchmark

// A budget only catches a regression big enough to breach it outright -- a
// slow creep (each push adding a little) would pass every individual run.
// Recording the actual numbers per run, not just pass/fail, is what makes
// that creep visible later, even though nothing reads this file yet. See
// .github/workflows/performance.yml, which uploads it as a build artifact.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_PATH = path.join(__dirname, "..", "performance-results.json");
const results = [];

function record(name, metrics) {
  results.push({ name, ...metrics, recordedAt: new Date().toISOString() });
}

test.afterAll(() => {
  if (results.length === 0) return;
  mkdirSync(path.dirname(RESULTS_PATH), { recursive: true });
  writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
});

async function login(page) {
  await page.goto("/login.html");
  await page.getByRole("button", { name: alex.displayName }).click();
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/listings.html");
}

async function measurePage(page, gotoFn) {
  let totalBytes = 0;
  page.on("response", async (response) => {
    try {
      const headers = response.headers();
      totalBytes += Number(headers["content-length"] || 0);
    } catch {
      // a response that finished after the page navigated away (e.g. a
      // dangling Supabase call) can't be read anymore -- not this budget's
      // concern, so just skip it rather than fail the whole test on it.
    }
  });
  const started = Date.now();
  await gotoFn();
  const loadTimeMs = Date.now() - started;
  return { totalBytes, loadTimeMs };
}

test("login page stays within its page-weight and load-time budget", async ({ page }) => {
  const { totalBytes, loadTimeMs } = await measurePage(page, () => page.goto("/login.html", { waitUntil: "networkidle" }));
  record("login page", { totalBytes, loadTimeMs });
  expect(totalBytes).toBeLessThan(PAGE_WEIGHT_BUDGET_BYTES);
  expect(loadTimeMs).toBeLessThan(LOAD_TIME_BUDGET_MS);
});

test("browse listings page stays within its page-weight and load-time budget", async ({ page }) => {
  await login(page);
  const { totalBytes, loadTimeMs } = await measurePage(page, () => page.goto("/listings.html", { waitUntil: "networkidle" }));
  record("listings page", { totalBytes, loadTimeMs });
  expect(totalBytes).toBeLessThan(PAGE_WEIGHT_BUDGET_BYTES);
  expect(loadTimeMs).toBeLessThan(LOAD_TIME_BUDGET_MS);
});

test("listing detail page stays within its page-weight and load-time budget", async ({ page }) => {
  await login(page);
  const { totalBytes, loadTimeMs } = await measurePage(page, () => page.goto("/listing.html?id=lst_343432", { waitUntil: "networkidle" }));
  record("listing detail page", { totalBytes, loadTimeMs });
  expect(totalBytes).toBeLessThan(PAGE_WEIGHT_BUDGET_BYTES);
  expect(loadTimeMs).toBeLessThan(LOAD_TIME_BUDGET_MS);
});

test("my bookings page stays within its page-weight and load-time budget", async ({ page }) => {
  await login(page);
  const { totalBytes, loadTimeMs } = await measurePage(page, () => page.goto("/bookings.html", { waitUntil: "networkidle" }));
  record("bookings page", { totalBytes, loadTimeMs });
  expect(totalBytes).toBeLessThan(PAGE_WEIGHT_BUDGET_BYTES);
  expect(loadTimeMs).toBeLessThan(LOAD_TIME_BUDGET_MS);
});

test("browse listings page's real First Contentful Paint stays under budget", async ({ page }) => {
  await login(page);
  await page.goto("/listings.html");
  await page.waitForSelector(".listing-card");
  const fcp = await page.evaluate(() => {
    const entry = performance.getEntriesByName("first-contentful-paint")[0];
    return entry ? entry.startTime : null;
  });
  record("listings page FCP", { firstContentfulPaintMs: fcp });
  expect(fcp, "expected the browser to report a first-contentful-paint entry").not.toBeNull();
  expect(fcp).toBeLessThan(3000);
});
