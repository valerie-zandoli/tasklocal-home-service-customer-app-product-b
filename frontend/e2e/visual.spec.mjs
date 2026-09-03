// Runs on all three projects (desktop-light, desktop-dark, mobile-light --
// see playwright.config.mjs), so each of these renders 3 times: once per
// theme/viewport combination that actually matters for this app (it has no
// separate mobile codebase, per README.md's "Architecture" -- one
// responsive site, `prefers-color-scheme` for theme).
//
// The FIRST run of this file has nothing to compare against: Playwright
// writes a resting-state screenshot to core-flows-visual.spec.mjs-snapshots/
// (or the toHaveScreenshot name given) as the new baseline and reports that
// test as passed-by-creating-a-baseline, not passed-by-matching. Every run
// after that actually compares against those committed baseline images --
// review the first run's screenshots once by hand before trusting them as
// "correct," since nothing checked that automatically.
import { test, expect } from "@playwright/test";
import { DEMO_USERS } from "../js/demo-users.js";

const [alex] = DEMO_USERS;

async function login(page) {
  await page.goto("/login.html");
  await page.getByRole("button", { name: alex.displayName }).click();
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/listings.html");
}

test("login page", async ({ page }) => {
  await page.goto("/login.html");
  await expect(page).toHaveScreenshot("login.png");
});

test("browse listings page", async ({ page }) => {
  await login(page);
  await expect(page.locator(".listing-card").first()).toBeVisible();
  await expect(page).toHaveScreenshot("listings.png");
});

test("listing detail page", async ({ page }) => {
  await login(page);
  await page.goto("/listing.html?id=lst_343432");
  await expect(page.getByRole("heading", { name: "Move-Out Cleaning" })).toBeVisible();
  await expect(page).toHaveScreenshot("listing-detail.png");
});

test("my bookings page", async ({ page }) => {
  await login(page);
  await page.goto("/bookings.html");
  await expect(page.getByRole("heading", { name: "My bookings" })).toBeVisible();
  await expect(page).toHaveScreenshot("bookings.png");
});
