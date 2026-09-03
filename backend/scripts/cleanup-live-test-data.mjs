// Deletes any real row left behind by frontend/js/live/rls-policies.test.mjs
// or frontend/js/live/concurrency.test.mjs. Those suites authenticate as
// ordinary demo customers, which -- correctly, by design -- have no DELETE
// policy on `bookings` (backend/schema.sql), so they can create a real test
// booking but can never clean it up themselves. This script can, since it
// runs as the service role, which bypasses RLS entirely.
//
// Safe to run anytime, and safe to run repeatedly: it only ever touches
// rows whose booking_id starts with the "bkg_livetest_" prefix those two
// suites always use, never real seed or demo data.
//
// Run locally, never in the browser: it needs the SERVICE ROLE key, which
// must stay out of the repo and out of any frontend code.
//
//   cd backend
//   npm install
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run cleanup:live-tests

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing env vars. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY " +
      "(Project Settings > API in the Supabase dashboard) before running this script."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase.from("bookings").delete().like("booking_id", "bkg_livetest_%").select("booking_id");

if (error) {
  console.error("Cleanup failed:", error.message);
  process.exit(1);
}

console.log(`Deleted ${data.length} leftover live-test booking(s)${data.length ? ": " + data.map((r) => r.booking_id).join(", ") : ""}.`);
