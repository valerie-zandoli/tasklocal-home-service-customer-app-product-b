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

-- ── Server-side price integrity ─────────────────────────────────────────────
-- A booking's price must never come from the client as-is (classic price-
-- tampering vector). If the caller omits total_cost, compute it here from the
-- listing's real hourly_rate with the team's documented 10-20% commission. If
-- a caller DOES supply total_cost (e.g. backend/seed_data.sql loading the
-- team's historical synthetic dataset), trust it rather than overwriting
-- already-known-good historical data.

create or replace function set_booking_total_cost()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  rate numeric(10, 2);
  commission numeric;
begin
  if new.total_cost is not null then
    return new;
  end if;

  select hourly_rate into rate from listings where listing_id = new.listing_id;
  if rate is null then
    raise exception 'Unknown listing_id: %', new.listing_id;
  end if;

  commission := 0.10 + random() * 0.10; -- 10-20%, matches the team's shared schema
  new.total_cost := round(rate * (1 + commission), 2);
  return new;
end;
$$;

create trigger bookings_set_total_cost
  before insert on bookings
  for each row
  execute function set_booking_total_cost();

-- A customer-authenticated request must never be able to set a new booking to
-- anything but 'pending' (e.g. self-inserting as 'completed' to unlock rating
-- without a real service happening). auth.role() is null/'service_role' for
-- the SQL Editor and the seed scripts, so backend/seed_data.sql and
-- backend/seed_demo_bookings.sql's explicit historical statuses are untouched.
create or replace function enforce_new_booking_status()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.role() = 'authenticated' then
    new.booking_status := 'pending';
  end if;
  return new;
end;
$$;

create trigger bookings_enforce_new_status
  before insert on bookings
  for each row
  execute function enforce_new_booking_status();

-- A customer may update ONLY the rating on their own booking. Without this,
-- the RLS update policy below (USING with no per-column restriction) would
-- let a signed-in customer rewrite their own booking's price, status, or
-- listing via a direct API call, bypassing the app UI entirely.
create or replace function protect_booking_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.role() = 'authenticated' then
    if new.customer_id is distinct from old.customer_id
       or new.listing_id is distinct from old.listing_id
       or new.total_cost is distinct from old.total_cost
       or new.booking_status is distinct from old.booking_status
    then
      raise exception 'Customers may only update the rating on an existing booking.';
    end if;
  end if;
  return new;
end;
$$;

create trigger bookings_protect_update
  before update on bookings
  for each row
  execute function protect_booking_update();

-- ── Product B-only tables ───────────────────────────────────────────────────
-- Both kept separate from the shared tables on purpose: local-to-this-product
-- concerns (auth linkage, which time slot a customer picked) must never
-- change the shared contract with Products A/C/D.

-- Links a Supabase Auth user to a row in the shared `customers` table.
create table if not exists customer_profiles (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  customer_id   text not null references customers (customer_id),
  display_name  text not null
);

-- The team's shared `bookings` table (see the schema doc) has no column for
-- which availability_slot the customer picked — flagged for the team to
-- consider adding to the shared schema. Until then, Product B records it
-- here rather than silently discarding the customer's choice.
create table if not exists booking_schedules (
  booking_id      text primary key references bookings (booking_id) on delete cascade,
  scheduled_slot  timestamptz not null
);

-- ── Atomic booking creation ─────────────────────────────────────────────────
-- Creating a booking is two inserts (bookings, then booking_schedules). Doing
-- those as two separate client round-trips risks a real, silent bug: if the
-- first insert succeeds and the second then fails, the customer sees "booking
-- failed" while a real, orphaned booking with no recorded time slot now sits
-- in their account. A plpgsql function call runs inside a single transaction
-- — if anything inside raises, the whole thing rolls back, so partial success
-- is impossible by construction. security invoker (not changed to definer):
-- it runs as the calling user, so every RLS policy and trigger above still
-- applies exactly as if the client had run the two inserts directly.
create or replace function create_booking_with_schedule(
  p_booking_id text,
  p_customer_id text,
  p_listing_id text,
  p_scheduled_slot timestamptz
)
returns bookings
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_booking bookings;
begin
  insert into bookings (booking_id, customer_id, listing_id, booking_status)
  values (p_booking_id, p_customer_id, p_listing_id, 'pending')
  returning * into v_booking;

  insert into booking_schedules (booking_id, scheduled_slot)
  values (p_booking_id, p_scheduled_slot);

  return v_booking;
end;
$$;

grant execute on function create_booking_with_schedule(text, text, text, timestamptz) to authenticated;

-- ── Row Level Security ──────────────────────────────────────────────────────

alter table customers enable row level security;
alter table listings enable row level security;
alter table bookings enable row level security;
alter table chatbot_requests enable row level security;
alter table trust_safety enable row level security;
alter table customer_profiles enable row level security;
alter table booking_schedules enable row level security;

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
  for update
  using (
    customer_id in (
      select customer_id from customer_profiles where user_id = auth.uid()
    )
  )
  with check (
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

-- A booking's scheduled slot follows the same "own bookings only" rule
create policy "customer can read own booking schedule" on booking_schedules
  for select using (
    booking_id in (
      select booking_id from bookings where customer_id in (
        select customer_id from customer_profiles where user_id = auth.uid()
      )
    )
  );

create policy "customer can set own booking schedule" on booking_schedules
  for insert with check (
    booking_id in (
      select booking_id from bookings where customer_id in (
        select customer_id from customer_profiles where user_id = auth.uid()
      )
    )
  );
