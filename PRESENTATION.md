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

Products B and D point at the same live Supabase project
(`bikimbnqtvbqzprfgzfj`) today, so steps 3 and 5 above are a real, live data
flow — a booking made in B is immediately visible to D. Step 4 (A reading
that same booking live) and steps 1–2 (the chatbot matching against real
listings) aren't confirmed live yet — see "Current integration status"
below for exactly what's still missing on each.

## Final storyboard and script

No longer a draft — timing, speakers, and every word of the actual script,
including the handoff line between each speaker. Every transition was checked
so it lands on a word the next speaker actually uses, not just a related idea
(e.g. Sarah's opening ends on "browsing and booking a service," and Valerie's
first line is "browses and filters listings" — same word, not a paraphrase).

| Order | Speaker | Segment | Time | Running total |
|---|---|---|---|---|
| 1 | Sarah | Opening (client, target user, problem) | 2 min | 2 min |
| 2 | Valerie | Customer Booking (Product B) | 4 min | 6 min |
| 3 | Lady D | Chatbot (Product C) | 4 min | 10 min |
| 4 | Joan | Provider (Product A) | 4 min | 14 min |
| 5 | Sarah | Trust and Safety (Product D) | 4 min | 18 min |
| 6 | Valerie | Closing | 2 min | 20 min |
| — | Whole team | Q&A | 10 min | 30 min |

**Opening — Sarah:**

Imagine that you have moved into a new apartment or that your kitchen sink is
suddenly leaking and that you need a reliable, local, professional today, not
next week. Right now, finding that person means scrolling through scattered
listings, texting a few different people to compare price and availability,
and hoping that the one that you pick shows up. TaskLocal solves that problem
with a two-sided, local marketplace connecting independent, home-service
providers — the cleaners, the handymen, the movers — with the customers who
need them, earning a small commission when a booking completes. Our target
user is a busy, local resident who wants to describe what they need in plain
language, see vetted options, and book confidently without the back-and-forth.
The four of us built one, connected system to make it possible, and today we
will walk through it as one, continuous journey, not four separate apps. Let
us start where that customer experiences it first, in browsing and booking a
service, and I will hand it to Valerie to begin to demonstrate.

**Customer Booking — Valerie (Product B):**
- *What it does:* the demand-side web and mobile application where customers
  browse vetted listings, filter by service type, price, and availability,
  and securely book a time slot.
- *How it works:* customer logs in and browses and filters listings; picks a
  listing and an available time slot and submits a booking; the booking
  writes to the shared database with the price computed server-side and
  status set to pending; customer sees all their bookings and rates a
  service once it's completed.
- *Transition:* "A lot of the time, customers don't know the right filter
  with which to search. They want to describe what is wrong in their own
  words, like my sink is leaking. Our chatbot lets them do exactly that, as
  Lady D will show us."

**Chatbot — Lady D (Product C):**
- *What it does:* allows a customer to describe a job in their own words
  instead of hunting through filters themselves — the chatbot interprets the
  request and matches it to live provider listings.
- *How it works:* customer types a plain-language description ("my sink is
  leaking, need someone this week"); the assistant classifies it into a
  service type and pulls matching listings from the shared TaskLocal
  database; it responds conversationally with the matches and next steps;
  the request gets logged to the shared database, visible to the rest of the
  team's systems.
- *Transition:* "All of those listings, the ones that we searched now and
  matched against, come from somewhere. Now we meet the people creating
  them, our providers, and hand it over to Joan."

**Provider — Joan (Product A):**
- *What it does:* where independent service providers turn what they offer
  into a clear, structured listing — a category, a title, a description, and
  a price — solving the first, foundational piece of the trust problem: you
  can't trust or evaluate something that isn't clearly described in the
  first place.
- *How it works:* a provider signs up and creates a profile, then creates a
  listing by selecting a service category, writing a title and description,
  and setting a price; sets availability and publishes the listing so it
  becomes visible to customers; views and responds to incoming booking
  requests, with confirmed jobs showing up in their bookings list.
- *Transition:* "Not every booking goes smoothly. Sometimes a provider or a
  customer needs to be reported or an incident needs attention. Our Trust &
  Safety Dashboard monitors those situations and is where the team takes
  action. Sarah, back to you."

**Trust and Safety — Sarah (Product D):**
- *What it does:* helps the team monitor provider and customer activity,
  identify potential safety issues, and take action when something needs
  attention — one central place to review reports instead of information
  spread across multiple apps.
- *How it works:* the Trust and Safety team member signs in and views the
  dashboard; reviews reported users, requests, or incidents that need
  attention; opens a specific report to see the relevant details and
  activity; determines whether action is needed; takes the appropriate
  action and updates the case status.
- *Transition into closing:* "By bringing these safety tools into one
  dashboard, TaskLocal can respond to issues faster and create a safer
  experience for both customers and providers. So from the moment a customer
  books, to how a listing gets created, to how we keep the whole platform
  trustworthy, it is one, connected system, not four separate ones. Valerie,
  I will hand it back to you to bring us home."

**Closing — Valerie:**

From a potentially scattered, stressful search, TaskLocal turns finding,
booking, and trusting a local home-service provider into one connected,
transparent experience for the customer, for the provider, and for the team
that keeps it all safe. In the end, this presentation is the story of how we
helped make a stranger safer to hire.

## Current integration status

- **A live, unified entry point now exists.** Sarah's Trust & Safety repo
  includes a "TaskLocal Workspace" hub, deployed at
  [tasklocal-trust-and-safety-dashboar.vercel.app](https://tasklocal-trust-and-safety-dashboar.vercel.app)
  (that's the real URL — missing the final "d" in "dashboard"), linking out
  to all four products: Customer, Provider, Trust & Safety, and
  Messaging/Chatbot. Confirmed live by loading it directly. Worth deciding
  as a team whether this is the actual opening screen for the demo.
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
