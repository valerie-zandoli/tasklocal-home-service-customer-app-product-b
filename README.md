# Product B: Customer Web & Mobile (Demand)

## Overview
**TaskLocal Customer App** is the demand-side interface for TaskLocal, a two-sided local marketplace connecting independent home-service providers (house cleaning, handyman work, moving help) with local customers who need that work done. TaskLocal takes a commission on each booking made through the platform.

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

- **Frontend** (`frontend/`): plain HTML/CSS/JavaScript (no build step), deployed on Vercel. Works on both desktop and mobile browsers — it's a responsive site, not two separate codebases.
- **Backend** (`backend/`): PostgreSQL via Supabase. `backend/schema.sql` defines the tables (matching the team's shared data schema exactly) and Row Level Security policies. `backend/seed_data.sql` loads the team's synthetic dataset. JSON copies of the same data live in `backend/data/` and `frontend/data/` (the frontend copies are used as a local fallback — see "Run it locally" below).
- Auth is Supabase Auth (email + password). Four demo accounts (Valerie, Joan, Lady D, Sarah) are seeded via `backend/scripts/seed-demo-users.mjs` so the whole team can log in and click through without setting up their own accounts.

## Data quality note

The synthetic `bookings.csv` from the team's shared dataset references 42 `listing_id`s that don't exist in `listings.csv` (the two files look like they were generated in separate runs). Those 42 rows were **dropped** before seeding — `backend/seed_data.sql` only contains the 58 bookings whose `customer_id` and `listing_id` both cross-reference real rows. Worth flagging back to Joan since her `generate.py` is the source of the dataset.

## Security

- No secret keys, passwords, or API keys are committed to this repo. `frontend/js/config.js` only ever holds the Supabase **anon** key, which is meant to be public (Supabase enforces access with Row Level Security, not by hiding this key) — see `backend/schema.sql` for the actual policies.
- The Supabase **service role** key (which bypasses RLS) is only ever read from an environment variable in `backend/scripts/seed-demo-users.mjs`, run locally, and is never written to a file that gets committed. `.gitignore` excludes `.env`.
- Row Level Security means a signed-in customer can only read/write their own bookings and profile — not anyone else's.
- All form inputs (login, search/filter, booking, rating) are validated before use so unexpected input can't break the app.

---

## Getting started — step by step

### 1. Run it locally right now (no setup required)

The app ships with a **local demo mode**: if no Supabase project is configured, it automatically reads from the JSON files in `frontend/data/` and stores bookings in your browser's `localStorage`. This is the fastest way to see it working.

```bash
cd frontend
python3 -m http.server 8901
```

Open `http://localhost:8901` in a browser, and log in with one of the four demo buttons on the login screen (Valerie / Joan / Lady D / Sarah — click a name to auto-fill the email and password).

### 2. Set up the real backend (Supabase)

1. Create a free project at [supabase.com](https://supabase.com).
2. In the Supabase dashboard, open the **SQL Editor** and run the contents of `backend/schema.sql`, then `backend/seed_data.sql`.
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

1. Push this repo to GitHub (already done — see the repo link).
2. In Vercel, "Add New Project" → import this repo. `vercel.json` already points Vercel at the `frontend/` folder, so no extra config is needed.
3. Deploy. Your live URL will serve `frontend/index.html`.

### 4. Testing checklist before you call it done

- [ ] Log in with each of the 4 demo accounts.
- [ ] Browse listings; filter by service type, search text, and max price.
- [ ] Open a listing, pick a time slot, and book it — confirm it shows up under "My Bookings".
- [ ] Confirm a completed booking can be rated 1–5 and the rating persists.
- [ ] Log out and confirm you're redirected to the login screen, and that visiting `listings.html` directly while logged out redirects you back to login.
- [ ] Resize the browser to a phone width and confirm the layout still reads cleanly.

