// Run manually with: node --test frontend/js/live/known-issues.test.mjs
// Same "real, live, shared Supabase project" caveats as rls-policies.test.mjs
// and concurrency.test.mjs in this same directory -- see those files' own
// header comments for the full reasoning.
//
// This file holds tests that are DELIBERATELY, KNOWINGLY left failing until a
// specific, documented, external fix lands -- not a regression this repo's
// own code can close. .github/workflows/live-tests.yml runs this file as its
// own step with `continue-on-error: true`, so a known issue here shows up
// clearly in the job's logs without turning the whole scheduled run red every
// single time, which would train everyone to ignore it and risk masking an
// actual new regression landing alongside it. rls-policies.test.mjs and
// concurrency.test.mjs still fail the job normally -- only tests that belong
// in *this* file get the pass.
//
// Currently empty (2026-09-04): the one test that lived here since
// 2026-09-02 -- alex.rivera@example.com carrying an unintended
// safety_team role -- was fixed and moved back to rls-policies.test.mjs as a
// normal, permanently-passing regression test once the role was cleared live.
// This file is kept, not deleted, as the standing home for the next tracked
// issue that needs the same treatment; `node --test` on a file with no
// test() calls exits 0 with "tests 0," which is a correct, harmless outcome
// for both a manual run and live-tests.yml's own step.
