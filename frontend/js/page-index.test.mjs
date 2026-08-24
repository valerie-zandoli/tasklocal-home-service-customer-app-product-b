// Run with: node --test frontend/js/page-index.test.mjs
// Needs jsdom. page-index.js uses window.location.replace(), not
// window.location.href = ... like nav.js/page-login.js -- tried spying on
// location.replace directly and even replacing window.location wholesale;
// both are silently blocked by jsdom the same way the href setter is (real
// browsers protect window.location from redefinition too, for the same
// anti-hijacking reasons, and jsdom faithfully reproduces that). So these
// tests use the same jsdomError technique as nav.test.mjs's
// requireSession() tests: confirm a redirect was *attempted*, correctly
// conditioned on session presence, without depending on jsdom internals
// that aren't meant to be relied on for the exact target URL.

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const SESSION_KEY = "tasklocal_session";

const INDEX_HTML = `<!doctype html><body>
  <div class="container" id="loading-state"><p>Loading…</p></div>
</body>`;

let importCounter = 0;
function importPageIndex() {
  // page-index.js has no exports and runs entirely on import -- same
  // cache-busting need as page-listing.js/page-listings.js.
  return import(`./page-index.js?t=${++importCounter}`);
}

function setupDom() {
  const jsdomErrors = [];
  const dom = new JSDOM(INDEX_HTML, { url: "http://localhost/index.html" });
  dom.virtualConsole.on("jsdomError", (err) => jsdomErrors.push(err));
  global.window = dom.window;
  global.document = dom.window.document;
  global.sessionStorage = dom.window.sessionStorage;
  global.localStorage = dom.window.localStorage;
  return { jsdomErrors };
}

function navigationWasAttempted(jsdomErrors) {
  return jsdomErrors.some((e) => /navigation/i.test(e.message));
}

test("attempts a redirect when a session exists", async () => {
  const { jsdomErrors } = setupDom();
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ email: "alex.rivera@example.com", displayName: "Alex Rivera", customerId: "cust_60227" })
  );

  await importPageIndex();
  await new Promise((r) => setTimeout(r, 0));

  assert.ok(navigationWasAttempted(jsdomErrors), "expected a redirect attempt when a session exists");
});

test("attempts a redirect when no session exists", async () => {
  const { jsdomErrors } = setupDom();
  sessionStorage.removeItem(SESSION_KEY);

  await importPageIndex();
  await new Promise((r) => setTimeout(r, 0));

  assert.ok(navigationWasAttempted(jsdomErrors), "expected a redirect attempt when there's no session");
});

test("shows an error message and does NOT navigate when getSession() throws", async () => {
  const { jsdomErrors } = setupDom();
  // getSession() (api.js) does JSON.parse(sessionStorage.getItem(...)) with
  // no try/catch of its own -- malformed JSON here is a real, simple way to
  // make it throw, exercising page-index.js's own catch block without
  // needing to mock anything.
  sessionStorage.setItem(SESSION_KEY, "{not valid json");

  await importPageIndex();
  await new Promise((r) => setTimeout(r, 0));

  assert.match(document.getElementById("loading-state").textContent, /Something went wrong/);
  assert.equal(navigationWasAttempted(jsdomErrors), false, "should not attempt to navigate after an error");
});
