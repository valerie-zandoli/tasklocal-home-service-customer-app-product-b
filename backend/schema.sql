-- TaskLocal Home-Service — Product B (Customer Web & Mobile / Demand)
-- Postgres schema for Supabase, matching the team's shared data-schema doc exactly
-- (see: Copy of 20260807_Data schema template). Column names/types here must stay in
-- sync with Products A, C, and D — do not rename or retype without a team sign-off.

-- ── Shared cross-team tables ────────────────────────────────────────────────

create table if not exists customers (
  customer_id  text primary key,
  signup_date  date not null
);

create table if not exists listings (
  listing_id          text primary key,
  provider_id         text not null,
  title               text not null,
  service_type        text not null check (service_type in ('cleaning', 'handyman', 'moving', 'custom')),
  description         text not null,
  hourly_rate         numeric(10, 2) not null check (hourly_rate > 0),
  availability_slots  jsonb not null default '[]'::jsonb
);

create table if not exists bookings (
  booking_id      text primary key,
  customer_id     text not null references customers (customer_id),
  listing_id      text not null references listings (listing_id),
  booking_status  text not null check (booking_status in ('draft', 'pending', 'confirmed', 'completed')),
  total_cost      numeric(10, 2) not null check (total_cost >= 0),
  rating          integer check (rating between 1 and 5),
  created_at      timestamptz not null default now()
);

create table if not exists chatbot_requests (
  id               bigint generated always as identity primary key,
  job_request_text text not null,
  customer_id      text references customers (customer_id),
  created_at       timestamptz not null default now()
);

create table if not exists trust_safety (
  report_id       text primary key,
  reference_type  text not null check (reference_type in ('listing_id', 'booking_id')),
  reference_id    text not null,
  flag_status     text not null check (flag_status in ('pending_review', 'investigating', 'resolved')),
  flag_type       text not null check (flag_type in ('low_rating', 'no_show', 'pricing_dispute', 'safety_concern')),
  rating          integer check (rating between 1 and 5),
  created_at      timestamptz not null default now()
);

-- ── Product B-only table ────────────────────────────────────────────────────
-- Links a Supabase Auth user to a row in the shared `customers` table.
-- Kept separate from `customers` on purpose: auth/display concerns are local to
-- this product and must never change the shared table's contract with A/C/D.

create table if not exists customer_profiles (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  customer_id   text not null references customers (customer_id),
  display_name  text not null
);

-- ── Row Level Security ──────────────────────────────────────────────────────

alter table customers enable row level security;
alter table listings enable row level security;
alter table bookings enable row level security;
alter table chatbot_requests enable row level security;
alter table trust_safety enable row level security;
alter table customer_profiles enable row level security;

-- Listings are public read (anyone browsing can see what's on offer)
create policy "listings are publicly readable" on listings
  for select using (true);

-- Customers can see their own profile row only
create policy "profile owner can read" on customer_profiles
  for select using (auth.uid() = user_id);

-- A signed-in user may only see bookings tied to their own linked customer_id
create policy "customer can read own bookings" on bookings
  for select using (
    customer_id in (
      select customer_id from customer_profiles where user_id = auth.uid()
    )
  );

create policy "customer can create own booking" on bookings
  for insert with check (
    customer_id in (
      select customer_id from customer_profiles where user_id = auth.uid()
    )
  );

create policy "customer can update own booking (e.g. leave a rating)" on bookings
  for update using (
    customer_id in (
      select customer_id from customer_profiles where user_id = auth.uid()
    )
  );

-- The `customers` row backing a signed-in user's own profile is readable
create policy "customer can read own customer row" on customers
  for select using (
    customer_id in (
      select customer_id from customer_profiles where user_id = auth.uid()
    )
  );
