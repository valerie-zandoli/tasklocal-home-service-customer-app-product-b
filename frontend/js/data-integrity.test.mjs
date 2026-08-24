// Run with: node --test frontend/js/data-integrity.test.mjs
// Validates the invariants that have, until now, only ever been checked ad
// hoc by hand during review rounds (orphaned foreign keys, duplicate IDs,
// frontend/backend drift) -- turning one-off spot-checks into a repeatable
// test that runs on every push via the same `node --test` command as
// everything else in this suite.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DEMO_USERS } from "./demo-users.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

function readJson(relPath) {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, relPath), "utf8"));
}

// Hand-rolled instead of a dependency: RFC 4180 quoted-field handling
// (availability_slots is a JSON array serialized inside a quoted CSV field,
// with embedded commas and "" as the escape for a literal ") is the only
// thing a naive split(",") can't handle, and the parsing rules are small
// and fixed enough not to need an external library for it.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function readCsv(relPath) {
  const text = readFileSync(path.join(REPO_ROOT, relPath), "utf8");
  const rows = parseCsv(text).filter((r) => !(r.length === 1 && r[0] === ""));
  const [headers, ...dataRows] = rows;
  return dataRows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}

const feCustomers = readJson("frontend/data/customers.json");
const feListings = readJson("frontend/data/listings.json");
const feBookings = readJson("frontend/data/bookings.json");
const beCustomers = readCsv("backend/data/customers.csv");
const beListings = readCsv("backend/data/listings.csv");
const beBookings = readCsv("backend/data/bookings.csv");

const VALID_STATUSES = ["draft", "pending", "confirmed", "completed"];
const VALID_SERVICE_TYPES = ["cleaning", "handyman", "moving", "custom"];
const DEMO_CUSTOMER_IDS = new Set(DEMO_USERS.map((u) => u.customerId));

function duplicates(values) {
  const seen = new Set();
  const dupes = new Set();
  for (const v of values) {
    if (seen.has(v)) dupes.add(v);
    seen.add(v);
  }
  return [...dupes];
}

test("customers.json and customers.csv are exact mirrors (same ids, same signup_date)", () => {
  assert.equal(feCustomers.length, beCustomers.length);
  const beById = new Map(beCustomers.map((c) => [c.customer_id, c]));
  for (const c of feCustomers) {
    const match = beById.get(c.customer_id);
    assert.ok(match, `customer ${c.customer_id} in frontend JSON but not backend CSV`);
    assert.equal(c.signup_date, match.signup_date, `signup_date mismatch for ${c.customer_id}`);
  }
});

test("listings.json and listings.csv are exact mirrors (same ids, same fields, same availability_slots)", () => {
  assert.equal(feListings.length, beListings.length);
  const beById = new Map(beListings.map((l) => [l.listing_id, l]));
  for (const l of feListings) {
    const match = beById.get(l.listing_id);
    assert.ok(match, `listing ${l.listing_id} in frontend JSON but not backend CSV`);
    assert.equal(l.title, match.title);
    assert.equal(l.service_type, match.service_type);
    assert.equal(l.provider_id, match.provider_id);
    assert.equal(Number(l.hourly_rate), Number(match.hourly_rate));
    assert.deepEqual(l.availability_slots, JSON.parse(match.availability_slots));
  }
});

test("no duplicate primary keys within any of the six data files", () => {
  assert.deepEqual(duplicates(feCustomers.map((c) => c.customer_id)), []);
  assert.deepEqual(duplicates(feListings.map((l) => l.listing_id)), []);
  assert.deepEqual(duplicates(feBookings.map((b) => b.booking_id)), []);
  assert.deepEqual(duplicates(beCustomers.map((c) => c.customer_id)), []);
  assert.deepEqual(duplicates(beListings.map((l) => l.listing_id)), []);
  assert.deepEqual(duplicates(beBookings.map((b) => b.booking_id)), []);
});

test("every frontend booking's customer_id and listing_id resolve to a real record", () => {
  const customerIds = new Set(feCustomers.map((c) => c.customer_id));
  const listingIds = new Set(feListings.map((l) => l.listing_id));
  for (const b of feBookings) {
    assert.ok(customerIds.has(b.customer_id), `booking ${b.booking_id} references missing customer ${b.customer_id}`);
    assert.ok(listingIds.has(b.listing_id), `booking ${b.booking_id} references missing listing ${b.listing_id}`);
  }
});

test("every backend booking's customer_id and listing_id resolve to a real record", () => {
  const customerIds = new Set(beCustomers.map((c) => c.customer_id));
  const listingIds = new Set(beListings.map((l) => l.listing_id));
  for (const b of beBookings) {
    assert.ok(customerIds.has(b.customer_id), `booking ${b.booking_id} references missing customer ${b.customer_id}`);
    assert.ok(listingIds.has(b.listing_id), `booking ${b.booking_id} references missing listing ${b.listing_id}`);
  }
});

// frontend/data/bookings.json is a deliberately curated subset of the full
// backend synthetic dataset (68 of 100 rows), not a 1:1 mirror like
// customers/listings -- plus a handful of hand-seeded demo-account bookings
// (bkg_900001 and friends, from backend/seed_demo_bookings.sql) that only
// ever existed in the frontend fallback, never in the base synthetic CSV.
// The invariant worth checking isn't "same row count" (expected to differ)
// but: (a) every shared booking_id has identical field values in both
// places, and (b) every booking_id that's frontend-only belongs to one of
// the 4 demo accounts, not an unexplained divergence.
test("frontend bookings.json agrees with backend bookings.csv wherever both have the same booking_id", () => {
  const beById = new Map(beBookings.map((b) => [b.booking_id, b]));
  for (const b of feBookings) {
    const match = beById.get(b.booking_id);
    if (!match) continue;
    assert.equal(b.customer_id, match.customer_id, `customer_id mismatch for ${b.booking_id}`);
    assert.equal(b.listing_id, match.listing_id, `listing_id mismatch for ${b.booking_id}`);
    assert.equal(b.booking_status, match.booking_status, `booking_status mismatch for ${b.booking_id}`);
    assert.equal(Number(b.total_cost), Number(match.total_cost), `total_cost mismatch for ${b.booking_id}`);
  }
});

test("every frontend-only booking (not present in the backend CSV) belongs to a demo account", () => {
  const beIds = new Set(beBookings.map((b) => b.booking_id));
  const frontendOnly = feBookings.filter((b) => !beIds.has(b.booking_id));
  assert.ok(frontendOnly.length > 0, "expected at least the hand-seeded demo bookings to be frontend-only");
  for (const b of frontendOnly) {
    assert.ok(
      DEMO_CUSTOMER_IDS.has(b.customer_id),
      `${b.booking_id} is frontend-only but belongs to ${b.customer_id}, not one of the 4 demo accounts`
    );
  }
});

test("booking_status is always one of the 4 known values, in both frontend and backend data", () => {
  for (const b of feBookings) assert.ok(VALID_STATUSES.includes(b.booking_status), `unexpected status on ${b.booking_id}: ${b.booking_status}`);
  for (const b of beBookings) assert.ok(VALID_STATUSES.includes(b.booking_status), `unexpected status on ${b.booking_id}: ${b.booking_status}`);
});

test("service_type is always one of the 4 values utils.js's SERVICE_TYPE_LABELS knows how to display", () => {
  for (const l of feListings) assert.ok(VALID_SERVICE_TYPES.includes(l.service_type), `unexpected service_type on ${l.listing_id}: ${l.service_type}`);
});

test("hourly_rate and total_cost are positive numbers everywhere", () => {
  for (const l of feListings) assert.ok(Number(l.hourly_rate) > 0, `non-positive hourly_rate on ${l.listing_id}`);
  for (const b of feBookings) assert.ok(Number(b.total_cost) > 0, `non-positive total_cost on ${b.booking_id}`);
});

test("rating is always null or an integer from 1 to 5", () => {
  for (const b of feBookings) {
    assert.ok(
      b.rating === null || (Number.isInteger(b.rating) && b.rating >= 1 && b.rating <= 5),
      `invalid rating on ${b.booking_id}: ${b.rating}`
    );
  }
});

// availability_slots is static seed data (generated once), but the app
// presents it to customers as open, bookable time slots on every visit --
// "today" keeps moving forward in a way this data never does. Caught 15
// listings with slots that had already passed by the time this test was
// written, letting a real visitor "book" an appointment for a date already
// gone. Deliberately compares against Date.now() at whatever moment this
// test actually runs, not a hardcoded date, so a slot that's future-dated
// today but ages into the past before the next push gets caught on that
// next CI run rather than silently sitting there indefinitely.
test("every open availability slot is still in the future as of whenever this test runs", () => {
  const now = new Date();
  for (const l of feListings) {
    for (const slot of l.availability_slots) {
      assert.ok(new Date(slot) >= now, `${l.listing_id} has a past availability slot: ${slot}`);
    }
  }
});
