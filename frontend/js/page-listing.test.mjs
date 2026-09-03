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

// A real listing_id used only by this test, not BOOKABLE_LISTING_ID --
// api.js caches frontend/data/listings.json in module-level state on first
// fetch and never re-fetches (see readMockListings()'s comment in api.js),
// so mutating this listing's slots here permanently affects every later
// test's view of it too. Using a listing no other test in this file reads
// means that mutation can't corrupt BOOKABLE_LISTING_ID's own 2-slot data,
// regardless of run order.
const NO_SLOTS_LISTING_ID = "lst_402426";

test("a listing with no open slots offers a link back to similar listings instead of a dead end", async () => {
  setupDom(JSDOM, LISTING_HTML, { url: `http://localhost/listing.html?id=${NO_SLOTS_LISTING_ID}` });
  signIn();
  let serviceType;
  installFetchStub((pathname, data) => {
    if (pathname === "/data/listings.json") {
      const listing = data.find((l) => l.listing_id === NO_SLOTS_LISTING_ID);
      serviceType = listing.service_type;
      listing.availability_slots = [];
    }
    return data;
  });

  await importPageListing();
  await new Promise((r) => setTimeout(r, 50));

  assert.equal(document.querySelectorAll(".slot-btn").length, 0);
  const link = document.querySelector(".empty-state a");
  assert.ok(link, "expected a link inside the empty-state message");
  assert.match(link.textContent, /browse similar listings/i);
  assert.equal(link.getAttribute("href"), `listings.html?service_type=${serviceType}`);
});

test("renders listing details and one button per real, still-open availability slot", async () => {
  setupDom(JSDOM, LISTING_HTML, { url: `http://localhost/listing.html?id=${BOOKABLE_LISTING_ID}` });
  signIn();
  installFetchStub();

  await importPageListing();
  await new Promise((r) => setTimeout(r, 50));

  assert.match(document.querySelector("h1").textContent, /Move-Out Cleaning/);
  assert.match(document.querySelector(".detail-price").textContent, /^\$\d/);
  const slotButtons = document.querySelectorAll(".slot-btn");
  // lst_343432 has 2 real availability_slots, but frontend/data/bookings.json
  // seeds a real, live demo booking (bkg_900001) on one of them
  // (2026-10-03T15:00:00Z) -- that slot must not render as bookable here.
  assert.equal(slotButtons.length, 1, "expected the already-booked demo slot to be hidden, leaving 1 open");
  assert.equal(slotButtons[0].dataset.slot, "2026-09-30T15:00:00Z");
  const bookBtn = document.getElementById("book-btn");
  assert.equal(bookBtn.disabled, true, "nothing selected yet, so booking should start disabled");
});

test("hides a slot that's already claimed by a non-draft booking, leaving the other one bookable", async () => {
  setupDom(JSDOM, LISTING_HTML, { url: `http://localhost/listing.html?id=${BOOKABLE_LISTING_ID}` });
  signIn();
  installFetchStub();
  // lst_343432's two real availability_slots are 2026-10-03T15:00:00Z and
  // 2026-09-30T15:00:00Z (see this file's BOOKABLE_LISTING_ID comment) --
  // claim the first with someone else's pending booking before the page
  // ever loads.
  localStorage.setItem(
    MOCK_BOOKINGS_KEY,
    JSON.stringify([
      {
        booking_id: "bkg_taken",
        customer_id: "cust_someone_else",
        listing_id: BOOKABLE_LISTING_ID,
        booking_status: "pending",
        total_cost: 90,
        rating: null,
        scheduled_slot: "2026-10-03T15:00:00Z",
      },
    ])
  );

  await importPageListing();
  await new Promise((r) => setTimeout(r, 50));

  const slotButtons = document.querySelectorAll(".slot-btn");
  assert.equal(slotButtons.length, 1, "expected the already-booked slot to be hidden");
  assert.equal(slotButtons[0].dataset.slot, "2026-09-30T15:00:00Z", "expected the still-open slot to remain bookable");
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
  // Matched on scheduled_slot too, not just listing/customer: seed data
  // (frontend/data/bookings.json) already has an existing booking for this
  // same customer/listing (bkg_900001, on the *other* slot), so matching on
  // listing/customer alone could find that pre-existing row instead of the
  // one this test just created.
  const created = stored.find(
    (b) => b.listing_id === BOOKABLE_LISTING_ID && b.customer_id === user.customerId && b.scheduled_slot === firstSlot.dataset.slot
  );
  assert.ok(created, "expected a new mock booking for this customer/listing/slot to have been written");
  assert.equal(created.booking_status, "pending");
});
