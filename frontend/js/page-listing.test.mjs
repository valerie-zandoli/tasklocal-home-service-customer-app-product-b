// Run with: node --test frontend/js/page-listing.test.mjs
// Needs jsdom. Uses real frontend/data/listings.json via installFetchStub()
// -- see test-helpers.mjs and page-listings.test.mjs for why, and why every
// import of page-listing.js below is cache-busted with a unique query string.

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { installFetchStub, setupDom, navigationWasAttempted } from "./test-helpers.mjs";
import { DEMO_USERS } from "./demo-users.js";

const SESSION_KEY = "tasklocal_session";
const MOCK_BOOKINGS_KEY = "tasklocal_mock_bookings";

const LISTING_HTML = `<!doctype html><body>
  <nav id="app-nav"></nav>
  <div id="listing-detail"></div>
</body>`;

let importCounter = 0;
function importPageListing() {
  return import(`./page-listing.js?t=${++importCounter}`);
}

function signIn() {
  const user = DEMO_USERS[0];
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ email: user.email, displayName: user.displayName, customerId: user.customerId })
  );
  return user;
}

// lst_343432 ("Move-Out Cleaning") has exactly 2 real availability_slots in
// frontend/data/listings.json as of this writing -- picked for a listing
// that's guaranteed bookable, not empty.
const BOOKABLE_LISTING_ID = "lst_343432";

test("renders listing details and one button per real availability slot", async () => {
  setupDom(JSDOM, LISTING_HTML, { url: `http://localhost/listing.html?id=${BOOKABLE_LISTING_ID}` });
  signIn();
  installFetchStub();

  await importPageListing();
  await new Promise((r) => setTimeout(r, 50));

  assert.match(document.querySelector("h1").textContent, /Move-Out Cleaning/);
  assert.match(document.querySelector(".detail-price").textContent, /^\$\d/);
  const slotButtons = document.querySelectorAll(".slot-btn");
  assert.equal(slotButtons.length, 2, "expected one button per real availability slot for lst_343432");
  const bookBtn = document.getElementById("book-btn");
  assert.equal(bookBtn.disabled, true, "nothing selected yet, so booking should start disabled");
});

test("shows 'No listing specified' when the id query param is missing", async () => {
  setupDom(JSDOM, LISTING_HTML, { url: "http://localhost/listing.html" });
  signIn();
  installFetchStub();

  await importPageListing();
  await new Promise((r) => setTimeout(r, 50));

  assert.match(document.getElementById("listing-detail").textContent, /No listing specified/);
  assert.equal(document.getElementById("book-btn"), null);
});

test("shows a not-found message for a listing id that doesn't exist", async () => {
  setupDom(JSDOM, LISTING_HTML, { url: "http://localhost/listing.html?id=lst_does_not_exist" });
  signIn();
  installFetchStub();

  await importPageListing();
  await new Promise((r) => setTimeout(r, 50));

  assert.match(document.getElementById("listing-detail").textContent, /could not be found/);
});

test("selecting a slot and booking creates a real mock booking and attempts to navigate to bookings.html", async () => {
  const { jsdomErrors } = setupDom(JSDOM, LISTING_HTML, {
    url: `http://localhost/listing.html?id=${BOOKABLE_LISTING_ID}`,
  });
  const user = signIn();
  // Start from an empty mock-bookings store so the new booking is easy to
  // find afterward, rather than depending on what's already seeded there.
  localStorage.removeItem(MOCK_BOOKINGS_KEY);
  installFetchStub();

  await importPageListing();
  await new Promise((r) => setTimeout(r, 50));

  const firstSlot = document.querySelector(".slot-btn");
  firstSlot.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(firstSlot.classList.contains("selected"), true);

  const bookBtn = document.getElementById("book-btn");
  assert.equal(bookBtn.disabled, false, "book button should enable once a slot is selected");
  bookBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  // createBooking() is async (reads/writes localStorage via api.js) before
  // the redirect attempt.
  await new Promise((r) => setTimeout(r, 50));

  assert.ok(navigationWasAttempted(jsdomErrors), "expected an attempted redirect to bookings.html after a successful booking");

  const stored = JSON.parse(localStorage.getItem(MOCK_BOOKINGS_KEY));
  const created = stored.find((b) => b.listing_id === BOOKABLE_LISTING_ID && b.customer_id === user.customerId);
  assert.ok(created, "expected a new mock booking for this customer/listing to have been written");
  assert.equal(created.booking_status, "pending");
  assert.equal(created.scheduled_slot, firstSlot.dataset.slot);
});
