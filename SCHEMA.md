# Shared database contract

This documents every table, RPC function, and RLS policy this repo (Product B) reads or writes on the one live Supabase project shared with Products A, C, and D. It exists because no single cross-repo reference did — that gap is exactly what let one product's RLS policy (`bookings_safety_team_select`, Product D's reviewer-access mechanism) exist without ever being mentioned in this repo's own `backend/schema.sql`, and what let the `trust_safety` table stay readable with any product's public anon key with no one repo owning the fix.

**Status:** proposed from Product B's side, current as of this file's own `backend/schema.sql`. Not yet synced with Products A/C/D's own schemas — full accuracy needs each team confirming their own section. Treat this as a starting draft for a shared, identical copy across all four repos, not yet the agreed-on source of truth.

## Shared cross-team tables

Defined identically here and (per the team's `20260807_Data schema template`) in every product that touches them.

| Table | Columns | Written by | Read by |
|---|---|---|---|
| `customers` | `customer_id` (PK), `signup_date` | Backend seed scripts only | All four products |
| `listings` | `listing_id` (PK), `provider_id`, `title`, `service_type`, `description`, `hourly_rate`, `availability_slots` | Product A (provider-facing) | Products A, B, C |
| `bookings` | `booking_id` (PK), `customer_id`, `listing_id`, `booking_status`, `total_cost`, `rating`, `created_at` | Product B (`create_booking_with_schedule`), Product A (status updates) | Products A, B, D |
| `chatbot_requests` | `id`, `job_request_text`, `created_at` | Product C | Product C |
| `trust_safety` | `report_id` (PK), `reference_type`, `reference_id`, `flag_status`, `flag_type`, `rating`, `created_at` | Product D (`safety_team` role) | **Currently: anyone holding any product's public anon key** — no `SELECT` RLS policy restricts read access, unlike the write-side policy. Flagged to the team; Product D owns the fix. |

**Known drift, not yet resolved by any one repo:**
- A `providers` table exists live in the shared project but is not defined in this repo's schema and not validated against by Product A's `provider_id` usage (a bare client string, never joined). Team decision needed: add real FK validation, or document that it's intentionally not a real relationship yet.
- `service_type` values are stored consistently (`cleaning` / `handyman` / `moving` / `custom`), but the *display labels* three products show for the same value currently disagree (Product B: "Handy People", Product A: "Handyman", Product C: "Handy Work Services" in one place and "Handyman" in another). Product A's open PR #2 addresses this.

## Product B-only tables

Not part of the shared contract — kept local deliberately so a Product-B-specific concern never leaks into the shared schema.

| Table | Purpose |
|---|---|
| `customer_profiles` | Links a Supabase Auth user (`auth.uid()`) to a `customers` row. |
| `booking_schedules` | Which `availability_slots` entry a customer picked for a given booking — the shared `bookings` table has no column for this today (flagged to the team as a possible future shared-schema addition). |

## RPC functions Product B exposes

Both `security definer` (deliberately bypass RLS — see `backend/schema.sql`'s own comments for why each one needs to), both explicitly revoked from `public` and `anon` (Postgres's default grant and Supabase's own default-privilege bootstrap are two separate grants — both must be revoked), granted only to `authenticated`.

| Function | Returns | Purpose |
|---|---|---|
| `create_booking_with_schedule(p_booking_id, p_customer_id, p_listing_id, p_scheduled_slot)` | the created booking row | Atomic, idempotent booking creation (`bookings` + `booking_schedules` in one transaction), serialized per-slot via a transaction-scoped advisory lock. The one function in this repo with a history of breaking production when changed without a live check — treat any change to it as high-risk by default. |
| `get_booked_slots(p_listing_id)` | `setof timestamptz` | Read-only, additive: which timestamps on a listing are already taken. Returns only timestamps, never `booking_id`/`customer_id` — no more sensitive than the already-public `listings` table. |

## RLS policies Product B defines

All on tables Product B owns or co-owns; see `backend/schema.sql` for the exact policy SQL.

- `listings`: public read.
- `customers` / `customer_profiles`: a signed-in user can read only their own row.
- `bookings`: a signed-in customer can read/insert/update only rows tied to their own `customer_id`; the `UPDATE` policy's `WITH CHECK`, plus the `bookings_protect_update` trigger, together mean the *only* column a customer can actually change on their own booking is `rating`.
- `booking_schedules`: same "own bookings only" rule, mirrored from `bookings`.

## What this file does not cover

Products A, C, and D's own tables, functions, and policies that Product B never reads or writes — each team's own schema file remains the source of truth for those. If this file is adopted suite-wide, each product should add its own equivalent section (or this file should be split into one per product, kept identical across all four repos) rather than one team maintaining the whole thing alone.
