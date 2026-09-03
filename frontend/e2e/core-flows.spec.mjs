// Runs only on the desktop-light project (see playwright.config.mjs) --
// these are functional assertions, not per-theme/per-viewport ones. Every
// spec here drives the real, deployed app against the real, live Supabase
// project (frontend/js/config.js), which is exactly the class of coverage
// frontend/js/*.test.mjs (jsdom + a hand-built fake Supabase client)
// structurally cannot provide -- see this repo's README.md and this
// session's own review for two real bugs that only ever surfaced this way.
import { test, expect } from "@playwright/test";
import { DEMO_USERS } from "../js/demo-users.js";

const [alex, jordan, morgan, taylor] = DEMO_USERS;

async function login(page, user) {
  await page.goto("/login.html");
  await page.getByRole("button", { name: user.displayName }).click();
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/listings.html");
}

async function logout(page) {
  // A real <button> styled to look like a link (frontend/js/nav.js), not an
  // <a> -- its accessible role is "button", not "link".
  await page.getByRole("button", { name: "Log out" }).click();
}

test("wrong password shows an error and does not navigate away from the login page", async ({ page }) => {
  await page.goto("/login.html");
  // page-login.js is a module script, loaded and executed asynchronously --
  // its DOM elements (the inputs) exist immediately from the raw HTML, but
  // its `form.addEventListener("submit", ...)` isn't attached yet the
  // instant they appear. Filling and clicking immediately can race ahead of
  // that and hit the browser's own native (harmless, since these inputs
  // have no `name` attribute -- see README.md's Security section) form
  // submission instead of the app's own handler. The demo-account buttons
  // are rendered by that same synchronous script, right before the submit
  // listener is attached -- waiting for one to appear is a reliable proxy
  // for "the app's JS has now taken over the form."
  await expect(page.getByRole("button", { name: alex.displayName })).toBeVisible();
  await page.getByLabel("Email").fill(alex.email);
  await page.getByLabel("Password").fill("definitely-not-the-real-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Invalid login credentials")).toBeVisible();
  await expect(page).toHaveURL(/login\.html/);
});

for (const user of DEMO_USERS) {
  test(`demo account button logs in successfully: ${user.displayName}`, async ({ page }) => {
    await login(page, user);
    await expect(page.getByText(user.displayName)).toBeVisible();
    await logout(page);
  });
}

test("session persists across a reload, and visiting login.html while already signed in redirects away", async ({ page }) => {
  await login(page, taylor);
  await page.reload();
  await expect(page.getByText(taylor.displayName)).toBeVisible();
  await page.goto("/login.html");
  await page.waitForURL("**/listings.html");
});

test("logout clears the session — a protected page redirects to login afterward", async ({ page }) => {
  await login(page, taylor);
  await logout(page);
  await page.waitForURL("**/login.html");
  await page.goto("/listings.html");
  await page.waitForURL("**/login.html");
});

test("visiting a protected page without ever signing in redirects to login", async ({ page }) => {
  await page.goto("/bookings.html");
  await page.waitForURL("**/login.html");
});

test("server-side search narrows results to real matches, including a description-only term", async ({ page }) => {
  await login(page, alex);
  const cardsLocator = page.locator(".listing-card");
  await expect(cardsLocator.first()).toBeVisible();
  const before = await cardsLocator.count();

  await page.getByPlaceholder("e.g. deep clean, moving...").fill("drywall");
  await page.waitForTimeout(400); // debounced re-render
  const after = await cardsLocator.count();
  expect(after).toBeGreaterThan(0);
  expect(after).toBeLessThan(before);
  await expect(cardsLocator.first()).toContainText(/./); // sanity: still real cards, not an empty state mistakenly matching the count
});

test("a search term containing PostgREST or-filter syntax characters doesn't error and just narrows to zero matches", async ({ page }) => {
  await login(page, alex);
  await page.getByPlaceholder("e.g. deep clean, moving...").fill('clean, "or" moving');
  await page.waitForTimeout(400);
  await expect(page.getByText("No listings match your filters yet")).toBeVisible();
  await expect(page.getByText(/error/i)).toHaveCount(0);
  // #load-more's own `display: block` (styles.css) beat the built-in
  // [hidden] rule on specificity, so the button stayed visibly clickable
  // on an empty result set even though page-listings.js correctly set
  // `.hidden = true` -- found live by an independent review. Playwright's
  // toBeHidden() checks real rendered visibility, not just the DOM
  // attribute, so this catches a CSS regression a plain attribute check
  // wouldn't.
  await expect(page.getByRole("button", { name: "Load more" })).toBeHidden();
});

test("service type filter narrows results to only that category", async ({ page }) => {
  await login(page, alex);
  await page.locator("#service_type").selectOption("moving");
  await page.waitForTimeout(400);
  const badges = page.locator(".listing-card .badge");
  await expect(badges.first()).toBeVisible();
  // .badge is rendered all-caps via CSS text-transform, not in the actual
  // text content -- compare against the raw label utils.js's
  // formatServiceType() produces.
  const texts = await badges.allTextContents();
  for (const t of texts) expect(t.trim()).toBe("Moving");
});

test("max hourly rate filter excludes anything above the entered price", async ({ page }) => {
  await login(page, alex);
  // Read the real, current cheapest price rather than guessing a fixed
  // number -- the shared demo dataset's prices are randomized per listing
  // and drift over time, so a hardcoded threshold like $30 can end up below
  // every real listing's rate and leave this test with nothing to check.
  const firstPrice = await page.locator(".listing-card .price").first().textContent();
  const cheapest = Number(firstPrice.replace(/[^0-9.]/g, ""));
  const cap = Math.ceil(cheapest) + 5;

  await page.locator("#max_price").fill(String(cap));
  await page.waitForTimeout(400);
  const prices = await page.locator(".listing-card .price").allTextContents();
  expect(prices.length).toBeGreaterThan(0);
  for (const p of prices) {
    const value = Number(p.replace(/[^0-9.]/g, ""));
    expect(value).toBeLessThanOrEqual(cap);
  }
});

test("Load more appends a second page without duplicating any listing", async ({ page }) => {
  await login(page, alex);
  const cards = page.locator(".listing-card");
  await expect(cards.first()).toBeVisible();
  const firstPageCount = await cards.count();
  const loadMore = page.getByRole("button", { name: "Load more" });
  await expect(loadMore).toBeVisible();

  await loadMore.click();
  await page.waitForTimeout(400);
  const afterCount = await cards.count();
  expect(afterCount).toBeGreaterThan(firstPageCount);

  const hrefs = await cards.evaluateAll((els) => els.map((el) => el.getAttribute("href")));
  expect(new Set(hrefs).size).toBe(hrefs.length);
});

test("an already-booked slot never appears in the slot grid, and booking a real one succeeds end-to-end", async ({ page }) => {
  // Tags this test's own booking with the "bkg_livetest_" prefix
  // backend/scripts/cleanup-live-test-data.mjs sweeps up, without touching
  // page-listing.js's own randomBookingId() -- see that script's header for
  // why no customer-facing role can delete this row itself.
  await page.route("**/rpc/create_booking_with_schedule", async (route) => {
    const body = JSON.parse(route.request().postData());
    body.p_booking_id = `bkg_livetest_e2e_${Date.now()}`;
    await route.continue({ postData: JSON.stringify(body) });
  });

  await login(page, morgan);

  // Doesn't hardcode one listing_id: this shared demo project's real
  // availability constantly shifts (this very session's own concurrency
  // suite races real bookings against real listings), so a fixed id can
  // legitimately run dry. Walks real listing cards from the real Browse
  // page instead, opening each until one still has an open slot.
  const listingHrefs = await page.locator(".listing-card").evaluateAll((els) => els.slice(0, 15).map((el) => el.getAttribute("href")));
  let openListingHref, listingTitle, before, chosenSlot;
  for (const href of listingHrefs) {
    await page.goto("/" + href);
    const count = await page.locator(".slot-btn").count();
    if (count > 0) {
      openListingHref = href;
      before = count;
      listingTitle = await page.locator("h1").textContent();
      chosenSlot = await page.locator(".slot-btn").first().getAttribute("data-slot");
      break;
    }
  }
  if (before === undefined) test.skip(true, "none of the first 15 browsed listings currently have an open slot to prove this against");

  await page.locator(".slot-btn").first().click();
  await page.getByRole("button", { name: /Book this slot/ }).click();
  await page.waitForURL("**/bookings.html");
  await expect(page.getByText(listingTitle).first()).toBeVisible();

  await page.goto("/" + openListingHref);
  await expect(page.locator(`.slot-btn[data-slot="${chosenSlot}"]`)).toHaveCount(0);
  const after = await page.locator(".slot-btn").count();
  expect(after).toBe(before - 1);
});

test("a completed, unrated booking shows a rating form; submitting a rating persists it", async ({ page }) => {
  // Tries every demo account, not just one: whether a given account
  // currently has any completed booking at all depends on the shared
  // dataset's real state, which this session's own live testing has
  // already changed once (Taylor's original completed booking got rated
  // 5/5 earlier this session).
  let completedRow;
  for (const user of DEMO_USERS) {
    await login(page, user);
    await page.goto("/bookings.html");
    const row = page.locator(".booking-row", { has: page.locator(".status-completed") }).first();
    if ((await row.count()) > 0) {
      completedRow = row;
      break;
    }
    await logout(page);
  }
  if (!completedRow) test.skip(true, "none of the 4 demo accounts currently have a completed booking to rate");

  const ratingForm = completedRow.locator(".rating-form");
  if ((await ratingForm.count()) === 0) {
    // Already rated by an earlier run of this same spec -- confirm that
    // state instead of failing, rather than assuming "no form" is a bug.
    await expect(completedRow.getByText(/^Rated \d\/5$/)).toBeVisible();
    return;
  }
  await ratingForm.locator("select").selectOption("5");
  await ratingForm.getByRole("button", { name: "Submit" }).click();
  await expect(completedRow.getByText("Rated 5/5")).toBeVisible();
});

test("a listing id that doesn't exist shows a clear not-found message, not a blank or broken page", async ({ page }) => {
  await login(page, alex);
  await page.goto("/listing.html?id=lst_this_id_was_never_real");
  await expect(page.getByText(/could not be found/i)).toBeVisible();
});
