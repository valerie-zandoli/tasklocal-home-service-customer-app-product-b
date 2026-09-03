# Changelog

Milestone-level summary, not a commit-by-commit mirror — `git log` already is that. Grouped by working session; each entry names the theme, not every individual commit.

## 2026-09-03 — Accessibility consolidation + suite-wide audit follow-through

- Added a dedicated Accessibility section to this README, and a consolidated cross-product accessibility section to the team's four-product audit report.
- Added `SCHEMA.md`: a proposed shared cross-repo reference for every table, RPC function, and RLS policy this product touches — the gap that let `bookings_safety_team_select` (Product D's mechanism) go unmentioned in this repo's own schema.
- Added `frontend/js/error-reporter.js`, wired into every page: uncaught errors and unhandled promise rejections are now kept in `sessionStorage` (readable via `window.TASKLOCAL_ERROR_LOG`) instead of vanishing with the tab.
- Added a scheduled workflow running the live-database RLS/concurrency test suite on a real cadence, closing a gap where that suite had only ever been run by hand.
- Extracted `attemptBookingInsert()` out of `createBooking()` in `frontend/js/api.js` — same behavior, easier to scan.
- Added a "definition of done" checklist to `PRESENTATION.md` and a minimal support/contact pointer to the app.

## 2026-09-02 — Closing the peer-testing self-review's two deferred items

- Server-side listing search (`pg_trgm` trigram index + PostgREST `.or()` filter) replacing client-side-only filtering.
- `get_booked_slots()` RPC hides already-booked time slots from the listing page instead of only rejecting the booking attempt after the fact.
- Live-database RLS and concurrency test suites added (`frontend/js/live/`), plus a Playwright browser E2E suite — the automated test count went from ~100 offline-only to ~160 across three tiers.
- A real, live finding surfaced by that new coverage: one demo account carried an unintended `safety_team` role — reported to the team, not yet resolved pending confirmation.
- 44 stale `availability_slots` entries (aged into the past on the shared live database) found and cleared; renamed to "TaskLocal | Customer Booking" to match the other three products.

## 2026-08-29 — Demo-week fixes

- Closed a same-slot double-booking race in `create_booking_with_schedule` via a transaction-scoped advisory lock.
- Routine aged-slot cleanup (recurring theme this week — see 2026-09-02 for the fix that stopped treating it as one-off).

## 2026-08-25 – 2026-08-27 — Connecting to the shared project, demo prep

- Connected to the team's real, shared Supabase project for the first time; linked Products A and D from the README.
- Added `PRESENTATION.md` with the cross-product narrative, demo date, and run of show.
- Staged a real example booking for the demo; several rounds of clearing availability slots that aged into the past between sessions.

## 2026-08-24 — Test coverage buildout, deploy hardening

- Real-Supabase-mode test coverage for `api.js` (previously untested), DOM-level tests for every page, axe-core accessibility testing (with a real issue it found, fixed), a committed WCAG contrast test.
- Production rollback script; deploy job split into deploy-then-promote so a bad deploy can never go live before its smoke test passes.
- Demo credentials switched from real teammate identities to fictional ones — closing a real credential-hygiene gap, not a hypothetical one.
- Automated data-integrity checks added, catching two real bugs on the first run.

## 2026-08-20 – 2026-08-21 — Security headers, CI, PWA

- Strict Content-Security-Policy and complementary security headers; web app manifest and service worker for real installability/offline support.
- First GitHub Actions workflow (SHA-pinned actions, read-only `GITHUB_TOKEN`); CI-gated deploy job (later fixed after an early version broke production routing — see the deploy job's own comments in `.github/workflows/test.yml` for the full story).
- Product renamed to its full current name across every user-facing surface and the schema file header.

## 2026-08-19 — MVP

- Initial Supabase-backed customer web/mobile app; two rounds of multi-persona review fixes; shared `utils.js` (`escapeHtml`, `filterListings`) with unit tests; dark mode; atomic `create_booking_with_schedule()` RPC; branding.
