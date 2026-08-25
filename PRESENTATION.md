# TaskLocal Home-Service — joint presentation notes

One doc pulling together how the four capstone products fit as a single suite,
for use going into the joint presentation. Lives in Product B's repo because
this is where the shared-schema migration work happened; everything below
applies to all four products, not just this one.

## The four products

| | Product | Repo | Role |
|---|---|---|---|
| A | Provider App | [Joanalbayrak-111/Tasklocal-Provider-App](https://github.com/Joanalbayrak-111/Tasklocal-Provider-App) | Providers create listings, manage availability, respond to bookings |
| B | Customer App | this repo | Customers browse, filter, and book listings |
| C | Matching Chatbot | not yet shared with the team | Customers describe a job in their own words; matched to a listing |
| D | Trust & Safety Dashboard | [sarahgdykes-ux/TaskLocal-Trust-and-Safety-dashboard](https://github.com/sarahgdykes-ux/TaskLocal-Trust-and-Safety-dashboard) | Internal team reviews flagged listings/bookings |

## Demonstration date

**27 August 2026.** Ahead of the project's 30 August 2026 conclusion, so there's
a few days' buffer to react to anything the demo surfaces.

## The customer journey the demo should walk through

This is the narrative that ties all four products into one story, rather than
four unrelated demos back to back:

1. **Chatbot (C):** a customer describes a job in plain language ("my sink's
   leaking, need someone this week").
2. **Matching (C → A's data):** the chatbot maps that description to a
   `service_type` and surfaces matching listings from the shared `listings`
   table, which Product A's providers created.
3. **Booking (B):** the customer picks a listing and a time slot in the
   Customer App and books it — this writes a real row to `bookings` (and
   `booking_schedules`) in the shared database.
4. **Provider side (A):** the same booking shows up in the Provider App's
   incoming-bookings view, since both products read/write the same
   `bookings` table.
5. **Trust & Safety (D):** if a booking is disputed, a rating is low, or a
   listing gets flagged, it becomes visible in the Trust & Safety Dashboard,
   which reads the same `bookings`/`listings`/`trust_safety` tables.

Products A, B, and D all point at the same live Supabase project
(`bikimbnqtvbqzprfgzfj`), so steps 3–5 above are a real, live data flow today,
not four separate mock demos — a booking made in B is immediately visible to
A and D. Step 1–2 (the chatbot) can't be confirmed live yet — see below.

## Proposed run of show

A draft only — needs the team's sign-off, and the per-product timings are a
starting guess to adjust once everyone knows how long their own walkthrough
actually takes. Ordered to follow the customer journey above, so the four
demos read as one continuous story instead of four separate ones:

| Order | Who | What | Time |
|---|---|---|---|
| 1 | Whoever opens | Framing: one shared marketplace, one shared database, four products | 2 min |
| 2 | Lady D (C) | Chatbot: customer describes a job in plain language, gets matched to a listing | 4–5 min |
| 3 | Valerie (B) | Customer App: browse/filter that listing, pick a time slot, book it | 4–5 min |
| 4 | Joan (A) | Provider App: the booking just made in B appears in the provider's incoming bookings | 4–5 min |
| 5 | Sarah (D) | Trust & Safety Dashboard: that booking (or a flagged one) visible to the safety team | 4–5 min |
| 6 | Whoever closes | Wrap-up, what's shared infra vs. what's still per-product, Q&A | 5 min |

**~23–27 minutes total** — trim per-product time toward the low end if the actual slot is shorter.
Step 2 depends on Product C being demo-ready by the 27th; see "Open items"
below.

## Current integration status

- **Schema:** aligned across the database itself. `backend/schema.sql` in
  this repo is the schema source of truth (per agreement with the team, and
  per Product D's own README, which points back to this repo's
  `schema.sql`/`seed_data.sql`/`seed_demo_bookings.sql` for setup). The
  live database's `customers`/`listings`/`bookings` tables were migrated to
  match it exactly (keys, constraints, RLS) — see this README's "Current
  status" note under Architecture.
- **Product A (Provider App):** repo confirmed, but still an early
  in-memory prototype as of this check (in-repo `listingStore.js` pushes to
  a local JS array; no live Supabase calls found in its source yet). No
  stale-table-name risk from the rename this repo did (`Customers` →
  `customers` etc.) since A isn't querying Supabase yet — but that also means
  A→B integration (a listing A creates showing up live in B) isn't testable
  end-to-end today, only via the shared seed data both already use.
- **Product B (Customer App):** connected and verified end-to-end against
  the real database — see "Current status" in the Architecture section
  above.
- **Product C (Matching Chatbot):** no repo shared with the team as of this
  writing, so its connection status to the shared database is unknown.
  This is the biggest open gap for a coherent joint demo — worth asking Lady
  D for a repo link (or at least confirming whether it's ready to demo)
  before presentation day.
- **Product D (Trust & Safety Dashboard):** repo confirmed and its README
  describes exactly the setup this repo provides (schema, seed data, a
  separate `trust-safety-policies.sql` for safety-team RLS access) — good
  sign the two repos already agree on how they're supposed to connect, but
  not independently confirmed live (would need a safety-team login to
  verify, which this repo doesn't have credentials for).

## Open items before the demo

- **Confirm Product C's status directly with Lady D** — repo link, and
  whether it's connected to the shared database or still standalone.
- **Get the team's sign-off on the proposed run of show above** — order,
  presenter assignments, and per-product timing are all a first draft, not
  yet confirmed with Joan, Lady D, or Sarah.
- **Visual identity:** no unified branding decision was reached (B offered a
  shared visual identity; C has its own separate logo). Not a functional
  blocker, but worth a quick team decision so the four screens don't look
  like unrelated apps during a back-to-back demo.
