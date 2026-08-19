import { getSupabase, isSupabaseConfigured } from "./supabaseClient.js";
import { DEMO_USERS } from "./demo-users.js";

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
    const { data: profile } = await supabase
      .from("customer_profiles")
      .select("*")
      .eq("user_id", data.session.user.id)
      .single();
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
  let rows;
  if (isSupabaseConfigured()) {
    const supabase = await getSupabase();
    let query = supabase.from("listings").select("*");
    if (serviceType) query = query.eq("service_type", serviceType);
    if (maxPrice) query = query.lte("hourly_rate", maxPrice);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    rows = data;
  } else {
    const res = await fetch("data/listings.json");
    rows = await res.json();
    if (serviceType) rows = rows.filter((r) => r.service_type === serviceType);
    if (maxPrice) rows = rows.filter((r) => r.hourly_rate <= maxPrice);
  }
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(
      (r) => r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)
    );
  }
  return rows;
}

export async function fetchListing(listingId) {
  if (isSupabaseConfigured()) {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("listings")
      .select("*")
      .eq("listing_id", listingId)
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const res = await fetch("data/listings.json");
  const rows = await res.json();
  return rows.find((r) => r.listing_id === listingId) || null;
}

// ── Bookings ─────────────────────────────────────────────────────────────

export async function createBooking({ customerId, listingId, totalCost }) {
  if (!customerId || !listingId || !(totalCost > 0)) {
    throw new Error("Missing booking details.");
  }
  const bookingId = "bkg_" + Math.random().toString().slice(2, 8);

  if (isSupabaseConfigured()) {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("bookings")
      .insert({
        booking_id: bookingId,
        customer_id: customerId,
        listing_id: listingId,
        booking_status: "pending",
        total_cost: totalCost,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  const rows = await readMockBookings();
  const row = {
    booking_id: bookingId,
    customer_id: customerId,
    listing_id: listingId,
    booking_status: "pending",
    total_cost: totalCost,
    rating: null,
  };
  rows.push(row);
  writeMockBookings(rows);
  return row;
}

export async function fetchMyBookings(customerId) {
  if (isSupabaseConfigured()) {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("bookings")
      .select("*, listings(title, service_type)")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
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
