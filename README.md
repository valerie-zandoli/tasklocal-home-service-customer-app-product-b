# Product B, Customer (demand) Web and Mobile Application for TaskLocal Home-Service

[![Tests](https://github.com/valerie-zandoli/tasklocal-home-service-customer-app-product-b/actions/workflows/test.yml/badge.svg)](https://github.com/valerie-zandoli/tasklocal-home-service-customer-app-product-b/actions/workflows/test.yml)

**Live demo:** [tasklocal-home-service-customer-app.vercel.app](https://tasklocal-home-service-customer-app.vercel.app) — running in local demo mode (bundled JSON + `localStorage`, no live Supabase project behind it). Log in with one of the four demo accounts on the login screen.

## Overview
**Product B, Customer (demand) Web and Mobile Application for TaskLocal Home-Service** is the demand-side interface for TaskLocal, a two-sided local marketplace connecting independent home-service providers (house cleaning, Handy People services, moving help) with local customers who need that work done. TaskLocal takes a commission on each booking made through the platform.

## Target User
This product is built for **busy local residents booking home services** — for example, a working professional or renter who needs to find, compare, and book a trustworthy provider for a one-off or recurring job (a deep apartment cleaning, a small repair, help moving) without cold-calling or texting multiple providers to compare price and availability.

## Role in the Four-Product Suite
Product B is the primary, customer-facing entry point to the marketplace. It lets customers browse vetted provider listings, filter by service type, price, and availability, and securely book services. It works alongside the other three products in the team's suite as follows:

* **Product A (Provider App):** Where independent service providers create listings and manage incoming bookings.
* **Product B (Customer App — This Repo):** Where customers discover, schedule, and pay for services.
* **Product C (Matching Chatbot):** Helps customers describe custom jobs in their own words and matches them to relevant provider listings.
* **Product D (Trust & Safety Dashboard):** Lets the internal team monitor flagged listings and bookings and maintain quality control across the platform.

All four products share a common data schema (customers, listings, providers, bookings, ratings, and safety reports) agreed on by the team.

---

## Architecture

- **Frontend** (`frontend/`): plain HTML/CSS/JavaScript (no build step), deployed on Vercel. Works on both desktop and mobile browsers — it's a responsive site, not two separate codebases. Supports light and dark mode automatically via `prefers-color-scheme`.
- **Backend** (`backend/`): PostgreSQL via Supabase. `backend/schema.sql` defines the tables (matching the team's shared data schema exactly) and Row Level Security policies. `backend/seed_data.sql` loads the team's synthetic dataset. JSON copies of the same data live in `backend/data/` and `frontend/data/` (the frontend copies are used as a local fallback — see "Run it locally" below).
- Auth is Supabase Auth (email + password). Four demo accounts (Valerie, Joan, Lady D, Sarah) are seeded via `backend/scripts/seed-demo-users.mjs` so the whole team can log in and click through without setting up their own accounts.
- Shared pure logic (HTML-escaping, listing filters, currency formatting via `Intl.NumberFormat`) lives in `frontend/js/utils.js` rather than being copy-pasted per page, and is unit-tested in `frontend/js/utils.test.mjs`.
- Branding: `frontend/assets/logo.svg` — a simple, colorful NYC brownstone mark — is the favicon (with a `favicon-32.png` fallback for browsers that don't support SVG favicons) on every page, and appears in the nav bar and on the login screen. One SVG source; edit it there if the mark ever changes.
- Each page sets light/dark `<meta name="theme-color">` tags (matching `styles.css`'s `--bg` values) so supported mobile browsers tint their own chrome/status bar to match instead of defaulting to white or black.
- `frontend/robots.txt` disallows all crawling — keeps this login-gated synthetic-data app out of search results now that it's deployed to a real, public Vercel URL (see Section 3 below).
- `frontend/manifest.json` (linked from every page) makes the app installable — "Add to Home Screen" / standalone window — with `assets/logo.svg` plus 192×192 and 512×512 PNG fallbacks (Chrome's install criteria specifically want a PNG, not just an SVG marked `sizes="any"`), plus a separate `purpose: "maskable"` icon pair (`logo-maskable.svg` → `icon-maskable-*.png`) scaled down and centered with padding so Android's adaptive-icon mask can't clip the house's roofline.
- `frontend/sw.js`, registered by `frontend/js/register-sw.js` on every page, is what actually makes that installability work reliably and gives the app real offline support (network-first, falling back to the last-cached copy of the app shell) — the manifest/icons alone don't guarantee either without a service worker present. It only handles same-origin GETs, so it never intercepts Supabase auth/RPC calls.
- `vercel.json` sets a strict Content-Security-Policy (`script-src`/`style-src 'self'`, no `'unsafe-inline'` — the app has zero inline `<script>` or `style="..."` left anywhere, on purpose; `connect-src` is scoped to just `*.supabase.co`, since ES module loading like the `esm.sh` import is a `script-src` concern, not `connect-src`) plus `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and a `Permissions-Policy` disabling camera/mic/geolocation/payment/USB/FLoC. **This only takes effect on an actual Vercel deployment** — it's not read by local demo mode's `python3 -m http.server`. Confirmed live via response headers on the deployed URL above.
- `.github/workflows/test.yml` runs `node --test frontend/js/*.test.mjs` on every push/PR — no dependency install needed, since the tests only use Node's built-in test runner.
- **Current status: the frontend is deployed to Vercel in local demo mode, not against a live Supabase project** — there's no current intention to load live data. Section 2 below is written for if/when that changes; skip straight to Section 1 for how this actually runs today.

## Data quality note

The synthetic `bookings.csv` from the team's shared dataset references 42 `listing_id`s that don't exist in `listings.csv` (the two files look like they were generated in separate runs). Those 42 rows were **dropped** before seeding — `backend/seed_data.sql` only contains the 58 bookings whose `customer_id` and `listing_id` both cross-reference real rows. Worth flagging back to Joan since her `generate.py` is the source of the dataset.

## Security

**A note on scope: most of this section describes real Supabase mode.** The live demo linked above runs in local/mock mode, which has no server at all — every "protection" mock mode has is a client-side convention the app's own UI follows (`frontend/js/api.js` computing `total_cost` itself, the rating form only appearing on completed bookings, etc.), not an enforced boundary. A visitor to the live demo can open the browser console and directly rewrite `localStorage`'s `tasklocal_mock_bookings` key to fabricate a booking, set an arbitrary price, or self-assign a rating — nothing server-side stops that in mock mode, unlike the RLS policies and triggers described below, which only run in real Supabase mode.

- No secret keys, passwords, or API keys are committed to this repo. `frontend/js/config.js` only ever holds the Supabase **anon** key, which is meant to be public (Supabase enforces access with Row Level Security, not by hiding this key) — see `backend/schema.sql` for the actual policies.
- The Supabase **service role** key (which bypasses RLS) is only ever read from an environment variable in `backend/scripts/seed-demo-users.mjs`, run locally, and is never written to a file that gets committed. `.gitignore` excludes `.env`.
- Row Level Security means a signed-in customer can only read/write their own bookings and profile — not anyone else's.
- All form inputs (login, search/filter, booking, rating) are validated before use so unexpected input can't break the app.
- `total_cost` is never trusted from the client: a booking's price is computed from the listing's real `hourly_rate` by a Postgres trigger (`bookings_set_total_cost` in `backend/schema.sql`) on insert, so a tampered client request can't set an arbitrary price. Mock (local demo) mode mirrors this by computing the total in `frontend/js/api.js` rather than accepting it as a parameter.
- `booking_status` on a new booking is forced to `'pending'` server-side (`bookings_enforce_new_status` trigger) for any authenticated client request, so a customer can't self-insert a booking as already `'completed'`.
- The RLS `UPDATE` policy on `bookings` has a matching `WITH CHECK`, and a trigger (`bookings_protect_update`) additionally rejects any authenticated-client update that touches `customer_id`, `listing_id`, `total_cost`, or `booking_status` — a signed-in customer can only ever change their own booking's `rating`, even via a direct API call that bypasses the app's UI.
- Demo account passwords in `frontend/js/demo-users.js` are the **real** passwords for the matching Supabase Auth accounts once you run `seed-demo-users.mjs`, tied to teammates' real `@pursuit.org` addresses — they're shipped in a public JS file by design, for a class demo with synthetic data. Rotate these (or use different, throwaway passwords) before this project ever holds real user data, since a public repo + a real email + a written password is a real credential-reuse risk if anyone reuses that password elsewhere. `login.html`'s demo-account buttons look the password up from that in-memory array rather than exposing it via an HTML attribute, so it's at least not sitting in the rendered page source — but the source file itself is still public.
- The email/password `<input>`s on `login.html` intentionally have no `name` attribute (the JS reads them by `id`) — with a `name`, a browser falling back to native form submission (JS blocked or failed to load) would leak the password into the URL as a GET query string.
- Creating a booking writes to two tables (`bookings`, then `booking_schedules`). That's done via one Postgres function, `create_booking_with_schedule` (`backend/schema.sql`), called through `supabase.rpc(...)` — not two separate client-side inserts. A function call runs inside a single transaction, so a failure partway through can't leave an orphaned booking with no recorded time slot the way two sequential round-trips could (**atomicity**).
- Separately, that same function is **idempotent** on `booking_id`: if the call already committed once but the client never saw the response (dropped connection, timeout), a retry carrying the same `booking_id`/`customer_id`/`listing_id` returns the existing booking instead of erroring or creating a duplicate. `page-listing.js` generates the `booking_id` once per slot selection and reuses it across a manual "Book" retry so this actually applies. Scope of what that covers: it protects a retry on the *same page load* (click "Book" again after seeing an error). It does **not** survive a page reload or tab crash between the lost response and the retry — `pendingBookingId` lives in a plain JS variable, not persisted storage, so a reload resets it and a subsequent retry gets a fresh id. In the rare case the original call had actually silently succeeded, that specific sequence (lost response → reload → retry) could still produce a duplicate booking.

## Known limitations

- `backend/schema.sql`'s RLS policies, triggers, and functions (including `create_booking_with_schedule`'s atomicity/idempotency behavior) are written for a real Supabase/Postgres deployment but haven't been exercised against one — there's no live Supabase project for this presentation, so `frontend/js/api.test.mjs` and `utils.test.mjs` (pure logic only) are the tests that actually run today. If this project is ever deployed for real, run the "Real Supabase mode only" checklist item below first.
- No slot-locking: booking a time doesn't remove it from a listing's `availability_slots`, so two customers could still pick the same slot. `booking_schedules` (see `backend/schema.sql`) now at least *records* which slot each customer picked — it previously wasn't stored anywhere at all.
- In real Supabase mode, `fetchListings()`'s `search` filter is applied client-side after fetching all rows matching `serviceType`/`maxPrice` (`frontend/js/api.js`) — fine at this dataset's size, but it isn't a server-side/indexed text search, so it wouldn't scale to a large catalog as-is.
- `booking_schedules` and the removal of `chatbot_requests.customer_id` are decisions Product B made locally, not yet confirmed with Products A/C/D — worth a quick team sync before the joint presentation, since integration is coming up.
- `vercel.json`'s Content-Security-Policy has been confirmed live (response headers checked, and the full login → browse → book → My Bookings flow walked end-to-end with zero console errors on the deployed URL), but only by manual review and a single pass through the core flow — not a `Content-Security-Policy-Report-Only` run against varied real traffic.
- `.github/workflows/test.yml` now has a `deploy` job that runs `vercel deploy --prod` only after the `test` job succeeds, using a `VERCEL_TOKEN` repo secret. **Vercel's own Git-integration auto-deploy hasn't been turned off yet**, though — until that's done in the Vercel dashboard (Settings → Git → Ignored Build Step), both paths fire on every push to `main`: Vercel's immediate, ungated one, and this new gated one a bit later. The gated one isn't actually the sole path to production yet; it's running in parallel with the thing it's meant to replace.

---

## Getting started — step by step

### 1. Run it locally right now (no setup required)

The app ships with a **local demo mode**: if no Supabase project is configured, it automatically reads from the JSON files in `frontend/data/` and stores bookings in your browser's `localStorage`. This is the fastest way to see it working.

```bash
cd frontend
python3 -m http.server 8901
```

Open `http://localhost:8901` in a browser, and log in with one of the four demo buttons on the login screen (Valerie / Joan / Lady D / Sarah — click a name to auto-fill the email and password).

### 2. Set up the real backend (Supabase) — optional, not needed for the current presentation

1. Create a free project at [supabase.com](https://supabase.com).
2. In the Supabase dashboard, open the **SQL Editor** and run, in order: `backend/schema.sql`, then `backend/seed_data.sql`, then `backend/seed_demo_bookings.sql` (gives the 4 demo accounts a mix of pending/confirmed/completed bookings to click through instead of an empty screen).
3. In **Project Settings → API**, copy your Project URL and `anon` `public` key.
4. Paste them into `frontend/js/config.js`:
   ```js
   window.APP_CONFIG = {
     SUPABASE_URL: "https://your-project-ref.supabase.co",
     SUPABASE_ANON_KEY: "your-anon-key",
   };
   ```
5. Create the four demo sign-ins in Supabase Auth:
   ```bash
   cd backend
   npm install
   SUPABASE_URL=https://your-project-ref.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
   npm run seed:users
   ```
   (Find the service role key in the same Project Settings → API page — never put it in `frontend/`.)

Reload the frontend and it will now talk to your real Supabase database instead of the local JSON fallback.

### 3. Deploy to Vercel

Already done — see the live demo link at the top of this README, and this repo is Git-connected to that Vercel project. **A push to `main` deploys it automatically** — don't also run `vercel --prod` by hand after pushing; that creates a second, redundant production deployment for the same commit instead of doing anything useful. (Found out the hard way: several rounds of this project's history did exactly that.)

**This means CI does not currently gate deployment.** `.github/workflows/test.yml` running tests and Vercel deploying to production are two independent systems that both react to the same `git push` — Vercel's deploy fires immediately, regardless of whether the test job passes or fails afterward. Seeing the CI badge go green is not confirmation that what's live is what passed; it just happens to usually be the same commit. See "Known limitations" below for what closing that gap would take.

(From a fresh clone: push this repo to GitHub, then in Vercel "Add New Project" → import it — `vercel.json` already points Vercel at the `frontend/` folder, so no extra config is needed. That one-time setup is what wires up the auto-deploy-on-push behavior described above.)

### 4. Run the automated tests

```bash
node --test frontend/js/*.test.mjs
```
Covers the pricing/booking-id logic and the shared `escapeHtml`/`filterListings` helpers (Node 20+; see the note at the top of each test file). This does **not** cover `backend/schema.sql`'s RLS policies, triggers, or functions — those need a real Supabase project (see "Known limitations" above).

### 5. Testing checklist before you call it done

- [ ] Log in with each of the 4 demo accounts.
- [ ] Browse listings; filter by service type, search text, and max price.
- [ ] Open a listing, pick a time slot, and book it — confirm it shows up under "My Bookings" with the correct scheduled time.
- [ ] Confirm a completed booking can be rated 1–5 and the rating persists.
- [ ] Log out and confirm you're redirected to the login screen, and that visiting `listings.html` directly while logged out redirects you back to login.
- [ ] Resize the browser to a phone width and confirm the layout still reads cleanly.
- [ ] Switch your OS/browser to dark mode and confirm text stays readable (status pills, badges, buttons all have dark-mode colors defined in `frontend/css/styles.css`), and — on a supported mobile browser — that the address bar/status bar tints to match.
- [ ] Open DevTools → Application → Service Workers and confirm `sw.js` shows as activated, then reload with the network throttled to "Offline" and confirm the app shell still loads. (Claude Code's own sandboxed preview can't register service workers at all — this needs a real browser tab.)
- [ ] Log out, then click the browser's Back button: confirm you land on (or stay on) the login screen rather than briefly seeing a previous page's real data.
- [ ] (Real Supabase mode only) As a signed-in customer, try updating a booking's `total_cost` or `booking_status` via a direct `supabase.from('bookings').update(...)` call in the browser console — it should be rejected by `bookings_protect_update`.

