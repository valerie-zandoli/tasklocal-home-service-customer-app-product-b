// Run with: node --test frontend/js/api-mock-mode.test.mjs
// Needs jsdom, unlike api.test.mjs's pure-function tests: login()'s field
// validation and logout() both need sessionStorage. Surfaced by turning on
// Node's built-in --experimental-test-coverage for the first time this
// session and finding these were the two genuine gaps in api.js (as
// opposed to page-index.js/page-login.js/page-listing.js/page-listings.js,
// whose coverage numbers are misleadingly low for an unrelated reason -- see
// the comment in .github/workflows/test.yml).

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { login, logout, createBooking, fetchMyBookings, rateBooking } from "./api.js";
import { DEMO_USERS } from "./demo-users.js";
import { installFetchStub } from "./test-helpers.mjs";

const SESSION_KEY = "tasklocal_session";
const MOCK_BOOKINGS_KEY = "tasklocal_mock_bookings";

function setupDom() {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost/" });
  global.window = dom.window;
  global.document = dom.window.document;
  global.sessionStorage = dom.window.sessionStorage;
  global.localStorage = dom.window.localStorage;
}

test("login() rejects an empty email without ever checking credentials", async () => {
  setupDom();
  await assert.rejects(() => login("", "some-password"), /Enter both an email and a password/);
});

test("login() rejects an empty password without ever checking credentials", async () => {
  setupDom();
  await assert.rejects(() => login("real.user@example.com", ""), /Enter both an email and a password/);
});

test("logout() clears the stored session", async () => {
  setupDom();
  const user = DEMO_USERS[0];
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ email: user.email, displayName: user.displayName, customerId: user.customerId })
  );

  await logout();

  assert.equal(sessionStorage.getItem(SESSION_KEY), null);
});

test("createBooking() rejects a missing customerId before touching storage", async () => {
  setupDom();
  await assert.rejects(
    () => createBooking({ customerId: null, listingId: "lst_1", hourlyRate: 50, scheduledSlot: "2026-10-01T10:00:00Z" }),
    /customer profile/
  );
});

test("createBooking() rejects missing listing/rate/slot details", async () => {
  setupDom();
  await assert.rejects(
    () => createBooking({ customerId: "cust_1", listingId: null, hourlyRate: 50, scheduledSlot: "2026-10-01T10:00:00Z" }),
    /Missing booking details/
  );
  await assert.rejects(
    () => createBooking({ customerId: "cust_1", listingId: "lst_1", hourlyRate: 0, scheduledSlot: "2026-10-01T10:00:00Z" }),
    /Missing booking details/
  );
  await assert.rejects(
    () => createBooking({ customerId: "cust_1", listingId: "lst_1", hourlyRate: 50, scheduledSlot: null }),
    /Missing booking details/
  );
});

test("createBooking() in mock mode writes a new pending booking to localStorage", async () => {
  setupDom();
  localStorage.removeItem(MOCK_BOOKINGS_KEY);
  installFetchStub();

  const row = await createBooking({
    customerId: "cust_60227",
    listingId: "lst_343432",
    hourlyRate: 83.52,
    scheduledSlot: "2026-10-03T15:00:00Z",
  });

  assert.equal(row.booking_status, "pending");
  assert.equal(row.customer_id, "cust_60227");
  const stored = JSON.parse(localStorage.getItem(MOCK_BOOKINGS_KEY));
  assert.ok(stored.some((b) => b.booking_id === row.booking_id));
});

test("createBooking() in mock mode is idempotent: retrying the same bookingId for the same customer/listing returns the existing row instead of creating a second one", async () => {
  setupDom();
  localStorage.removeItem(MOCK_BOOKINGS_KEY);
  installFetchStub();

  const first = await createBooking({
    bookingId: "bkg_111111",
    customerId: "cust_60227",
    listingId: "lst_343432",
    hourlyRate: 83.52,
    scheduledSlot: "2026-10-03T15:00:00Z",
  });
  const retry = await createBooking({
    bookingId: "bkg_111111",
    customerId: "cust_60227",
    listingId: "lst_343432",
    hourlyRate: 83.52,
    scheduledSlot: "2026-10-03T15:00:00Z",
  });

  assert.deepEqual(first, retry);
  const stored = JSON.parse(localStorage.getItem(MOCK_BOOKINGS_KEY));
  assert.equal(stored.filter((b) => b.booking_id === "bkg_111111").length, 1, "expected exactly one booking, not a duplicate");
});

test("createBooking() in mock mode generates a fresh id when the caller-supplied one collides with someone else's booking", async () => {
  setupDom();
  localStorage.setItem(
    MOCK_BOOKINGS_KEY,
    JSON.stringify([
      { booking_id: "bkg_222222", customer_id: "cust_someone_else", listing_id: "lst_other", booking_status: "pending", total_cost: 10, rating: null, scheduled_slot: null },
    ])
  );
  installFetchStub();

  const row = await createBooking({
    bookingId: "bkg_222222",
    customerId: "cust_60227",
    listingId: "lst_343432",
    hourlyRate: 83.52,
    scheduledSlot: "2026-10-03T15:00:00Z",
  });

  assert.notEqual(row.booking_id, "bkg_222222", "expected a regenerated id, not a collision with someone else's booking");
});

test("fetchMyBookings() in mock mode filters by customer, joins each booking's real listing, and returns newest first", async () => {
  setupDom();
  installFetchStub();
  localStorage.setItem(
    MOCK_BOOKINGS_KEY,
    JSON.stringify([
      { booking_id: "bkg_a", customer_id: "cust_60227", listing_id: "lst_343432", booking_status: "pending", total_cost: 90, rating: null, scheduled_slot: null },
      { booking_id: "bkg_b", customer_id: "cust_someone_else", listing_id: "lst_402426", booking_status: "pending", total_cost: 50, rating: null, scheduled_slot: null },
      { booking_id: "bkg_c", customer_id: "cust_60227", listing_id: "lst_402426", booking_status: "confirmed", total_cost: 70, rating: null, scheduled_slot: null },
    ])
  );

  const bookings = await fetchMyBookings("cust_60227");

  assert.deepEqual(bookings.map((b) => b.booking_id), ["bkg_c", "bkg_a"], "expected only this customer's bookings, newest first");
  assert.equal(bookings[0].listings.title, "Furniture Moving Assistance");
});

test("fetchMyBookings() returns an empty array without touching storage when there's no customerId", async () => {
  setupDom();
  assert.deepEqual(await fetchMyBookings(null), []);
});

test("rateBooking() rejects a rating outside 1-5", async () => {
  setupDom();
  await assert.rejects(() => rateBooking("bkg_1", 0), /Rating must be between 1 and 5/);
  await assert.rejects(() => rateBooking("bkg_1", 6), /Rating must be between 1 and 5/);
});

test("rateBooking() in mock mode updates the matching booking's rating in localStorage", async () => {
  setupDom();
  localStorage.setItem(
    MOCK_BOOKINGS_KEY,
    JSON.stringify([{ booking_id: "bkg_rate_me", customer_id: "cust_60227", listing_id: "lst_343432", booking_status: "completed", total_cost: 90, rating: null, scheduled_slot: null }])
  );

  await rateBooking("bkg_rate_me", 4);

  const stored = JSON.parse(localStorage.getItem(MOCK_BOOKINGS_KEY));
  assert.equal(stored.find((b) => b.booking_id === "bkg_rate_me").rating, 4);
});
