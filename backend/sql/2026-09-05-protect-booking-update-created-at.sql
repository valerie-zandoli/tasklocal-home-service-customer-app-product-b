-- Applied live 2026-09-05. The created_at fix landed in backend/schema.sql
-- (commit 00a96a1) but was never actually run against the live shared
-- database -- an independent review caught this by running the new live
-- test against production and finding it genuinely fail (a PATCH backdating
-- created_at succeeded, HTTP 200, when it should have been rejected).
-- Mirrors backend/schema.sql exactly; safe to re-run.
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
       or new.created_at is distinct from old.created_at
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
