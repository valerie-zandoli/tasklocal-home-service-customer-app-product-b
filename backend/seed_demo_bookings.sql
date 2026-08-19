-- Extra booking history for the 4 demo accounts (Valerie, Joan, Lady D, Sarah)
-- so each one has a mix of pending/confirmed/completed bookings to click
-- through on first login, instead of an empty "My Bookings" page.
--
-- Run this AFTER backend/schema.sql and backend/seed_data.sql (and before or
-- after backend/scripts/seed-demo-users.mjs — order doesn't matter there,
-- since these rows key off customer_id in the shared `customers` table, not
-- the auth user created by that script).
--
-- total_cost is given explicitly here (rather than left for the
-- bookings_set_total_cost trigger to randomize) so re-running this seed
-- always produces the same, reproducible demo state. created_at is staggered
-- (completed = oldest, pending = most recent) so "My Bookings" sorts into a
-- believable lifecycle instead of every seeded row sharing one timestamp.

insert into bookings (booking_id, customer_id, listing_id, booking_status, total_cost, rating, created_at) values
  -- Valerie Zandoli (cust_60227)
  ('bkg_900001', 'cust_60227', 'lst_343432', 'pending',   93.54,  null, now() - interval '1 day'),
  ('bkg_900002', 'cust_60227', 'lst_402426', 'confirmed', 60.58,  null, now() - interval '8 days'),
  ('bkg_900003', 'cust_60227', 'lst_379617', 'completed', 69.96,  null, now() - interval '21 days'), -- unrated, for demoing the rating flow

  -- Joan Albayrak (cust_04025) — already has bkg_786170 (draft) from the synthetic dataset
  ('bkg_900004', 'cust_04025', 'lst_102439', 'confirmed', 44.52,  null, now() - interval '6 days'),
  ('bkg_900005', 'cust_04025', 'lst_448936', 'completed', 106.44, null, now() - interval '19 days'),

  -- Lady D Stukes (cust_57744)
  ('bkg_900006', 'cust_57744', 'lst_227746', 'pending',   44.88,  null, now() - interval '2 days'),
  ('bkg_900007', 'cust_57744', 'lst_589443', 'confirmed', 27.80,  null, now() - interval '9 days'),
  ('bkg_900008', 'cust_57744', 'lst_571542', 'completed', 145.98, null, now() - interval '25 days'),

  -- Sarah Dykes (cust_80863) — already has bkg_237871 (completed, unrated) from the synthetic dataset
  ('bkg_900009', 'cust_80863', 'lst_433945', 'pending',   87.54,  null, now() - interval '1 day'),
  ('bkg_900010', 'cust_80863', 'lst_594619', 'confirmed', 167.45, null, now() - interval '7 days')
on conflict (booking_id) do nothing;

-- The specific slot each booking above was made for, drawn from that
-- listing's own availability_slots so the times shown are real, bookable
-- options and not made up. See backend/schema.sql for why this is a
-- separate, Product-B-local table rather than a column on `bookings`.
insert into booking_schedules (booking_id, scheduled_slot) values
  ('bkg_900001', '2026-10-03T15:00:00Z'),
  ('bkg_900002', '2026-10-05T11:00:00Z'),
  ('bkg_900003', '2026-08-28T13:00:00Z'),
  ('bkg_900004', '2026-09-08T09:00:00Z'),
  ('bkg_900005', '2026-08-20T15:00:00Z'),
  ('bkg_900006', '2026-10-11T11:00:00Z'),
  ('bkg_900007', '2026-10-02T09:00:00Z'),
  ('bkg_900008', '2026-09-15T15:00:00Z'),
  ('bkg_900009', '2026-09-02T13:00:00Z'),
  ('bkg_900010', '2026-09-20T13:00:00Z')
on conflict (booking_id) do nothing;
