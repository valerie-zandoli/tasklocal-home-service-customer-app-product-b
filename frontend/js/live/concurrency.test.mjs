// Run manually with: node --test frontend/js/live/concurrency.test.mjs
// Deliberately NOT matched by `frontend/js/*.test.mjs` (see the header
// comment in ../live/rls-policies.test.mjs for the full reasoning -- same
// suite, same "manual/scheduled, not on-push" rule, same real-money-real-
// database caveats). This is the one place in the whole test suite that
// fires genuinely concurrent requests at the live database, which is the
// only way to actually prove the advisory lock in create_booking_with_schedule
// (backend/schema.sql) serializes competing claims for real, rather than
// just reading the SQL and trusting it does.
//
// Any booking this suite successfully creates uses the "bkg_livetest_"
// prefix and is left in place -- see backend/scripts/cleanup-live-test-data.mjs
// for why (no customer-facing role has DELETE on bookings, by design) and
// how to sweep it up.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DEMO_USERS } from "../demo-users.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_TEXT = readFileSync(path.join(__dirname, "../config.js"), "utf8");
const SUPABASE_URL = CONFIG_TEXT.match(/SUPABASE_URL:\s*"([^"]+)"/)[1];
const ANON_KEY = CONFIG_TEXT.match(/SUPABASE_ANON_KEY:\s*"([^"]+)"/)[1];

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, `sign-in failed for ${email}: ${JSON.stringify(body)}`);
  return body.access_token;
}

async function rest(method, tablePathAndQuery, { token, body } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tablePathAndQuery}`, {
    method,
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token || ANON_KEY}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

async function rpc(name, args, token) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

// Picks a real, currently-open slot on a real listing by asking the live
// database itself (available slots minus already-booked ones), rather than
// hardcoding one -- so this stays correct as the shared demo data changes
// out from under it.
async function findAFreeSlot(token) {
  const { data: listings } = await rest("GET", "listings?select=listing_id,availability_slots&limit=20", { token });
  const now = new Date();
  for (const listing of listings) {
    const future = listing.availability_slots.filter((s) => new Date(s) > now);
    if (future.length === 0) continue;
    const { data: taken } = await rpc("get_booked_slots", { p_listing_id: listing.listing_id }, token);
    const takenTimes = new Set((taken || []).map((s) => new Date(s).getTime()));
    const free = future.find((s) => !takenTimes.has(new Date(s).getTime()));
    if (free) return { listingId: listing.listing_id, slot: free };
  }
  throw new Error("Couldn't find any listing with a free future slot to race for -- is the shared dataset unusually fully booked?");
}

const [alex, jordan] = DEMO_USERS;
let alexToken, jordanToken;

test("setup: sign in as two demo customers", async () => {
  alexToken = await signIn(alex.email, alex.password);
  jordanToken = await signIn(jordan.email, jordan.password);
});

test("N simultaneous booking attempts for the identical listing+slot: exactly one succeeds, the rest are cleanly rejected", async () => {
  const { listingId, slot } = await findAFreeSlot(alexToken);
  const contenders = [
    { token: alexToken, customerId: alex.customerId },
    { token: jordanToken, customerId: jordan.customerId },
    { token: alexToken, customerId: alex.customerId }, // a 3rd, distinct attempt from the same customer as #1, different booking_id
  ];

  const results = await Promise.all(
    contenders.map((c, i) =>
      rpc(
        "create_booking_with_schedule",
        {
          p_booking_id: `bkg_livetest_race${i}_${Date.now()}`,
          p_customer_id: c.customerId,
          p_listing_id: listingId,
          p_scheduled_slot: slot,
        },
        c.token
      )
    )
  );

  const succeeded = results.filter((r) => r.status === 200);
  const rejected = results.filter((r) => r.status !== 200);
  assert.equal(succeeded.length, 1, `expected exactly 1 of ${contenders.length} concurrent claims on the same slot to succeed, got ${succeeded.length}`);
  assert.equal(rejected.length, contenders.length - 1);
  for (const r of rejected) {
    assert.equal(r.data?.code, "23505", `expected a clean "slot taken" error, got ${JSON.stringify(r.data)}`);
  }
});

test("simultaneous booking attempts for DIFFERENT slots on the same listing all succeed independently — the lock is per-slot, not per-listing", async () => {
  const { data: listings } = await rest("GET", "listings?select=listing_id,availability_slots", { token: alexToken });
  const now = new Date();

  // Check candidates in turn (not just the first listing with 2+ future
  // slots in its static list -- some of those may already be booked) until
  // one is found with 2 genuinely still-open slots.
  let listingId, freeSlots;
  for (const l of listings) {
    const future = l.availability_slots.filter((s) => new Date(s) > now);
    if (future.length < 2) continue;
    const { data: taken } = await rpc("get_booked_slots", { p_listing_id: l.listing_id }, alexToken);
    const takenTimes = new Set((taken || []).map((s) => new Date(s).getTime()));
    const free = future.filter((s) => !takenTimes.has(new Date(s).getTime()));
    if (free.length >= 2) {
      listingId = l.listing_id;
      freeSlots = free.slice(0, 2);
      break;
    }
  }
  assert.ok(listingId, "couldn't find any listing with 2 genuinely free slots for this test to mean anything");

  const results = await Promise.all(
    freeSlots.map((slot, i) =>
      rpc(
        "create_booking_with_schedule",
        {
          p_booking_id: `bkg_livetest_indep${i}_${Date.now()}`,
          p_customer_id: alex.customerId,
          p_listing_id: listingId,
          p_scheduled_slot: slot,
        },
        alexToken
      )
    )
  );

  for (const r of results) {
    assert.equal(r.status, 200, `expected a claim on a genuinely distinct, unclaimed slot to succeed; got ${JSON.stringify(r.data)}`);
  }
});

test("a listing search completes in well under a second against the live, indexed database", async () => {
  const started = Date.now();
  const { status, data } = await rest(
    "GET",
    `listings?select=listing_id&or=(title.ilike."%25cleaning%25",description.ilike."%25cleaning%25")`,
    { token: alexToken }
  );
  const elapsedMs = Date.now() - started;
  assert.equal(status, 200);
  assert.ok(data.length > 0, "expected at least one match for a common search term");
  assert.ok(elapsedMs < 1000, `expected the trigram-indexed search to return in under 1000ms, took ${elapsedMs}ms`);
});
