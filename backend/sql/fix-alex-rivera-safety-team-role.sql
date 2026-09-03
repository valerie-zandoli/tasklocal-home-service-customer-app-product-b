-- NOT YET APPLIED as of 2026-09-03 -- pending Sarah's confirmation this
-- won't collide with how Product D's real safety_team reviewer accounts
-- are provisioned (reported in #team-cycle4 and DMs the day this was
-- found). Run by hand in the Supabase SQL Editor once confirmed; nothing
-- in this repo or CI runs this automatically.
--
-- The alex.rivera@example.com Supabase Auth user (one of Product B's own
-- four demo customer accounts) currently carries app_metadata.role =
-- "safety_team". See check-safety-team-policy-scope.sql in this same
-- directory for the full list of what that role can read: bookings,
-- chatbot_requests, customers, listings, and trust_safety (SELECT), plus
-- trust_safety (UPDATE) -- not just "her own bookings," but a wide,
-- unintended read (and one write) surface across the shared database.
--
-- This removes only the "role" key from her app_metadata, leaving every
-- other claim (and every other user) untouched.
update auth.users
set raw_app_meta_data = raw_app_meta_data - 'role'
where email = 'alex.rivera@example.com';

-- Verify afterward -- should return zero rows:
-- select email, raw_app_meta_data->>'role' as role
-- from auth.users
-- where email = 'alex.rivera@example.com' and raw_app_meta_data ? 'role';
