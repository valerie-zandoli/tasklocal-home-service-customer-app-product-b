import { getSupabase, isSupabaseConfigured } from "./supabaseClient.js";
import { DEMO_USERS } from "./demo-users.js";
import { filterListings } from "./utils.js";

const SESSION_KEY = "tasklocal_session";
const MOCK_BOOKINGS_KEY = "tasklocal_mock_bookings";
const MOCK_USERS_KEY = "tasklocal_mock_signups";

// Supabase/PostgREST error text ranges from already-friendly ("Invalid login
// credentials") to raw internals a schema change could alter tomorrow (a
// constraint name, a JWT parsing error). Throwing the former straight
// through is fine and is what callers below already relied on; throwing the
// latter straight through leaks internal detail to a confused real user.
// Everything in this list is a message this app deliberately raises or a
// known-stable Supabase Auth string; anything else falls back to a generic,
// safe message instead of reaching the page verbatim.
const SAFE_ERROR_MESSAGES = [
  /^invalid login credentials$/i,
  /^user already registered$/i,
  /^email not confirmed$/i,
  /^password should be at least/i,
  /^that time slot has already passed$/i,
  /^that time slot is no longer available for this listing$/i,
  /^not authorized to book as this customer$/i,
  /^a booking can only be rated once it is completed\.?$/i,
];

// Supabase Auth's error_code (not its free-text message, which changes
// wording across versions) for a couple of cases worth a specific,
// actionable message rather than the generic fallback below -- found live
// while testing signUp() against the real project: an oddly-formatted but
// syntactically valid address can come back as "email_address_invalid" (a
// user mistake worth naming), and this project's Free-tier email sending
// has a very low rate limit, so "over_email_send_rate_limit" is a real,
// expected case during a demo, not an internal error.
const SAFE_ERROR_CODES = {
  email_address_invalid: "That email address looks invalid — double-check it and try again.",
  over_email_send_rate_limit: "Too many sign-up attempts in a short time. Please try again in a few minutes.",
};

function toUserMessage(error) {
  const code = error?.code || error?.error_code;
  if (code && SAFE_ERROR_CODES[code]) return SAFE_ERROR_CODES[code];
  const message = error?.message || String(error);
  if (SAFE_ERROR_MESSAGES.some((re) => re.test(message))) return message;
  return "Something went wrong on our end. Please try again in a moment.";
}

function readMockUsers() {
  const stored = localStorage.getItem(MOCK_USERS_KEY);
  return stored ? JSON.parse(stored) : [];
}
function writeMockUsers(rows) {
  localStorage.setItem(MOCK_USERS_KEY, JSON.stringify(rows));
}

// Cached per page load (a fresh navigation always gets fresh data): without
// this, typing in the search box re-fetched and re-parsed listings.json on
// every debounced keystroke, and fetchMyBookings() re-fetched it on every
// render() call (e.g. after submitting a rating).
let _mockListingsCache = null;

async function readMockListings() {
  if (_mockListingsCache) return _mockListingsCache;
  const res = await fetch("data/listings.json");
  _mockListingsCache = await res.json();
  return _mockListingsCache;
}

async function readMockBookings() {
  const stored = localStorage.getItem(MOCK_BOOKINGS_KEY);
  if (stored) return JSON.parse(stored);
  const res = await fetch("data/bookings.json");
  const rows = await res.json();
  localStorage.setItem(MOCK_BOOKINGS_KEY, JSON.stringify(rows));
  return rows;
}

function writeMockBookings(rows) {
  localStorage.setItem(MOCK_BOOKINGS_KEY, JSON.stringify(rows));
}

// ── Auth ─────────────────────────────────────────────────────────────────

export async function login(email, password) {
  if (!email || !password) {
    throw new Error("Enter both an email and a password.");
  }

  if (isSupabaseConfigured()) {
    const supabase = await getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(toUserMessage(error));
    return { email: data.user.email };
  }

  // Mock mode has two sources of accounts: the four fixed demo users, and
  // anyone who has signed up locally via signUp() below (stored under
  // MOCK_USERS_KEY so it survives a page reload the same way MOCK_BOOKINGS
  // does).
  const user = [...DEMO_USERS, ...readMockUsers()].find((u) => u.email === email && u.password === password);
  if (!user) throw new Error("Incorrect email or password.");
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ email: user.email, displayName: user.displayName, customerId: user.customerId })
  );
  return user;
}

// Until this pass, the only way into the app was one of the four fixed demo
// accounts — a genuinely new visitor had no way to create their own account.
// Supabase mode: auth.signUp() creates the auth.users row; backend/schema.sql's
// handle_new_customer_signup trigger provisions the matching customers/
// customer_profiles rows server-side in the same instant (see that trigger's
// own comment for why it's gated on display_name being present). Whether a
// session comes back immediately depends on this project's email-
// confirmation setting, which this function doesn't assume either way —
// callers should check needsEmailConfirmation and route accordingly.
export async function signUp({ email, password, displayName }) {
  if (!email || !password || !displayName) {
    throw new Error("Enter your name, email, and a password.");
  }
  if (password.length < 8) {
    throw new Error("Password should be at least 8 characters.");
  }

  if (isSupabaseConfigured()) {
    const supabase = await getSupabase();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    if (error) throw new Error(toUserMessage(error));
    return { email, needsEmailConfirmation: !data.session };
  }

  const allUsers = [...DEMO_USERS, ...readMockUsers()];
  if (allUsers.some((u) => u.email === email)) {
    throw new Error("An account with that email already exists.");
  }
  const customerId = "cust_" + crypto.randomUUID().slice(0, 8);
  const newUser = { email, password, displayName, customerId };
  writeMockUsers([...readMockUsers(), newUser]);
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(newUser));
  return { email, needsEmailConfirmation: false };
}

export async function logout() {
  if (isSupabaseConfigured()) {
    const supabase = await getSupabase();
    await supabase.auth.signOut();
  }
  sessionStorage.removeItem(SESSION_KEY);
}

export async function getSession() {
  if (isSupabaseConfigured()) {
    const supabase = await getSupabase();
    const { data } = await supabase.auth.getSession();
    if (!data.session) return null;
    // maybeSingle(), not single(): a user with no linked customer_profiles
    // row (shouldn't happen via the documented seed flow, but is possible if
    // someone signs up outside it) must not throw here.
    const { data: profile, error } = await supabase
      .from("customer_profiles")
      .select("*")
      .eq("user_id", data.session.user.id)
      .maybeSingle();
    if (error) {
      console.error("Could not load customer profile:", error.message);
    }
    return {
      email: data.session.user.email,
      displayName: profile?.display_name || data.session.user.email,
      customerId: profile?.customer_id || null,
    };
  }
  const raw = sessionStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

// ── Listings ─────────────────────────────────────────────────────────────

// PostgREST's .or() filter string treats `,` `.` `(` `)` as syntax -- wrap
// the value in double quotes (its own documented escape) so a search term
// containing any of those can't be mistaken for another filter clause. `\`
// and `"` inside the quoted value must themselves be backslash-escaped.
function escapeOrFilterValue(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// A whole-phrase substring match (the previous behavior) fails realistic
// queries -- "apartment clean this week" won't match a listing whose title
// is just "Move-Out Cleaning" even though a customer typing that phrase
// clearly wants it. Splitting into words and matching if ANY word appears
// (OR, not AND -- a customer describing extra context shouldn't have to
// match all of it) is what a real customer's phrasing needs. Empty entries
// from repeated whitespace are dropped so trailing spaces don't produce a
// clause matching everything.
function searchWords(search) {
  return search.trim().split(/\s+/).filter(Boolean);
}

// Listings render as one unbounded fetch used to mean every matching row
// came back and got rendered in one shot -- harmless at today's dataset
// size, but nothing capped it from growing into a huge single response and
// DOM as the shared catalog grows. fetchListings() now returns at most one
// page; page-listings.js's "Load more" re-calls with a growing `offset`.
export const LISTINGS_PAGE_SIZE = 24;

export async function fetchListings({ serviceType, maxPrice, search, offset = 0 } = {}) {
  if (isSupabaseConfigured()) {
    // serviceType/maxPrice/search (title or description, case-insensitive)
    // are all applied server-side now; listings_title_trgm_idx and
    // listings_description_trgm_idx (backend/schema.sql) keep the ilike
    // scans indexed as the table grows.
    const supabase = await getSupabase();
    let query = supabase.from("listings").select("*");
    if (serviceType) query = query.eq("service_type", serviceType);
    if (maxPrice) query = query.lte("hourly_rate", maxPrice);
    const words = search ? searchWords(search) : [];
    if (words.length > 0) {
      const clause = words
        .map((word) => {
          const pattern = `%${escapeOrFilterValue(word)}%`;
          return `title.ilike."${pattern}",description.ilike."${pattern}"`;
        })
        .join(",");
      query = query.or(clause);
    }
    // .range() applies after every filter above, so this paginates the
    // filtered result set, not the raw table.
    query = query.range(offset, offset + LISTINGS_PAGE_SIZE - 1);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    // filterListings() is a no-op safety net here (the server already
    // applied every one of these filters) -- kept so behavior can't silently
    // diverge between real and mock mode.
    return filterListings(data, { serviceType, maxPrice, search });
  }
  const rows = await readMockListings();
  const filtered = filterListings(rows, { serviceType, maxPrice, search });
  return filtered.slice(offset, offset + LISTINGS_PAGE_SIZE);
}

export async function fetchListing(listingId) {
  if (isSupabaseConfigured()) {
    const supabase = await getSupabase();
    // maybeSingle(), not single(): a missing listing is an expected case
    // (removed/typo'd id), not an error — callers check for a null return.
    const { data, error } = await supabase
      .from("listings")
      .select("*")
      .eq("listing_id", listingId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }
  const rows = await readMockListings();
  return rows.find((r) => r.listing_id === listingId) || null;
}

// ── Bookings ─────────────────────────────────────────────────────────────

// Which of a listing's slots are already claimed by *some* booking, so the
// listing-detail page can hide them rather than let a customer pick one and
// only find out it's taken after create_booking_with_schedule rejects it.
// Only timestamps come back, never booking_id/customer_id — see
// get_booked_slots (backend/schema.sql) for why that split matters.
export async function fetchBookedSlots(listingId) {
  if (isSupabaseConfigured()) {
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc("get_booked_slots", { p_listing_id: listingId });
    if (error) throw new Error(error.message);
    return data || [];
  }
  const rows = await readMockBookings();
  return rows
    .filter((r) => r.listing_id === listingId && r.booking_status !== "draft" && r.scheduled_slot)
    .map((r) => r.scheduled_slot);
}

export function randomBookingId() {
  // crypto, not Math.random: still a 6-digit id (matches the team's bkg_XXXXXX
  // format), so collisions are possible at scale — createBooking() below
  // retries on a collision rather than relying on id-space size alone.
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const n = (bytes[0] * 2 ** 24 + bytes[1] * 2 ** 16 + bytes[2] * 2 ** 8 + bytes[3]) >>> 0;
  return "bkg_" + String(n % 1_000_000).padStart(6, "0");
}

export function randomCommissionTotal(hourlyRate) {
  const commission = 0.1 + Math.random() * 0.1; // 10-20%, matches the team's shared schema
  return Math.round(hourlyRate * (1 + commission) * 100) / 100;
}

const MAX_BOOKING_ID_ATTEMPTS = 5;

// Single RPC call, not two separate inserts: create_booking_with_schedule
// (backend/schema.sql) runs both inserts in one transaction, so a failure
// partway through can't leave an orphaned booking with no recorded time
// slot. total_cost is omitted — the bookings_set_total_cost trigger computes
// it server-side, so a tampered client value can't reach the database.
//
// Retries on a genuine booking_id collision (23505 = unique_violation) with
// a fresh id, up to MAX_BOOKING_ID_ATTEMPTS times — create_booking_with_schedule
// itself already rules out "this is my own retry" via its idempotency check,
// so a 23505 here means the id collided with an unrelated booking.
async function attemptBookingInsert(supabase, { id, customerId, listingId, scheduledSlot }) {
  for (let attempt = 1; attempt <= MAX_BOOKING_ID_ATTEMPTS; attempt++) {
    const { data, error } = await supabase.rpc("create_booking_with_schedule", {
      p_booking_id: id,
      p_customer_id: customerId,
      p_listing_id: listingId,
      p_scheduled_slot: scheduledSlot,
    });
    if (!error) {
      return { ...data, scheduled_slot: scheduledSlot };
    }
    if (error.code !== "23505" || attempt === MAX_BOOKING_ID_ATTEMPTS) {
      throw new Error(error.message);
    }
    id = randomBookingId();
  }
}

export async function createBooking({ customerId, listingId, hourlyRate, scheduledSlot, bookingId }) {
  if (!customerId) {
    throw new Error("Your account isn't linked to a customer profile yet — contact support.");
  }
  if (!listingId || !(hourlyRate > 0) || !scheduledSlot) {
    throw new Error("Missing booking details.");
  }

  if (isSupabaseConfigured()) {
    const supabase = await getSupabase();
    // A caller-supplied bookingId (see page-listing.js) is reused across a
    // manual retry so create_booking_with_schedule's idempotency check can
    // recognize it as the same attempt, not a new booking. Only regenerate
    // on an actual 23505 collision inside attemptBookingInsert.
    const id = bookingId || randomBookingId();
    return attemptBookingInsert(supabase, { id, customerId, listingId, scheduledSlot });
  }

  const rows = await readMockBookings();
  let id = bookingId;
  const existing = id ? rows.find((r) => r.booking_id === id) : null;
  if (existing) {
    // Mirrors the real-mode idempotency check: a retry with the same id for
    // the same customer/listing returns the existing row.
    if (existing.customer_id === customerId && existing.listing_id === listingId) {
      return existing;
    }
    id = null; // collided with someone else's mock booking — regenerate below
  }
  const existingIds = new Set(rows.map((r) => r.booking_id));
  let attempts = 0;
  while ((!id || existingIds.has(id)) && attempts < MAX_BOOKING_ID_ATTEMPTS) {
    id = randomBookingId();
    attempts++;
  }
  if (existingIds.has(id)) {
    throw new Error("Could not generate a unique booking id — please try again.");
  }

  const row = {
    booking_id: id,
    customer_id: customerId,
    listing_id: listingId,
    booking_status: "pending",
    total_cost: randomCommissionTotal(hourlyRate),
    rating: null,
    scheduled_slot: scheduledSlot,
  };
  rows.push(row);
  writeMockBookings(rows);
  return row;
}

export async function fetchMyBookings(customerId) {
  if (!customerId) return [];

  if (isSupabaseConfigured()) {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("bookings")
      .select("*, listings(title, service_type), booking_schedules(scheduled_slot)")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    // PostgREST embeds a to-one relation as an object when it can prove
    // uniqueness (booking_schedules.booking_id is that table's primary key),
    // but normalize defensively in case it's returned as a single-item array.
    return data.map((row) => {
      const schedule = Array.isArray(row.booking_schedules)
        ? row.booking_schedules[0]
        : row.booking_schedules;
      return { ...row, scheduled_slot: schedule?.scheduled_slot || null };
    });
  }

  const rows = await readMockBookings();
  const listings = await readMockListings();
  const byId = Object.fromEntries(listings.map((l) => [l.listing_id, l]));
  return rows
    .filter((r) => r.customer_id === customerId)
    .map((r) => ({ ...r, listings: byId[r.listing_id] || null }))
    .reverse();
}

export async function rateBooking(bookingId, rating) {
  if (!(rating >= 1 && rating <= 5)) {
    throw new Error("Rating must be between 1 and 5.");
  }
  if (isSupabaseConfigured()) {
    const supabase = await getSupabase();
    const { error } = await supabase.from("bookings").update({ rating }).eq("booking_id", bookingId);
    if (error) throw new Error(error.message);
    return;
  }
  const rows = await readMockBookings();
  const row = rows.find((r) => r.booking_id === bookingId);
  if (row) row.rating = rating;
  writeMockBookings(rows);
}
