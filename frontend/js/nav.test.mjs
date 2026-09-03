// Run with: node --test frontend/js/nav.test.mjs
// Needs jsdom (frontend/package.json devDependency) — run `npm install` in
// frontend/ first. This is the one file in the suite that needs a DOM at
// all: renderNav() and requireSession() both manipulate real elements
// (innerHTML, getElementById, addEventListener), which utils.js's pure
// functions deliberately avoid needing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const SESSION_KEY = "tasklocal_session";

// Fresh JSDOM per test — jsdom's `window.location.href` setter is
// non-configurable and its navigation is intentionally unimplemented (it
// logs "Not implemented: navigation to another Document" rather than
// actually changing the URL or throwing), so there's no reliable way to
// read back *which* URL requireSession() tried to redirect to. Capturing
// jsdomError instead tests the part that actually matters — whether a
// redirect was attempted at all, correctly conditioned on session presence
// — without depending on jsdom internals that aren't meant to be relied on.
function setupDom({ path = "/listings.html" } = {}) {
  const jsdomErrors = [];
  const dom = new JSDOM(`<!doctype html><body><nav id="app-nav"></nav></body>`, {
    url: `http://localhost${path}`,
  });
  dom.virtualConsole.on("jsdomError", (err) => jsdomErrors.push(err));
  global.window = dom.window;
  global.document = dom.window.document;
  global.sessionStorage = dom.window.sessionStorage;
  global.localStorage = dom.window.localStorage;
  return { dom, jsdomErrors };
}

function navigationWasAttempted(jsdomErrors) {
  return jsdomErrors.some((e) => /navigation/i.test(e.message));
}

test("renderNav marks the current page's link active and leaves the other one alone", async () => {
  setupDom();
  const { renderNav } = await import("./nav.js");
  renderNav({ displayName: "Alex Rivera", customerId: "cust_1" }, "listings.html");

  const active = document.querySelector(".nav-links a.active");
  assert.equal(active.textContent, "Browse");
  assert.equal(active.getAttribute("aria-current"), "page");

  const other = [...document.querySelectorAll(".nav-links a")].find((a) => a !== active);
  assert.equal(other.textContent, "My Bookings");
  assert.equal(other.classList.contains("active"), false);
  assert.equal(other.hasAttribute("aria-current"), false);
});

test("renderNav escapes the display name instead of injecting it as HTML", async () => {
  setupDom();
  const { renderNav } = await import("./nav.js");
  renderNav({ displayName: '<img src=x onerror="alert(1)">', customerId: "cust_1" }, "listings.html");

  const userSpan = document.querySelector(".nav-user span");
  // If this were unescaped, querySelector would find a real <img> element
  // instead of literal text — confirms escapeHtml() is actually being
  // applied here, not just present somewhere in the codebase.
  assert.equal(document.querySelector(".nav-user img"), null);
  assert.match(userSpan.textContent, /^<img/);
});

test("renderNav includes a working Need Help link pointing at the repo's issue tracker", async () => {
  setupDom();
  const { renderNav } = await import("./nav.js");
  renderNav({ displayName: "Alex Rivera", customerId: "cust_1" }, "listings.html");

  const helpLink = [...document.querySelectorAll(".nav-user a")].find((a) => a.textContent === "Need help?");
  assert.ok(helpLink, "expected a 'Need help?' link in the nav");
  assert.equal(helpLink.getAttribute("href"), "https://github.com/valerie-zandoli/tasklocal-home-service-customer-app-product-b/issues");
  assert.equal(helpLink.getAttribute("target"), "_blank");
  assert.equal(helpLink.getAttribute("rel"), "noopener");
});

test("renderNav does nothing if #app-nav isn't on the page", async () => {
  setupDom();
  document.getElementById("app-nav").remove();
  const { renderNav } = await import("./nav.js");
  // Should not throw despite the target element being gone.
  assert.doesNotThrow(() => renderNav({ displayName: "X", customerId: "cust_1" }, "listings.html"));
});

test("renderNav's logout button calls logout() and attempts to navigate away", async () => {
  const { jsdomErrors } = setupDom();
  const { renderNav } = await import("./nav.js");
  renderNav({ displayName: "Alex Rivera", customerId: "cust_1" }, "listings.html");

  document.getElementById("logout-btn").click();
  // logout() clears sessionStorage synchronously before the (async, fire-
  // and-forget in mock mode) navigation; give the click handler's promise
  // chain a tick to run.
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(sessionStorage.getItem(SESSION_KEY), null);
  assert.ok(navigationWasAttempted(jsdomErrors), "expected a navigation attempt after logout");
});

test("requireSession returns the session unchanged when one exists in storage", async () => {
  setupDom();
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ email: "alex.rivera@example.com", displayName: "Alex Rivera", customerId: "cust_60227" })
  );
  const { requireSession } = await import("./nav.js");

  const session = await requireSession();
  assert.equal(session.displayName, "Alex Rivera");
  assert.equal(session.customerId, "cust_60227");
});

test("requireSession redirects and returns null when no session exists", async () => {
  const { jsdomErrors } = setupDom();
  sessionStorage.removeItem(SESSION_KEY);
  const { requireSession } = await import("./nav.js");

  const session = await requireSession();
  assert.equal(session, null);
  assert.ok(navigationWasAttempted(jsdomErrors), "expected a redirect attempt when there's no session");
});
