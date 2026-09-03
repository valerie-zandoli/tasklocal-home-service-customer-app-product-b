// Run manually with: node --test frontend/js/live/known-issues.test.mjs
// Same "real, live, shared Supabase project" caveats as rls-policies.test.mjs
// and concurrency.test.mjs in this same directory -- see those files' own
// header comments for the full reasoning.
//
// Split out of rls-policies.test.mjs on purpose: this file holds tests that
// are DELIBERATELY, KNOWINGLY left failing until a specific, documented,
// external fix lands -- not a regression this repo's own code can close.
// .github/workflows/live-tests.yml runs this file as its own step with
// `continue-on-error: true`, so a known issue here shows up clearly in the
// job's logs without turning the whole scheduled run red every single time,
// which would train everyone to ignore it and risk masking an actual new
// regression landing alongside it. rls-policies.test.mjs and
// concurrency.test.mjs still fail the job normally -- only tests that
// belong in *this* file get the pass.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DEMO_USERS } from "../demo-users.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_TEXT = readFileSync(path.join(__dirname, "../config.js"), "utf8");
const SUPABASE_URL = CONFIG_TEXT.match(/SUPABASE_URL:\s*"([^"]+)"/)[1];
const ANON_KEY = CONFIG_TEXT.match(/SUPABASE_ANON_KEY:\s*"([^"]+)"/)[1];

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, `sign-in failed for ${email}: ${JSON.stringify(body)}`);
  return body.access_token;
}

async function rest(method, tablePathAndQuery, { token } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tablePathAndQuery}`, {
    method,
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token || ANON_KEY}`, "Content-Type": "application/json" },
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

const [alex] = DEMO_USERS;
let alexToken;

test("setup: sign in as alex.rivera", async () => {
  alexToken = await signIn(alex.email, alex.password);
  assert.ok(alexToken, "expected alex.rivera to authenticate");
});

// Alex Rivera specifically -- not Jordan, Morgan, or Taylor -- carries an
// app_metadata.role of "safety_team" on this shared Supabase project (found
// by this exact test, when it lived in rls-policies.test.mjs: three
// customer-isolation tests there originally used Alex and failed, since her
// session can read all ~106 bookings platform-wide, not just her own).
// `bookings_safety_team_select` (a policy on `bookings` this repo's own
// schema.sql does NOT define -- confirmed via `pg_policies`, and see
// backend/sql/check-safety-team-policy-scope.sql for the full scope: six
// policies across five tables, not just this one) is almost certainly
// Product D's Trust & Safety Dashboard's own mechanism, granting real
// reviewer accounts broad read access on purpose. The bug isn't that
// policy; it's that a Product-B-owned demo *customer* login ended up
// holding that reviewer role, which breaks the customer-data-isolation
// story this product's own README documents. Left failing on purpose,
// rather than worked around, until that role claim is actually cleared from
// this account -- a ready-to-run fix exists at
// backend/sql/fix-alex-rivera-safety-team-role.sql, pending Sarah's
// confirmation it won't collide with Product D's own reviewer accounts.
test("KNOWN LIVE ISSUE: the alex.rivera demo account should not carry Trust & Safety reviewer access, but currently does", async () => {
  const { data } = await rest("GET", "bookings?select=customer_id", { token: alexToken });
  const otherCustomers = data.filter((r) => r.customer_id !== alex.customerId);
  assert.deepEqual(
    otherCustomers,
    [],
    `alex.rivera@example.com can currently read ${otherCustomers.length} bookings belonging to other customers -- ` +
      `her Supabase Auth user's app_metadata.role is "safety_team", which bookings_safety_team_select grants broad ` +
      `read access to. Run backend/sql/fix-alex-rivera-safety-team-role.sql to fix.`
  );
});
