// Run manually with: node --test frontend/js/live/rls-policies.test.mjs
// Deliberately NOT matched by `frontend/js/*.test.mjs` (the glob CI runs on
// every push) -- everything here makes real HTTP calls against the live,
// shared Supabase project (see frontend/js/config.js), and one test writes
// a real row that only backend/scripts/cleanup-live-test-data.mjs can remove
// (see that test's own comment below for why). See known-issues.test.mjs in
// this same directory for the one test deliberately split out of this file
// because it's expected to keep failing until an external, already-tracked
// fix lands. Running this on every push
// would hammer the team's shared project and create side effects on a
// schedule nobody chose. Run it by hand, or wire it into a separate,
// deliberately-scheduled (not on-push) workflow if that's ever wanted.
//
// Raw fetch() against Supabase's REST/Auth HTTP API, not the
// @supabase/supabase-js client: this suite only needs a handful of HTTP
// calls, and avoiding the client keeps this project's one real dependency
// (jsdom, per README.md's "Architecture") from growing an unrelated second
// one just for a script that never ships to a browser.
//
// What this proves that no other test in this repo does: frontend/js/
// api-supabase.test.mjs checks that api.js *sends* the right query shape,
// against a hand-built fake client -- it can't prove the database actually
// *enforces* anything. This suite is the one place that does, against the
// real, live RLS policies, triggers, and grants in backend/schema.sql.

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

async function rest(method, tablePathAndQuery, { token, body, prefer } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tablePathAndQuery}`, {
    method,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token || ANON_KEY}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { status: res.status, data };
}

async function rpc(name, args, { token } = {}) {
  return rest("POST", `rpc/${name}`, { token, body: args });
}

const [alex, jordan, , taylor] = DEMO_USERS;
let alexToken, jordanToken, taylorToken;

// Jordan and Taylor, not Alex, are this suite's two "ordinary customer"
// accounts for the cross-isolation tests below -- see the dedicated test
// further down for why Alex specifically is excluded on purpose, not by
// oversight.
test("setup: sign in as three demo customers", async () => {
  alexToken = await signIn(alex.email, alex.password);
  jordanToken = await signIn(jordan.email, jordan.password);
  taylorToken = await signIn(taylor.email, taylor.password);
  assert.ok(alexToken && jordanToken && taylorToken, "expected all three demo accounts to authenticate");
});

test("anonymous (no session) can read listings — the one intentionally public table", async () => {
  const { status, data } = await rest("GET", "listings?select=listing_id&limit=1");
  assert.equal(status, 200);
  assert.ok(Array.isArray(data) && data.length > 0, "expected at least one publicly-readable listing");
});

test("anonymous (no session) reading bookings returns zero rows, not an error", async () => {
  const { status, data } = await rest("GET", "bookings?select=booking_id&limit=5");
  assert.equal(status, 200, "RLS should silently filter, not reject, a SELECT with no matching rows");
  assert.deepEqual(data, []);
});

test("anonymous (no session) reading customer_profiles returns zero rows", async () => {
  const { status, data } = await rest("GET", "customer_profiles?select=user_id&limit=5");
  assert.equal(status, 200);
  assert.deepEqual(data, []);
});

test("anonymous (no session) cannot call create_booking_with_schedule — PUBLIC execute was revoked this session", async () => {
  const { status, data } = await rpc("create_booking_with_schedule", {
    p_booking_id: "bkg_should_never_exist",
    p_customer_id: alex.customerId,
    p_listing_id: "lst_343432",
    p_scheduled_slot: "2027-01-01T10:00:00Z",
  });
  assert.notEqual(status, 200, `expected the call to be rejected; got ${status}: ${JSON.stringify(data)}`);
});

test("anonymous (no session) cannot call get_booked_slots — PUBLIC execute was revoked this session", async () => {
  const { status } = await rpc("get_booked_slots", { p_listing_id: "lst_343432" });
  assert.notEqual(status, 200, "expected the call to be rejected for an anonymous caller");
});

test("a signed-in customer's own bookings query never includes another customer's row", async () => {
  const { status, data } = await rest("GET", "bookings?select=booking_id,customer_id", { token: taylorToken });
  assert.equal(status, 200);
  for (const row of data) {
    assert.equal(row.customer_id, taylor.customerId, `Taylor's own query returned a row belonging to ${row.customer_id}`);
  }
});

test("a signed-in customer cannot read a specific booking that belongs to someone else", async () => {
  const mine = await rest("GET", "bookings?select=booking_id&limit=1", { token: jordanToken });
  assert.ok(mine.data.length > 0, "need at least one of Jordan's own bookings to pick a real id from");
  const someoneElsesBookingId = mine.data[0].booking_id;

  const { status, data } = await rest("GET", `bookings?select=booking_id&booking_id=eq.${someoneElsesBookingId}`, { token: taylorToken });
  assert.equal(status, 200);
  assert.deepEqual(data, [], "Taylor should not be able to see Jordan's booking by guessing its id");
});

test("a signed-in customer updating another customer's rating affects zero rows, not an error", async () => {
  const theirs = await rest("GET", "bookings?select=booking_id&limit=1", { token: jordanToken });
  assert.ok(theirs.data.length > 0);
  const jordanBookingId = theirs.data[0].booking_id;

  const { status, data } = await rest("PATCH", `bookings?booking_id=eq.${jordanBookingId}`, {
    token: taylorToken,
    body: { rating: 1 },
    prefer: "return=representation",
  });
  assert.equal(status, 200, "RLS should silently exclude the row, not error");
  assert.deepEqual(data, [], "Taylor's update should not have touched Jordan's booking");
});

test("a signed-in customer cannot change total_cost or booking_status on their own booking via a raw PATCH", async () => {
  const mine = await rest("GET", `bookings?select=booking_id,total_cost&customer_id=eq.${taylor.customerId}&limit=1`, { token: taylorToken });
  assert.ok(mine.data.length > 0, "need at least one of Taylor's own bookings");
  const { booking_id, total_cost } = mine.data[0];

  const { status, data } = await rest("PATCH", `bookings?booking_id=eq.${booking_id}`, {
    token: taylorToken,
    body: { total_cost: 0.01 },
    prefer: "return=representation",
  });
  // bookings_protect_update raises an exception (not a silent RLS filter)
  // for this one, since it's the customer's own row -- the trigger is what
  // blocks it, not ownership.
  assert.notEqual(status, 200, `expected the price-tamper attempt to be rejected; got ${status}: ${JSON.stringify(data)}`);
  assert.notEqual(total_cost, 0.01, "sanity check: this booking's price wasn't already 1 cent going in");
});

// Alex Rivera specifically -- not Jordan, Morgan, or Taylor -- carries an
// app_metadata.role of "safety_team" on this shared Supabase project (found
// by this exact test suite: the three tests above originally used Alex and
// failed, since her session can read all ~106 bookings platform-wide, not
// just her own). See known-issues.test.mjs in this same directory for the
// dedicated, deliberately-still-failing regression test that documents this
// -- moved there so a live CI run of this file isn't red every time for a
// known, external, already-tracked issue. alexToken stays wired up in this
// file's own setup since the two tests below still need a real
// authenticated-customer session, and Alex is as good as any of the four
// for that purpose.

// No role this suite can authenticate as has DELETE on `bookings` -- there
// is no delete policy in backend/schema.sql at all (customers can create
// and update their own booking's rating, never delete history), which is
// the correct, deliberate design, not a gap. That means this test's own
// cleanup can't run as a customer the way every other test's can; the row
// it creates is real and permanent until swept by
// backend/scripts/cleanup-live-test-data.mjs (needs the service role key,
// same pattern as backend/scripts/seed-demo-users.mjs). A fresh id per run
// (rather than one fixed id) means repeat runs never collide with a row an
// earlier run left behind.
test("a signed-in customer cannot self-insert a booking already marked completed — enforce_new_booking_status forces pending", async () => {
  const testId = `bkg_livetest_${Date.now()}`;
  const { status, data } = await rest("POST", "bookings", {
    token: alexToken,
    prefer: "return=representation",
    body: {
      booking_id: testId,
      customer_id: alex.customerId,
      listing_id: "lst_343432",
      booking_status: "completed",
      total_cost: 50,
    },
  });
  assert.equal(status, 201, `expected the insert itself to succeed; got ${status}: ${JSON.stringify(data)}`);
  assert.equal(data[0].booking_status, "pending", "expected the trigger to force this to pending regardless of what was requested");
});

test("a signed-in customer CAN call get_booked_slots (granted to authenticated, unlike anon above)", async () => {
  const { status, data } = await rpc("get_booked_slots", { p_listing_id: "lst_343432" }, { token: alexToken });
  assert.equal(status, 200, `expected a signed-in customer to be allowed; got ${status}: ${JSON.stringify(data)}`);
  assert.ok(Array.isArray(data));
});

// Same permanent-row caveat and bkg_livetest_ convention as the "already
// marked completed" test above -- this is the INSERT-side sibling of that
// test's UPDATE-side neighbor two tests up. That earlier test proves a
// signed-in customer can't PATCH total_cost on a booking that already
// exists; this proves they can't smuggle an arbitrary total_cost in on
// *creation* either, by calling POST /rest/v1/bookings directly instead of
// going through create_booking_with_schedule (the app's only normal path).
// Found by the 2026-09-04 adversarial review; closed by scoping
// set_booking_total_cost()'s "trust the supplied value" branch to
// non-authenticated callers only (backend/schema.sql).
test("a signed-in customer cannot set an arbitrary total_cost by inserting a booking directly", async () => {
  const testId = `bkg_livetest_${Date.now()}_price`;
  const { status, data } = await rest("POST", "bookings", {
    token: alexToken,
    prefer: "return=representation",
    body: {
      booking_id: testId,
      customer_id: alex.customerId,
      listing_id: "lst_343432",
      booking_status: "pending",
      total_cost: 0.01,
    },
  });
  assert.equal(status, 201, `expected the insert itself to succeed; got ${status}: ${JSON.stringify(data)}`);
  assert.notEqual(data[0].total_cost, 0.01, "expected the trigger to recompute the price, not trust the supplied 1 cent");
});

// Rating-gating sibling of the total_cost/booking_status PATCH test above.
// Found by the same review; closed by protect_booking_update() rejecting a
// rating change on any booking not already 'completed' (backend/schema.sql).
test("a signed-in customer cannot rate a booking that isn't completed yet", async () => {
  const mine = await rest(
    "GET",
    `bookings?select=booking_id,booking_status&customer_id=eq.${taylor.customerId}&booking_status=neq.completed&limit=1`,
    { token: taylorToken }
  );
  assert.ok(mine.data.length > 0, "need at least one of Taylor's own non-completed bookings for this check");
  const { booking_id } = mine.data[0];

  const { status, data } = await rest("PATCH", `bookings?booking_id=eq.${booking_id}`, {
    token: taylorToken,
    body: { rating: 5 },
    prefer: "return=representation",
  });
  assert.notEqual(status, 200, `expected the premature rating to be rejected; got ${status}: ${JSON.stringify(data)}`);
});
