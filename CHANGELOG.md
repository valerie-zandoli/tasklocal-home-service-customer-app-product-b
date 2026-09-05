# Changelog

Milestone-level summary, not a commit-by-commit mirror — `git log` already is that. Grouped by working session; each entry names the theme, not every individual commit.

## 2026-09-04 — Self-service sign-up, closing the live safety_team exposure, four fresh-eyes fix rounds

- Added a real sign-up path (`signup.html`/`page-signup.js`) — until today the only way into the app was one of four fixed demo accounts. `handle_new_customer_signup` (new Postgres trigger) provisions the matching `customers`/`customer_profiles` rows the instant `auth.signUp()` creates the `auth.users` row.
- Closed two live trigger-level gaps an adversarial review found: an authenticated customer could previously set an arbitrary `total_cost` or a premature `rating` via a direct API call, bypassing the app's normal RPC/UI paths. Both fixed in `backend/schema.sql`.
- **Closed the `safety_team` privilege escalation** flagged since 2026-09-02: `alex.rivera@example.com`'s erroneous `app_metadata.role` is now cleared (confirmed `NULL` via a live query) — no longer read-*and-write* access to five shared tables through the account the README told reviewers to log in with first.
- Applied the above as one migration (`backend/sql/2026-09-04-signup-and-trigger-hardening.sql`) against the live shared database, authorized directly by the product owner. Getting it typed into the Supabase SQL Editor without corruption took real troubleshooting — an intermittent editor bug was silently swallowing newlines mid-paste; worked around by writing the statements with no embedded line breaks at all.
- Fixed a real bug the daily scheduled data-integrity check caught same-day: three seed availability slots had aged into the past across three mirrored data files.
- Two rounds of independent fresh-eyes review immediately followed the fix pass, each finding and closing one real, new problem per round: (1) an unescaped `booking_id` reaching a DOM attribute on the My Bookings page (self-XSS, RLS-scoped — CodeQL `js/xss-through-dom`); (2) `signUp()`'s mock-mode path storing a real visitor's actual password as plaintext in browser storage (CodeQL `js/clear-text-storage-of-sensitive-data`) — now hashed; (3) the sign-up confirmation message was nested inside the form element hidden on success, so it silently disappeared along with the form on the exact path a real sign-up normally takes, given this project's Supabase instance sends real confirmation emails.
- Smaller fixes: screen-reader announcements (`aria-live`) on the listings search results and empty state, a real branded 404 page (the routing already pointed at one; the file didn't exist), a three-major-version-stale GitHub Action pin corrected.
- Test suite: 123 → 144 unit tests (all passing). A further fresh-eyes review found the Tier 2/3 totals README quoted had been wrong for a while, not just stale from today — corrected to a precise, directly-verified 198 across all three tiers (144 + 20 + 34), rather than the "~191"/"~193" estimates two different sections of README previously, and inconsistently, gave.
- `frontend/sw.js`'s offline precache list was missing today's two new pages (`signup.html`, `404.html`) and `page-signup.js` — found by the same review; added.

## 2026-09-03 — Accessibility consolidation + suite-wide audit follow-through

- Added a dedicated Accessibility section to this README, and a consolidated cross-product accessibility section to the team's four-product audit report.
- Added `SCHEMA.md`: a proposed shared cross-repo reference for every table, RPC function, and RLS policy this product touches — the gap that let `bookings_safety_team_select` (Product D's mechanism) go unmentioned in this repo's own schema.
- Added `frontend/js/error-reporter.js`, wired into every page: uncaught errors and unhandled promise rejections are now kept in `sessionStorage` (readable via `window.TASKLOCAL_ERROR_LOG`) instead of vanishing with the tab.
- Added a scheduled workflow running the live-database RLS/concurrency test suite on a real cadence, closing a gap where that suite had only ever been run by hand.
- Extracted `attemptBookingInsert()` out of `createBooking()` in `frontend/js/api.js` — same behavior, easier to scan.
- Added a "definition of done" checklist to `PRESENTATION.md` and a minimal support/contact pointer to the app.
- Saved three ad-hoc Supabase SQL queries under `backend/sql/` instead of leaving them as unsaved SQL Editor tabs; running one turned up that the `safety_team` role reaches five shared tables, not the one originally documented.
- Added weekly CI trend logging for page-weight/load-time/FCP numbers, plus a real Slow-4G-throttled Playwright test. Attempted real mutation-testing coverage (Stryker) and abandoned it — its dependency tree pulls in a vulnerable `qs` with no available fix, which would have broken this repo's own `npm audit` CI gate.
- Fresh-eyes retest found and fixed two real gaps in this same day's own additions: the "Need help?" nav link and `error-reporter.js` both had zero test coverage; writing the latter's tests surfaced a real bug (`location.pathname` instead of `window.location.pathname`, the only place in this codebase not going through `window.location` explicitly). Visual regression baselines regenerated for the resulting mobile nav-height change.

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
