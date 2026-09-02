// Run with: node --test frontend/js/page-bookings.test.mjs
// Needs jsdom. Uses real frontend/data/bookings.json via installFetchStub()
// -- see test-helpers.mjs and page-listing.test.mjs for why, and why every
// import of page-bookings.js below is cache-busted with a unique query string.

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { installFetchStub, setupDom } from "./test-helpers.mjs";
import { DEMO_USERS } from "./demo-users.js";

const SESSION_KEY = "tasklocal_session";
const MOCK_BOOKINGS_KEY = "tasklocal_mock_bookings";

const BOOKINGS_HTML = `<!doctype html><body>
  <nav id="app-nav"></nav>
  <p class="error-text" id="bookings-error" aria-live="polite"></p>
  <div id="bookings-list"></div>
  <p id="empty-state" hidden>You haven't booked anything yet.</p>
</body>`;

let importCounter = 0;
function importPageBookings() {
  return import(`./page-bookings.js?t=${++importCounter}`);
}

function signIn() {
  // Alex Rivera (cust_60227) has three real bookings in frontend/data/bookings.json
  // as of this writing -- one pending, one confirmed, one completed, all
  // unrated -- covering every branch getRatingDisplayState() can return.
  const user = DEMO_USERS[0];
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ email: user.email, displayName: user.displayName, customerId: user.customerId })
  );
  return user;
}

test("a pending or confirmed booking shows a hint instead of a rating control", async () => {
  setupDom(JSDOM, BOOKINGS_HTML, { url: "http://localhost/bookings.html" });
  signIn();
  localStorage.removeItem(MOCK_BOOKINGS_KEY);
  installFetchStub();

  await importPageBookings();
  await new Promise((r) => setTimeout(r, 50));

  const rows = [...document.querySelectorAll(".booking-row")];
  const pendingRow = rows.find((r) => r.textContent.includes("bkg_900001"));
  const confirmedRow = rows.find((r) => r.textContent.includes("bkg_900002"));
  assert.match(pendingRow.textContent, /Rating unlocks once this booking is completed/);
  assert.match(confirmedRow.textContent, /Rating unlocks once this booking is completed/);
  assert.equal(pendingRow.querySelector(".rating-form"), null, "a pending booking should not show a rating form");
});

test("a completed, unrated booking shows the rating form, not the hint", async () => {
  setupDom(JSDOM, BOOKINGS_HTML, { url: "http://localhost/bookings.html" });
  signIn();
  localStorage.removeItem(MOCK_BOOKINGS_KEY);
  installFetchStub();

  await importPageBookings();
  await new Promise((r) => setTimeout(r, 50));

  const rows = [...document.querySelectorAll(".booking-row")];
  const completedRow = rows.find((r) => r.textContent.includes("bkg_900003"));
  assert.notEqual(completedRow.querySelector(".rating-form"), null, "a completed, unrated booking should show a rating form");
  assert.doesNotMatch(completedRow.textContent, /Rating unlocks/);
});

test("submitting a rating replaces the form with the saved rating, real mock data included", async () => {
  setupDom(JSDOM, BOOKINGS_HTML, { url: "http://localhost/bookings.html" });
  signIn();
  localStorage.removeItem(MOCK_BOOKINGS_KEY);
  installFetchStub();

  await importPageBookings();
  await new Promise((r) => setTimeout(r, 50));

  const rows = [...document.querySelectorAll(".booking-row")];
  const completedRow = rows.find((r) => r.textContent.includes("bkg_900003"));
  const select = completedRow.querySelector("select");
  select.value = "5";
  select.dispatchEvent(new window.Event("change", { bubbles: true }));
  completedRow.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 50));

  const stored = JSON.parse(localStorage.getItem(MOCK_BOOKINGS_KEY));
  const saved = stored.find((b) => b.booking_id === "bkg_900003");
  assert.equal(saved.rating, 5);

  const refreshedRow = [...document.querySelectorAll(".booking-row")].find((r) => r.textContent.includes("bkg_900003"));
  assert.match(refreshedRow.textContent, /Rated 5\/5/);
  assert.equal(refreshedRow.querySelector(".rating-form"), null);
});
