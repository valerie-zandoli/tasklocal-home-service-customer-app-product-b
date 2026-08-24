// DEMO ONLY — not real credentials, not secure storage. These accounts exist
// purely so reviewers/teammates can click through the app without a real
// Supabase project set up yet. In real (Supabase-configured) mode, these same
// email/password pairs are the ones created by backend/scripts/seed-demo-users.mjs.
//
// Deliberately fictional names/emails (@example.com, RFC 2606-reserved, can
// never route to a real inbox), not teammates' real identities — this file
// ships in a public repo and is served unauthenticated from the live
// production URL, so anything in here is effectively public. customerId
// values are unchanged: they're the join key into the shared team dataset
// (frontend/data, backend/seed_data.sql), which is out of scope here.
export const DEMO_USERS = [
  { email: "alex.rivera@example.com", password: "demo-alex-5ce83e", displayName: "Alex Rivera", customerId: "cust_60227" },
  { email: "jordan.lee@example.com", password: "demo-jordan-38296c", displayName: "Jordan Lee", customerId: "cust_04025" },
  { email: "morgan.reyes@example.com", password: "demo-morgan-3261f1", displayName: "Morgan Reyes", customerId: "cust_57744" },
  { email: "taylor.chen@example.com", password: "demo-taylor-be1eeb", displayName: "Taylor Chen", customerId: "cust_80863" },
];
