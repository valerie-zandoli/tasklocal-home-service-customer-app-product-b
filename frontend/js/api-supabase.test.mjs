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
import { _setClientForTesting, getSupabase } from "./supabaseClient.js";
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
    or: (...args) => (calls?.or.push(args), chain),
    range: (...args) => (calls?.range.push(args), chain),
    order: (...args) => (calls?.order.push(args), chain),
    update: (...args) => (calls?.update.push(args), chain),
    maybeSingle: async () => result,
    then: (resolve) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

test("_setClientForTesting() is a no-op when `process` isn't defined (i.e. a real browser, not Node)", async () => {
  setupDom();
  const sentinelClient = { marker: "sentinel" };
  const shouldBeBlockedClient = { marker: "should-never-be-set" };

  // Establish a known baseline with process visible (the normal case).
  _setClientForTesting(sentinelClient);

  // Hide `process` to simulate a real browser, then attempt the injection
  // that should now be blocked.
  const realProcess = globalThis.process;
  // @ts-ignore -- deliberately simulating an environment with no `process`
  globalThis.process = undefined;
  try {
    _setClientForTesting(shouldBeBlockedClient);
  } finally {
    globalThis.process = realProcess;
  }

  // getSupabase() returns _client immediately if it's already truthy,
  // without ever reaching the real esm.sh import -- true whether the guard
  // above worked or not, so this stays fully offline either way. Which
  // object comes back is what actually proves the guard worked.
  const result = await getSupabase();
  assert.equal(result, sentinelClient, "the process-hidden call should not have overwritten the client");
});

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

test("signUp() in real mode passes display_name through as auth user_metadata and returns no confirmation needed when a session comes back immediately", async () => {
  setupDom();
  _setClientForTesting({
    auth: {
      signUp: async ({ email, password, options }) => {
        assert.equal(email, "new.customer@example.com");
        assert.equal(password, "a-strong-password");
        assert.deepEqual(options, { data: { display_name: "New Customer" } });
        return { data: { session: { user: { id: "auth-uid-new" } } }, error: null };
      },
    },
  });

  const result = await api.signUp({
    email: "new.customer@example.com",
    password: "a-strong-password",
    displayName: "New Customer",
  });
  assert.deepEqual(result, { email: "new.customer@example.com", needsEmailConfirmation: false });
});

test("signUp() in real mode reports needsEmailConfirmation when signUp succeeds without an immediate session", async () => {
  setupDom();
  _setClientForTesting({
    auth: {
      signUp: async () => ({ data: { session: null, user: { id: "auth-uid-pending" } }, error: null }),
    },
  });

  const result = await api.signUp({
    email: "pending.customer@example.com",
    password: "a-strong-password",
    displayName: "Pending Customer",
  });
  assert.deepEqual(result, { email: "pending.customer@example.com", needsEmailConfirmation: true });
});

test("signUp() in real mode passes a known-safe Supabase error straight through", async () => {
  setupDom();
  _setClientForTesting({
    auth: {
      signUp: async () => ({ data: null, error: { message: "User already registered" } }),
    },
  });

  await assert.rejects(
    () =>
      api.signUp({ email: "existing@example.com", password: "a-strong-password", displayName: "Existing" }),
    /User already registered/
  );
});

test("signUp() in real mode translates a known Supabase Auth error_code into a specific, actionable message", async () => {
  setupDom();
  _setClientForTesting({
    auth: {
      signUp: async () => ({
        data: null,
        error: { message: 'Email address "a@b" is invalid', code: "email_address_invalid" },
      }),
    },
  });

  await assert.rejects(
    () => api.signUp({ email: "a@b", password: "a-strong-password", displayName: "Someone" }),
    /looks invalid/
  );
});

test("signUp() in real mode genericizes an unrecognized/internal Supabase error instead of leaking it", async () => {
  setupDom();
  _setClientForTesting({
    auth: {
      signUp: async () => ({
        data: null,
        error: { message: 'duplicate key value violates unique constraint "customers_pkey"' },
      }),
    },
  });

  await assert.rejects(
    () => api.signUp({ email: "new@example.com", password: "a-strong-password", displayName: "New" }),
    /Something went wrong on our end/
  );
});

test("getSession() in real mode joins auth session with the customer_profiles row", async () => {
  setupDom();
  const calls = { select: [], eq: [], lte: [], or: [], order: [], update: [], range: [] };
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

test("getSession() in real mode logs but does not throw when the profile query errors", async () => {
  setupDom();
  const originalConsoleError = console.error;
  const loggedArgs = [];
  console.error = (...args) => loggedArgs.push(args);
  try {
    _setClientForTesting({
      auth: {
        getSession: async () => ({ data: { session: { user: { id: "auth-uid-3", email: "flaky@example.com" } } } }),
      },
      from: () => makeChain({ data: null, error: { message: "connection reset" } }, { select: [], eq: [], lte: [], or: [], order: [], update: [], range: [] }),
    });

    const session = await api.getSession();
    // A profile-lookup error shouldn't be fatal -- the session itself is
    // still valid, just without profile data to enrich it with.
    assert.equal(session.email, "flaky@example.com");
    assert.equal(session.customerId, null);
    assert.ok(
      loggedArgs.some((args) => args.some((a) => typeof a === "string" && a.includes("connection reset"))),
      "expected the profile-lookup error to be logged, not silently swallowed"
    );
  } finally {
    console.error = originalConsoleError;
  }
});

test("getSession() in real mode falls back to the auth email when no profile row exists", async () => {
  setupDom();
  _setClientForTesting({
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "auth-uid-2", email: "orphan@example.com" } } } }),
    },
    from: () => makeChain({ data: null, error: null }, { select: [], eq: [], lte: [], or: [], order: [], update: [], range: [] }),
  });

  const session = await api.getSession();
  assert.equal(session.displayName, "orphan@example.com");
  assert.equal(session.customerId, null);
});

test("fetchListings() in real mode builds .eq/.lte/.or filters server-side", async () => {
  setupDom();
  const calls = { select: [], eq: [], lte: [], or: [], order: [], update: [], range: [] };
  const rows = [
    // The server is the one doing the filtering in this mode, so the fake
    // just needs to return whatever rows it's told to -- already narrowed
    // to what a real ilike '%shelf%' would have matched, since this test is
    // about the *filter sent*, not filterListings' own client-side logic
    // (that's covered separately for mock mode).
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
  assert.deepEqual(calls.or[0], [`title.ilike."%shelf%",description.ilike."%shelf%"`]);
  // Defaults to the first page (offset 0) when no offset is given.
  assert.deepEqual(calls.range[0], [0, api.LISTINGS_PAGE_SIZE - 1]);
  assert.deepEqual(result.map((r) => r.listing_id), ["lst_2"]);
});

test("fetchListings() requests the next page via .range() when an offset is given", async () => {
  setupDom();
  const calls = { select: [], eq: [], lte: [], or: [], order: [], update: [], range: [] };
  _setClientForTesting({
    from: () => makeChain({ data: [], error: null }, calls),
  });

  await api.fetchListings({ offset: api.LISTINGS_PAGE_SIZE });

  assert.deepEqual(calls.range[0], [api.LISTINGS_PAGE_SIZE, api.LISTINGS_PAGE_SIZE * 2 - 1]);
});

test("fetchListings() escapes a search term containing PostgREST or-filter syntax characters", async () => {
  setupDom();
  const calls = { select: [], eq: [], lte: [], or: [], order: [], update: [], range: [] };
  _setClientForTesting({
    from: () => makeChain({ data: [], error: null }, calls),
  });

  // A comma or double-quote in the search term must not be able to break out
  // of the quoted ilike pattern and inject another filter clause.
  await api.fetchListings({ search: 'a,"b' });

  assert.deepEqual(calls.or[0], [`title.ilike."%a,\\"b%",description.ilike."%a,\\"b%"`]);
});

test("fetchListings() splits a multi-word search into a per-word OR clause, not one whole-phrase match", async () => {
  setupDom();
  const calls = { select: [], eq: [], lte: [], or: [], order: [], update: [], range: [] };
  _setClientForTesting({
    from: () => makeChain({ data: [], error: null }, calls),
  });

  await api.fetchListings({ search: "apartment clean" });

  assert.deepEqual(calls.or[0], [
    `title.ilike."%apartment%",description.ilike."%apartment%",title.ilike."%clean%",description.ilike."%clean%"`,
  ]);
});

test("fetchListings() treats a search of only whitespace the same as no search", async () => {
  setupDom();
  const calls = { select: [], eq: [], lte: [], or: [], order: [], update: [], range: [] };
  _setClientForTesting({
    from: () => makeChain({ data: [], error: null }, calls),
  });

  await api.fetchListings({ search: "   " });

  assert.deepEqual(calls.or, []);
});

test("fetchListings() does not call .or() when no search term is given", async () => {
  setupDom();
  const calls = { select: [], eq: [], lte: [], or: [], order: [], update: [], range: [] };
  _setClientForTesting({
    from: () => makeChain({ data: [], error: null }, calls),
  });

  await api.fetchListings({ serviceType: "cleaning" });

  assert.deepEqual(calls.or, []);
});

test("fetchBookedSlots() in real mode calls get_booked_slots with the listing id and returns its result", async () => {
  setupDom();
  let seenArgs;
  _setClientForTesting({
    rpc: async (fn, args) => {
      seenArgs = { fn, args };
      return { data: ["2026-10-03T15:00:00Z", "2026-11-01T10:00:00Z"], error: null };
    },
  });

  const slots = await api.fetchBookedSlots("lst_343432");

  assert.deepEqual(seenArgs, { fn: "get_booked_slots", args: { p_listing_id: "lst_343432" } });
  assert.deepEqual(slots, ["2026-10-03T15:00:00Z", "2026-11-01T10:00:00Z"]);
});

test("fetchBookedSlots() in real mode throws the Supabase error message on failure", async () => {
  setupDom();
  _setClientForTesting({
    rpc: async () => ({ data: null, error: { message: "function get_booked_slots does not exist" } }),
  });

  await assert.rejects(() => api.fetchBookedSlots("lst_1"), /function get_booked_slots does not exist/);
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
    from: () => makeChain({ data: rows, error: null }, { select: [], eq: [], lte: [], or: [], order: [], update: [], range: [] }),
  });

  const result = await api.fetchMyBookings("cust_1");
  assert.deepEqual(
    result.map((r) => r.scheduled_slot),
    ["2026-10-01T10:00:00Z", "2026-10-02T10:00:00Z", null]
  );
});

test("fetchListing() in real mode returns the row, or null for a missing id, without treating either as an error", async () => {
  setupDom();
  const calls = { select: [], eq: [], lte: [], or: [], order: [], update: [], range: [] };
  let requestedId;
  _setClientForTesting({
    from: (table) => {
      assert.equal(table, "listings");
      return makeChain(
        { data: requestedId === "lst_exists" ? { listing_id: "lst_exists", title: "Real Listing" } : null, error: null },
        calls
      );
    },
  });

  requestedId = "lst_exists";
  const found = await api.fetchListing("lst_exists");
  assert.equal(found.title, "Real Listing");

  requestedId = "lst_missing";
  const notFound = await api.fetchListing("lst_missing");
  assert.equal(notFound, null);
});

test("fetchListing() in real mode throws the Supabase error message when the query itself fails", async () => {
  setupDom();
  _setClientForTesting({
    from: () => makeChain({ data: null, error: { message: "relation does not exist" } }, { select: [], eq: [], lte: [], or: [], order: [], update: [], range: [] }),
  });

  await assert.rejects(() => api.fetchListing("lst_1"), /relation does not exist/);
});

test("logout() in real mode calls supabase.auth.signOut() before clearing the local session", async () => {
  setupDom();
  let signOutCalled = false;
  _setClientForTesting({
    auth: {
      signOut: async () => {
        signOutCalled = true;
      },
    },
  });
  sessionStorage.setItem("tasklocal_session", JSON.stringify({ email: "real.user@example.com" }));

  await api.logout();

  assert.equal(signOutCalled, true);
  assert.equal(sessionStorage.getItem("tasklocal_session"), null);
});

test("rateBooking() in real mode updates via Supabase and throws its error message on failure", async () => {
  setupDom();
  const calls = { select: [], eq: [], lte: [], or: [], order: [], update: [], range: [] };
  _setClientForTesting({
    from: (table) => {
      assert.equal(table, "bookings");
      return makeChain({ error: null }, calls);
    },
  });

  await api.rateBooking("bkg_1", 5);
  assert.deepEqual(calls.update[0], [{ rating: 5 }]);
  assert.deepEqual(calls.eq[0], ["booking_id", "bkg_1"]);

  _setClientForTesting({
    from: () => makeChain({ error: { message: "row-level security violation" } }, { select: [], eq: [], lte: [], or: [], order: [], update: [], range: [] }),
  });
  await assert.rejects(() => api.rateBooking("bkg_1", 5), /row-level security violation/);
});
