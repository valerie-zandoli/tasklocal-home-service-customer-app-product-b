-- Applied live 2026-09-04, authorized directly by the product owner (no
-- cross-team coordination needed -- everything here is Product B's own
-- account/trigger logic, unlike the still-open trust_safety RLS gap, which
-- does need Product D). Mirrors the definitions now committed in
-- backend/schema.sql; kept here too as a dated record of what changed live
-- and why, matching this directory's existing convention (see
-- fix-alex-rivera-safety-team-role.sql, check-safety-team-policy-scope.sql).
--
-- All four statements are safe to re-run: `create or replace function`
-- updates the two existing triggers' bodies in place (the triggers
-- themselves already exist and don't need recreating), and the new trigger
-- is dropped-if-exists first.

-- 1) Close the total_cost trust-escape-hatch: an authenticated customer's
--    direct POST /rest/v1/bookings could previously set an arbitrary price,
--    bypassing create_booking_with_schedule. Found in the 2026-09-04
--    adversarial review.
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
  if new.total_cost is not null and auth.role() <> 'authenticated' then
    return new;
  end if;

  select hourly_rate into rate from listings where listing_id = new.listing_id;
  if rate is null then
    raise exception 'Unknown listing_id: %', new.listing_id;
  end if;

  commission := 0.10 + random() * 0.10;
  new.total_cost := round(rate * (1 + commission), 2);
  return new;
end;
$$;

-- 2) Close the rating-gating gap: a rating could previously be set (or
--    overwritten) via a direct PATCH before a booking was actually
--    completed. Found in the same review.
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
    if new.rating is distinct from old.rating and old.booking_status <> 'completed' then
      raise exception 'A booking can only be rated once it is completed.';
    end if;
  end if;
  return new;
end;
$$;

-- 3) Self-service signup: until now the only way in was one of four fixed
--    demo accounts. Provisions customers/customer_profiles the instant
--    auth.signUp() creates the auth.users row. Gated on display_name being
--    present in raw_user_meta_data so backend/scripts/seed-demo-users.mjs's
--    admin-created accounts (which never set that key) are untouched.
create or replace function handle_new_customer_signup()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer_id text;
  v_display_name text;
begin
  if not (new.raw_user_meta_data ? 'display_name') then
    return new;
  end if;

  v_display_name := new.raw_user_meta_data->>'display_name';
  v_customer_id := 'cust_' || substr(md5(new.id::text || clock_timestamp()::text), 1, 6);

  insert into customers (customer_id, signup_date) values (v_customer_id, current_date);
  insert into customer_profiles (user_id, customer_id, display_name)
  values (new.id, v_customer_id, v_display_name)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function handle_new_customer_signup();

-- 4) Clear the erroneous safety_team role from Product B's own
--    alex.rivera@example.com demo account -- see
--    fix-alex-rivera-safety-team-role.sql in this same directory for the
--    full history/reasoning. Confirmed live-exploitable via the very first
--    demo-login button on the public site by two independent reviews across
--    this session; authorized directly by the product owner on 2026-09-04.
update auth.users
set raw_app_meta_data = raw_app_meta_data - 'role'
where email = 'alex.rivera@example.com';
