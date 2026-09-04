// Run with: node --test frontend/js/page-signup.test.mjs
// Same jsdom conventions as page-login.test.mjs, its closest sibling
// (cache-busted import, jsdomError-based navigation-attempt detection).

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const SESSION_KEY = "tasklocal_session";

const SIGNUP_HTML = `<!doctype html><body>
  <form id="signup-form" novalidate>
    <input id="display-name" type="text" />
    <input id="email" type="email" />
    <input id="password" type="password" minlength="8" />
    <button class="primary" type="submit">Sign up</button>
    <p class="error-text" id="error-text" aria-live="polite"></p>
    <p class="success-text" id="success-text" aria-live="polite"></p>
  </form>
</body>`;

let importCounter = 0;
function importPageSignup() {
  return import(`./page-signup.js?t=${++importCounter}`);
}

function setupDom() {
  const jsdomErrors = [];
  const dom = new JSDOM(SIGNUP_HTML, { url: "http://localhost/signup.html" });
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

test("attempts a redirect immediately if a session already exists", async () => {
  const { jsdomErrors } = setupDom();
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ email: "alex.rivera@example.com", displayName: "Alex Rivera", customerId: "cust_60227" })
  );

  await importPageSignup();
  await new Promise((r) => setTimeout(r, 0));

  assert.ok(navigationWasAttempted(jsdomErrors), "expected an immediate redirect attempt for an already-logged-in visitor");
});

test("submitting a new name/email/password creates a mock account and attempts to navigate to listings.html", async () => {
  const { jsdomErrors } = setupDom();
  sessionStorage.removeItem(SESSION_KEY);

  await importPageSignup();
  await new Promise((r) => setTimeout(r, 0));

  document.getElementById("display-name").value = "New Customer";
  document.getElementById("email").value = "new.customer@example.com";
  document.getElementById("password").value = "a-strong-password";
  document.getElementById("signup-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));

  const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY));
  assert.equal(stored.email, "new.customer@example.com");
  assert.equal(stored.displayName, "New Customer");
  assert.ok(navigationWasAttempted(jsdomErrors), "expected a redirect attempt after a successful signup");
});

test("submitting a short password shows an error and does not create an account or navigate", async () => {
  const { jsdomErrors } = setupDom();
  sessionStorage.removeItem(SESSION_KEY);

  await importPageSignup();
  await new Promise((r) => setTimeout(r, 0));

  document.getElementById("display-name").value = "Someone";
  document.getElementById("email").value = "someone@example.com";
  document.getElementById("password").value = "short1";
  const submitBtn = document.querySelector("button[type=submit]");
  document.getElementById("signup-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));

  assert.match(document.getElementById("error-text").textContent, /at least 8 characters/i);
  assert.equal(sessionStorage.getItem(SESSION_KEY), null);
  assert.equal(navigationWasAttempted(jsdomErrors), false, "should not navigate away after a failed signup");
  assert.equal(submitBtn.disabled, false, "submit button should be re-enabled after a failed attempt");
});

test("signing up twice with the same email shows an error on the second attempt", async () => {
  setupDom();
  sessionStorage.removeItem(SESSION_KEY);

  await importPageSignup();
  await new Promise((r) => setTimeout(r, 0));

  document.getElementById("display-name").value = "First";
  document.getElementById("email").value = "repeat@example.com";
  document.getElementById("password").value = "a-strong-password";
  document.getElementById("signup-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));

  // Fresh page load, e.g. the visitor came back to try again.
  sessionStorage.removeItem(SESSION_KEY);
  await importPageSignup();
  await new Promise((r) => setTimeout(r, 0));

  document.getElementById("display-name").value = "Second";
  document.getElementById("email").value = "repeat@example.com";
  document.getElementById("password").value = "another-password";
  document.getElementById("signup-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));

  assert.match(document.getElementById("error-text").textContent, /already exists/i);
});
