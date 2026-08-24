// Run with: node --test frontend/js/api-supabase.test.mjs
// api.test.mjs (and every DOM test in this suite) only ever exercises
// api.js's isSupabaseConfigured() === false branches -- real Supabase mode
// has never been tested at all, mocked or otherwise, all session. Uses
// supabaseClient.js's _setClientForTesting() seam (added alongside this
// file) to inject a fake client with just enough of the real
// @supabase-js/supabase-js chainable-query-builder shape to exercise these
// code paths, entirely offline: no real network call to esm.sh, no real
// Supabase project, no experimental Node module-mocking flag.

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { _setClientForTesting } from "./supabaseClient.js";
import * as api from "./api.js";

function setupDom() {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost/" });
  global.window = dom.window;
  global.document = dom.window.document;
  global.sessionStorage = dom.window.sessionStorage;
  global.localStorage = dom.window.localStorage;
  window.APP_CONFIG = { SUPABASE_URL: "https://fake.supabase.co", SUPABASE_ANON_KEY: "fake-anon-key" };
}

// Minimal fake of the chainable query builder real supabase-js returns from
// .from(...): each chain method returns the same chain object so calls can
// be composed in any order/count the way the real methods are, and the
// chain itself is awaitable (thenable), resolving to whatever `result` the
// test configured -- mirroring `const { data, error } = await query`.
function makeChain(result, calls) {
  const chain = {
    select: (...args) => (calls?.select.push(args), chain),
    eq: (...args) => (calls?.eq.push(args), chain),
    lte: (...args) => (calls?.lte.push(args), chain),
    order: (...args) => (calls?.order.push(args), chain),
    update: (...args) => (calls?.update.push(args), chain),
    maybeSingle: async () => result,
    then: (resolve) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

test("login() in real mode calls supabase auth and returns the session email", async () => {
  setupDom();
  const fakeSupabase = {
    auth: {
      signInWithPassword: async ({ email, password }) => {
        assert.equal(email, "real.user@example.com");
        assert.equal(password, "correct-password");
        return { data: { user: { email } }, error: null };
      },
    },
  };
  _setClientForTesting(fakeSupabase);

  const result = await api.login("real.user@example.com", "correct-password");
  assert.deepEqual(result, { email: "real.user@example.com" });
});

test("login() in real mode throws the Supabase error message on failure", async () => {
  setupDom();
  _setClientForTesting({
    auth: {
      signInWithPassword: async () => ({ data: null, error: { message: "Invalid login credentials" } }),
    },
  });

  await assert.rejects(() => api.login("real.user@example.com", "wrong"), /Invalid login credentials/);
});

test("getSession() in real mode joins auth session with the customer_profiles row", async () => {
  setupDom();
  const calls = { select: [], eq: [], lte: [], order: [], update: [] };
  _setClientForTesting({
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "auth-uid-1", email: "real.user@example.com" } } } }),
    },
    from: (table) => {
      assert.equal(table, "customer_profiles");
      return makeChain({ data: { display_name: "Real User", customer_id: "cust_99999" }, error: null }, calls);
    },
  });

  const session = await api.getSession();
  assert.deepEqual(session, {
    email: "real.user@example.com",
    displayName: "Real User",
    customerId: "cust_99999",
  });
  assert.deepEqual(calls.eq[0], ["user_id", "auth-uid-1"]);
});

test("getSession() in real mode falls back to the auth email when no profile row exists", async () => {
  setupDom();
  _setClientForTesting({
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "auth-uid-2", email: "orphan@example.com" } } } }),
    },
    from: () => makeChain({ data: null, error: null }, { select: [], eq: [], lte: [], order: [], update: [] }),
  });

  const session = await api.getSession();
  assert.equal(session.displayName, "orphan@example.com");
  assert.equal(session.customerId, null);
});

test("fetchListings() in real mode builds .eq/.lte filters server-side and search client-side", async () => {
  setupDom();
  const calls = { select: [], eq: [], lte: [], order: [], update: [] };
  const rows = [
    { listing_id: "lst_1", title: "Deep Apartment Cleaning", description: "Full clean.", service_type: "cleaning", hourly_rate: 50 },
    { listing_id: "lst_2", title: "Shelf Mounting", description: "Mount shelves.", service_type: "cleaning", hourly_rate: 80 },
  ];
  _setClientForTesting({
    from: (table) => {
      assert.equal(table, "listings");
      return makeChain({ data: rows, error: null }, calls);
    },
  });

  const result = await api.fetchListings({ serviceType: "cleaning", maxPrice: 100, search: "shelf" });

  assert.deepEqual(calls.eq[0], ["service_type", "cleaning"]);
  assert.deepEqual(calls.lte[0], ["hourly_rate", 100]);
  // search has no server-side index (per api.js's own comment) -- applied
  // client-side via filterListings on whatever the server already filtered.
  assert.deepEqual(result.map((r) => r.listing_id), ["lst_2"]);
});

test("createBooking() in real mode retries with a fresh id on a 23505 collision, then succeeds", async () => {
  setupDom();
  let callCount = 0;
  const seenIds = [];
  _setClientForTesting({
    rpc: async (fn, args) => {
      assert.equal(fn, "create_booking_with_schedule");
      seenIds.push(args.p_booking_id);
      callCount++;
      if (callCount === 1) {
        return { data: null, error: { code: "23505", message: "unique_violation" } };
      }
      return { data: { booking_id: args.p_booking_id }, error: null };
    },
  });

  const result = await api.createBooking({
    customerId: "cust_1",
    listingId: "lst_1",
    hourlyRate: 50,
    scheduledSlot: "2026-10-01T10:00:00Z",
  });

  assert.equal(callCount, 2, "expected exactly one retry after the 23505 collision");
  assert.equal(seenIds.length, 2);
  assert.notEqual(seenIds[0], seenIds[1], "expected a fresh id on retry, not the same one resent");
  assert.equal(result.booking_id, seenIds[1]);
});

test("createBooking() in real mode does not retry on a non-collision error", async () => {
  setupDom();
  let callCount = 0;
  _setClientForTesting({
    rpc: async () => {
      callCount++;
      return { data: null, error: { code: "23503", message: "foreign key violation" } };
    },
  });

  await assert.rejects(
    () =>
      api.createBooking({
        customerId: "cust_1",
        listingId: "lst_missing",
        hourlyRate: 50,
        scheduledSlot: "2026-10-01T10:00:00Z",
      }),
    /foreign key violation/
  );
  assert.equal(callCount, 1, "a non-23505 error should fail immediately, not retry");
});

test("fetchMyBookings() in real mode normalizes booking_schedules whether PostgREST embeds it as an object or a single-item array", async () => {
  setupDom();
  const rows = [
    { booking_id: "bkg_1", customer_id: "cust_1", booking_schedules: { scheduled_slot: "2026-10-01T10:00:00Z" } },
    { booking_id: "bkg_2", customer_id: "cust_1", booking_schedules: [{ scheduled_slot: "2026-10-02T10:00:00Z" }] },
    { booking_id: "bkg_3", customer_id: "cust_1", booking_schedules: null },
  ];
  _setClientForTesting({
    from: () => makeChain({ data: rows, error: null }, { select: [], eq: [], lte: [], order: [], update: [] }),
  });

  const result = await api.fetchMyBookings("cust_1");
  assert.deepEqual(
    result.map((r) => r.scheduled_slot),
    ["2026-10-01T10:00:00Z", "2026-10-02T10:00:00Z", null]
  );
});
