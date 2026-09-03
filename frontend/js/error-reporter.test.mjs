// Run with: node --test frontend/js/error-reporter.test.mjs
// Needs jsdom, same reason as nav.test.mjs -- error-reporter.js is a plain
// script (not a module) that reacts to real window/sessionStorage events.

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

function setupDom({ path = "/listings.html" } = {}) {
  const dom = new JSDOM(`<!doctype html><body></body>`, { url: `http://localhost${path}` });
  global.window = dom.window;
  global.document = dom.window.document;
  global.sessionStorage = dom.window.sessionStorage;
  return dom;
}

test("an uncaught error is recorded and readable via window.TASKLOCAL_ERROR_LOG", async () => {
  const dom = setupDom({ path: "/bookings.html" });
  await import(`./error-reporter.js?t=${Date.now()}`);

  dom.window.dispatchEvent(new dom.window.ErrorEvent("error", { message: "boom", filename: "app.js", lineno: 42 }));

  const log = window.TASKLOCAL_ERROR_LOG;
  assert.equal(log.length, 1);
  assert.equal(log[0].type, "error");
  assert.equal(log[0].message, "boom");
  assert.equal(log[0].source, "app.js");
  assert.equal(log[0].line, 42);
  assert.equal(log[0].page, "/bookings.html");
  assert.ok(log[0].at, "expected a recorded timestamp");
});

test("an unhandled promise rejection is recorded with its reason", async () => {
  setupDom();
  await import(`./error-reporter.js?t=${Date.now()}`);

  const event = new window.Event("unhandledrejection");
  event.reason = new Error("network down");
  window.dispatchEvent(event);

  const log = window.TASKLOCAL_ERROR_LOG;
  assert.equal(log.length, 1);
  assert.equal(log[0].type, "unhandledrejection");
  assert.equal(log[0].message, "network down");
});

test("the log caps at 20 entries, dropping the oldest first", async () => {
  setupDom();
  await import(`./error-reporter.js?t=${Date.now()}`);

  for (let i = 0; i < 25; i++) {
    window.dispatchEvent(new window.ErrorEvent("error", { message: `error ${i}` }));
  }

  const log = window.TASKLOCAL_ERROR_LOG;
  assert.equal(log.length, 20);
  assert.equal(log[0].message, "error 5", "expected the oldest 5 entries to have been dropped");
  assert.equal(log[19].message, "error 24");
});

test("window.TASKLOCAL_ERROR_LOG returns an empty array when nothing has been logged yet", async () => {
  setupDom();
  await import(`./error-reporter.js?t=${Date.now()}`);

  assert.deepEqual(window.TASKLOCAL_ERROR_LOG, []);
});
