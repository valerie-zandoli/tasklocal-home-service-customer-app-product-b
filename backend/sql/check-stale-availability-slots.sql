-- Diagnostic, read-only, safe to run anytime. Run in the Supabase SQL
-- Editor against the live shared project.
--
-- "A listing's availability_slots entry ages into the past" is a real,
-- recurring bug class in this project's history (see CHANGELOG.md -- fixed
-- by hand well over half a dozen times across different sessions before
-- .github/workflows/test.yml got a daily schedule so frontend/js/
-- data-integrity.test.mjs's own version of this check runs on its own
-- timetable instead of only when a push happens to trigger it). That test
-- only ever reads frontend/data/listings.json, the local mock-mode copy --
-- it has no way to see staleness on the live, shared database, which is
-- what customers actually book against. Run this by hand periodically (or
-- whenever a "slot already passed" report comes in) to check the live data
-- too.
select count(*) as stale_remaining
from listings, jsonb_array_elements_text(availability_slots) as slot
where slot::timestamptz <= now();

-- To see which listings/slots specifically, instead of just the count:
-- select listing_id, slot
-- from listings, jsonb_array_elements_text(availability_slots) as slot
-- where slot::timestamptz <= now();
