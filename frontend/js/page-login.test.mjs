// Run with: node --test frontend/js/page-login.test.mjs
// Needs jsdom. See page-index.test.mjs for why the "redirect if already
// logged in" case only checks that a redirect was attempted, not its exact
// target -- same jsdom window.location limitation, same accepted tradeoff.

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { DEMO_USERS } from "./demo-users.js";

const SESSION_KEY = "tasklocal_session";

const LOGIN_HTML = `<!doctype html><body>
  <form id="login-form" novalidate>
    <input id="email" type="email" />
    <input id="password" type="password" />
    <button class="primary" type="submit">Log in</button>
    <p class="error-text" id="error-text" aria-live="polite"></p>
  </form>
  <div class="demo-accounts">
    <div class="demo-grid" id="demo-grid"></div>
  </div>
</body>`;

let importCounter = 0;
function importPageLogin() {
  // page-login.js has no exports and runs entirely on import -- same
  // cache-busting need as the other page-*.js test files.
  return import(`./page-login.js?t=${++importCounter}`);
}

function setupDom() {
  const jsdomErrors = [];
  const dom = new JSDOM(LOGIN_HTML, { url: "http://localhost/login.html" });
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

  await importPageLogin();
  await new Promise((r) => setTimeout(r, 0));

  assert.ok(navigationWasAttempted(jsdomErrors), "expected an immediate redirect attempt for an already-logged-in visitor");
});

test("renders one button per real demo account, and clicking one autofills the real email and password", async () => {
  setupDom();
  sessionStorage.removeItem(SESSION_KEY);

  await importPageLogin();
  await new Promise((r) => setTimeout(r, 0));

  const buttons = document.querySelectorAll("#demo-grid button");
  assert.equal(buttons.length, DEMO_USERS.length);

  const target = DEMO_USERS[1];
  const targetBtn = [...buttons].find((b) => b.dataset.email === target.email);
  assert.ok(targetBtn, `expected a demo button for ${target.email}`);
  targetBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.equal(document.getElementById("email").value, target.email);
  assert.equal(document.getElementById("password").value, target.password);
});

test("submitting valid demo credentials logs in and attempts to navigate to listings.html", async () => {
  const { jsdomErrors } = setupDom();
  sessionStorage.removeItem(SESSION_KEY);

  await importPageLogin();
  await new Promise((r) => setTimeout(r, 0));

  const user = DEMO_USERS[0];
  document.getElementById("email").value = user.email;
  document.getElementById("password").value = user.password;
  document.getElementById("login-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  // login() (api.js) is async before the redirect attempt.
  await new Promise((r) => setTimeout(r, 0));

  const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY));
  assert.equal(stored.email, user.email);
  assert.ok(navigationWasAttempted(jsdomErrors), "expected a redirect attempt after a successful login");
});

test("submitting the wrong password shows an error and does not navigate", async () => {
  const { jsdomErrors } = setupDom();
  sessionStorage.removeItem(SESSION_KEY);

  await importPageLogin();
  await new Promise((r) => setTimeout(r, 0));

  const user = DEMO_USERS[0];
  document.getElementById("email").value = user.email;
  document.getElementById("password").value = "definitely-the-wrong-password";
  const submitBtn = document.querySelector("button[type=submit]");
  document.getElementById("login-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));

  assert.match(document.getElementById("error-text").textContent, /incorrect/i);
  assert.equal(sessionStorage.getItem(SESSION_KEY), null);
  assert.equal(navigationWasAttempted(jsdomErrors), false, "should not navigate away after a failed login");
  assert.equal(submitBtn.disabled, false, "submit button should be re-enabled after a failed attempt");
});
