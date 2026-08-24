// Run with: node --test frontend/js/utils.test.mjs
// Needs Node 20+ (see the note in api.test.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, filterListings, formatCurrency, formatServiceType, getRatingDisplayState } from "./utils.js";

test("escapeHtml neutralizes HTML-significant characters", () => {
  assert.equal(escapeHtml('<script>alert("hi")</script>'), "&lt;script&gt;alert(&quot;hi&quot;)&lt;/script&gt;");
  assert.equal(escapeHtml("Tom & Jerry's"), "Tom &amp; Jerry&#39;s");
});

test("escapeHtml treats null/undefined as empty string", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});

test("escapeHtml passes plain text through unchanged", () => {
  assert.equal(escapeHtml("Deep Apartment Cleaning"), "Deep Apartment Cleaning");
});

test("formatCurrency formats a USD amount with the $ sign and 2 decimals", () => {
  assert.equal(formatCurrency(83.52), "$83.52");
  assert.equal(formatCurrency(20), "$20.00");
});

test("formatCurrency inserts a thousands separator", () => {
  assert.equal(formatCurrency(1234.5), "$1,234.50");
});

test("formatCurrency rounds to the nearest cent", () => {
  assert.equal(formatCurrency(83.526), "$83.53");
});

test("formatServiceType maps the stored handyman category key to its display label", () => {
  assert.equal(formatServiceType("handyman"), "Handy People");
});

test("formatServiceType passes through an unmapped value unchanged", () => {
  assert.equal(formatServiceType("cleaning"), "Cleaning");
  assert.equal(formatServiceType("unknown_type"), "unknown_type");
});

const LISTINGS = [
  { listing_id: "lst_1", service_type: "cleaning", hourly_rate: 50, title: "Deep Apartment Cleaning", description: "Full clean." },
  { listing_id: "lst_2", service_type: "handyman", hourly_rate: 120, title: "Shelf Mounting", description: "Mount shelves and TVs." },
  { listing_id: "lst_3", service_type: "cleaning", hourly_rate: 90, title: "Move-Out Cleaning", description: "For rental turnover." },
];

test("filterListings with no criteria returns everything unchanged", () => {
  assert.deepEqual(filterListings(LISTINGS), LISTINGS);
});

test("filterListings filters by service_type", () => {
  const result = filterListings(LISTINGS, { serviceType: "cleaning" });
  assert.equal(result.length, 2);
  assert.ok(result.every((r) => r.service_type === "cleaning"));
});

test("filterListings filters by maxPrice (inclusive)", () => {
  const result = filterListings(LISTINGS, { maxPrice: 90 });
  assert.deepEqual(result.map((r) => r.listing_id), ["lst_1", "lst_3"]);
});

test("filterListings search matches title or description, case-insensitively", () => {
  assert.deepEqual(filterListings(LISTINGS, { search: "SHELF" }).map((r) => r.listing_id), ["lst_2"]);
  assert.deepEqual(filterListings(LISTINGS, { search: "rental" }).map((r) => r.listing_id), ["lst_3"]);
});

test("filterListings combines all three filters (AND, not OR)", () => {
  const result = filterListings(LISTINGS, { serviceType: "cleaning", maxPrice: 60, search: "apartment" });
  assert.deepEqual(result.map((r) => r.listing_id), ["lst_1"]);
});

test("getRatingDisplayState shows the rating form only for a completed, unrated booking", () => {
  assert.equal(getRatingDisplayState({ booking_status: "completed", rating: null }), "form");
});

test("getRatingDisplayState shows the existing rating once one exists, regardless of status", () => {
  assert.equal(getRatingDisplayState({ booking_status: "completed", rating: 5 }), "rated");
  // A booking can't actually be re-opened after rating in this app, but the
  // function shouldn't assume that invariant holds forever — a rating
  // present should always win over showing the form.
  assert.equal(getRatingDisplayState({ booking_status: "confirmed", rating: 3 }), "rated");
});

test("getRatingDisplayState shows nothing for a booking that isn't completed and has no rating", () => {
  assert.equal(getRatingDisplayState({ booking_status: "pending", rating: null }), "none");
  assert.equal(getRatingDisplayState({ booking_status: "confirmed", rating: null }), "none");
  assert.equal(getRatingDisplayState({ booking_status: "draft", rating: null }), "none");
});
