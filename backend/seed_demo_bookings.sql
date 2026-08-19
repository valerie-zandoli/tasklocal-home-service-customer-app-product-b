-- Extra booking history for the 4 demo accounts (Valerie, Joan, Lady D, Sarah)
-- so each one has a mix of pending/confirmed/completed bookings to click
-- through on first login, instead of an empty "My Bookings" page.
--
-- Run this AFTER backend/seed_data.sql (and before or after
-- backend/scripts/seed-demo-users.mjs — order doesn't matter, since these
-- rows key off customer_id in the shared `customers` table, not the auth
-- user created by that script).
--
-- total_cost is given explicitly here (rather than left for the
-- bookings_set_total_cost trigger to randomize) so re-running this seed
-- always produces the same, reproducible demo state.

insert into bookings (booking_id, customer_id, listing_id, booking_status, total_cost, rating) values
  -- Valerie Zandoli (cust_60227)
  ('bkg_900001', 'cust_60227', 'lst_343432', 'pending',   93.54, null),
  ('bkg_900002', 'cust_60227', 'lst_402426', 'confirmed', 60.58, null),
  ('bkg_900003', 'cust_60227', 'lst_379617', 'completed', 69.96, null), -- unrated, for demoing the rating flow

  -- Joan Albayrak (cust_04025) — already has bkg_786170 (draft) from the synthetic dataset
  ('bkg_900004', 'cust_04025', 'lst_102439', 'confirmed', 44.52, null),
  ('bkg_900005', 'cust_04025', 'lst_448936', 'completed', 106.44, null),

  -- Lady D Stukes (cust_57744)
  ('bkg_900006', 'cust_57744', 'lst_227746', 'pending',   44.88, null),
  ('bkg_900007', 'cust_57744', 'lst_589443', 'confirmed', 27.80, null),
  ('bkg_900008', 'cust_57744', 'lst_571542', 'completed', 145.98, null),

  -- Sarah Dykes (cust_80863) — already has bkg_237871 (completed, unrated) from the synthetic dataset
  ('bkg_900009', 'cust_80863', 'lst_433945', 'pending',   87.54, null),
  ('bkg_900010', 'cust_80863', 'lst_594619', 'confirmed', 167.45, null)
on conflict (booking_id) do nothing;
