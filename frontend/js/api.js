import { getSupabase, isSupabaseConfigured } from "./supabaseClient.js";
import { DEMO_USERS } from "./demo-users.js";
import { filterListings } from "./utils.js";

const SESSION_KEY = "tasklocal_session";
const MOCK_BOOKINGS_KEY = "tasklocal_mock_bookings";

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
    if (error) throw new Error(error.message);
    return { email: data.user.email };
  }

  const user = DEMO_USERS.find((u) => u.email === email && u.password === password);
  if (!user) throw new Error("Incorrect email or password.");
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ email: user.email, displayName: user.displayName, customerId: user.customerId })
  );
  return user;
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

export async function fetchListings({ serviceType, maxPrice, search } = {}) {
  if (isSupabaseConfigured()) {
    // serviceType/maxPrice are applied server-side; `search` has no index to
    // query against yet, so it's applied client-side same as mock mode.
    const supabase = await getSupabase();
    let query = supabase.from("listings").select("*");
    if (serviceType) query = query.eq("service_type", serviceType);
    if (maxPrice) query = query.lte("hourly_rate", maxPrice);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return filterListings(data, { search });
  }
  const res = await fetch("data/listings.json");
  const rows = await res.json();
  return filterListings(rows, { serviceType, maxPrice, search });
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
  const res = await fetch("data/listings.json");
  const rows = await res.json();
  return rows.find((r) => r.listing_id === listingId) || null;
}

// ── Bookings ─────────────────────────────────────────────────────────────

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
    // on an actual 23505 collision below.
    let id = bookingId || randomBookingId();
    for (let attempt = 1; attempt <= MAX_BOOKING_ID_ATTEMPTS; attempt++) {
      // Single RPC call, not two separate inserts: create_booking_with_schedule
      // (backend/schema.sql) runs both inserts in one transaction, so a
      // failure partway through can't leave an orphaned booking with no
      // recorded time slot. total_cost is omitted — the bookings_set_total_cost
      // trigger computes it server-side, so a tampered client value can't
      // reach the database.
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
      // 23505 = unique_violation on booking_id — a genuine collision with an
      // unrelated booking (create_booking_with_schedule already ruled out
      // "this is my own retry"). Try a fresh id.
      id = randomBookingId();
    }
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
  const listingsRes = await fetch("data/listings.json");
  const listings = await listingsRes.json();
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
