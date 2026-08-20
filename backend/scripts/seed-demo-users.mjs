// One-time setup script: creates the 4 demo sign-ins for TaskLocal Product B
// (Valerie, Joan, Lady D, Sarah) in Supabase Auth, and links each to a
// customer_id already seeded from backend/seed_data.sql.
//
// Run locally, never in the browser: it needs the SERVICE ROLE key, which
// must stay out of the repo and out of any frontend code.
//
//   cd backend
//   npm install
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed:users

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing env vars. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY " +
      "(Project Settings > API in the Supabase dashboard) before running this script."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// DEMO ONLY — not real credentials. Anyone with this repo can sign in as any
// teammate on the demo Supabase project. Never reuse these passwords anywhere
// real, and rotate/remove this data before the project holds real users.
const DEMO_ACCOUNTS = [
  { email: "valerie.zandoli@pursuit.org", password: "demo-valerie-a4c809", display_name: "Valerie Zandoli", customer_id: "cust_60227" },
  { email: "joan.albayrak@pursuit.org", password: "demo-joan-65d91a", display_name: "Joan Albayrak", customer_id: "cust_04025" },
  { email: "ladydstukes@pursuit.org", password: "demo-ladyd-f2b3e9", display_name: "Lady D Stukes", customer_id: "cust_57744" },
  { email: "sarah.dykes@pursuit.org", password: "demo-sarah-817756", display_name: "Sarah Dykes", customer_id: "cust_80863" },
];

for (const account of DEMO_ACCOUNTS) {
  let userId;

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: account.email,
    password: account.password,
    email_confirm: true,
  });

  if (!createError) {
    userId = created.user.id;
  } else if (/already registered|already exists/i.test(createError.message)) {
    // Re-running after a previous partial failure (e.g. auth user created
    // but the profile insert below failed) shouldn't require deleting
    // anything by hand — look the existing user up and continue.
    const { data: list, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      console.error(`Could not look up existing user ${account.email}:`, listError.message);
      continue;
    }
    const existing = list.users.find((u) => u.email === account.email);
    if (!existing) {
      console.error(`${account.email} was reported as already registered but could not be found.`);
      continue;
    }
    userId = existing.id;
  } else {
    console.error(`Failed to create ${account.email}:`, createError.message);
    continue;
  }

  // upsert, not insert: safe to run this script multiple times, e.g. after
  // fixing a customer_id typo, without manually cleaning up first.
  const { error: profileError } = await supabase
    .from("customer_profiles")
    .upsert({ user_id: userId, customer_id: account.customer_id, display_name: account.display_name });

  if (profileError) {
    console.error(`Failed to link profile for ${account.email}:`, profileError.message);
  } else {
    console.log(`Linked ${account.email} -> ${account.customer_id}`);
  }
}

console.log("Done. Demo passwords are listed in this file — for local demo use only.");
