// Minimal smoke tests for the pure, previously-buggy pricing/id logic in
// api.js. Uses Node's built-in test runner — no dependency, no build step,
// consistent with the rest of this project.
//
// Run with:  node --test frontend/js/api.test.mjs
// Needs Node 20+ (global WebCrypto + the built-in test runner are both
// unconditionally stable there; earlier Node 18.x patch releases vary).

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBookingId, randomCommissionTotal } from "./api.js";

test("randomBookingId matches the team's bkg_XXXXXX format", () => {
  const id = randomBookingId();
  assert.match(id, /^bkg_\d{6}$/);
});

test("randomBookingId is not the same value every call", () => {
  const ids = new Set(Array.from({ length: 50 }, randomBookingId));
  // 50 draws from a 1,000,000-value space should essentially never collide;
  // this just guards against a broken generator returning a constant.
  assert.ok(ids.size > 1, "expected multiple distinct ids across 50 draws");
});

test("randomCommissionTotal stays within the documented 10-20% commission range", () => {
  const hourlyRate = 100;
  for (let i = 0; i < 200; i++) {
    const total = randomCommissionTotal(hourlyRate);
    assert.ok(total >= 110 && total <= 120, `total ${total} out of [110, 120] for rate ${hourlyRate}`);
  }
});

test("randomCommissionTotal rounds to 2 decimal places", () => {
  const total = randomCommissionTotal(83.52);
  const cents = Math.round(total * 100);
  assert.equal(cents / 100, total);
});
