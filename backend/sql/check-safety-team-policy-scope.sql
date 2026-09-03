-- Diagnostic, read-only, safe to run anytime. Run in the Supabase SQL Editor
-- against the live shared project (not something the app or CI runs).
--
-- Written while investigating the alex.rivera@example.com / safety_team
-- finding (see README.md "Known limitations" and SCHEMA.md) to answer:
-- exactly which tables and policies does the safety_team role reach, not
-- just the one policy (bookings_safety_team_select) this repo's own
-- schema.sql happened to surface first.
--
-- Result as of 2026-09-03: SIX policies across FIVE tables, not just
-- bookings -- a wider blast radius than earlier documentation stated:
--   bookings          | bookings_safety_team_select          | SELECT
--   chatbot_requests  | chatbot_requests_safety_team_select  | SELECT
--   customers         | customers_safety_team_select         | SELECT
--   listings          | listings_safety_team_select          | SELECT  (listings is already public read anyway -- no incremental exposure)
--   trust_safety      | trust_safety_safety_team_select      | SELECT
--   trust_safety      | trust_safety_safety_team_update_flag_status | UPDATE
-- None of these six are defined in this repo's backend/schema.sql -- they
-- live only in the live database, almost certainly created by Product D's
-- own Trust & Safety Dashboard setup for its real reviewer accounts. The
-- policies themselves look intentional and reasonable for an actual
-- safety-team reviewer; the bug is narrowly that alex.rivera@example.com
-- (a Product-B-owned demo *customer* login) holds that role at all.
select tablename, policyname, cmd
from pg_policies
where qual::text ilike '%safety_team%' or with_check::text ilike '%safety_team%'
order by tablename;
