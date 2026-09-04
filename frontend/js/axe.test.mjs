// Run with: node --test frontend/js/axe.test.mjs
// Needs jsdom and axe-core (both frontend/package.json devDependencies).
//
// Checks the real, as-shipped HTML templates for structural accessibility
// issues -- missing landmarks, form-control labeling, ARIA misuse, heading
// structure -- that manual keyboard-nav and contrast checks (contrast.test.mjs)
// don't cover. Runs against each page's static template as authored, before
// any of its own JS populates dynamic content (nav, listing cards, booking
// rows): a real, meaningful scope on its own (it's exactly the markup the
// server sends), just not the same as auditing a fully-hydrated runtime page.
//
// color-contrast is disabled here on purpose: it needs real CSS layout,
// which jsdom doesn't provide, so it can't produce a trustworthy result --
// contrast.test.mjs already covers this properly via the actual WCAG
// formula against real color values.
//
// landmark-one-main and page-has-heading-one report "incomplete" (not
// "violation" -- axe's own way of saying "couldn't be sure, needs a human")
// on every single page here, including ones confirmed to have both a
// <main> and an <h1>. Reproduced identically before and after adding the
// <main> landmarks below, on every page regardless of its actual markup --
// that pattern only makes sense as a jsdom visibility-detection limitation
// (these rules need to confirm an element is actually visible, which
// requires real layout/rendering that jsdom doesn't do), not a real
// accessibility gap. Documented here instead of asserted on, so a future
// reader doesn't mistake tooling noise for a bug to chase.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { JSDOM } from "jsdom";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, "..");
const AXE_SOURCE = readFileSync(path.join(FRONTEND_DIR, "node_modules/axe-core/axe.min.js"), "utf8");

const PAGES = ["index.html", "login.html", "signup.html", "listings.html", "listing.html", "bookings.html", "404.html"];

for (const page of PAGES) {
  test(`${page} has no axe-core accessibility violations (structural checks; color-contrast covered separately)`, async () => {
    const html = readFileSync(path.join(FRONTEND_DIR, page), "utf8");
    const dom = new JSDOM(html, { url: `http://localhost/${page}`, pretendToBeVisual: true, runScripts: "outside-only" });
    dom.window.eval(AXE_SOURCE);

    const results = await dom.window.axe.run(dom.window.document, {
      rules: { "color-contrast": { enabled: false } },
    });

    // .length, not assert.deepEqual against []: results.violations is an
    // Array from the jsdom window's own JS realm (axe ran inside it via
    // eval), and node:assert/strict's deepEqual is deepStrictEqual under
    // the hood -- it fails a cross-realm array against a same-realm []
    // literal even when both are empty, since strict equality also checks
    // constructor identity.
    assert.equal(
      results.violations.length,
      0,
      `axe-core found violations on ${page}: ${results.violations.map((v) => `${v.id} (${v.nodes.length} node(s))`).join(", ")}`
    );
  });
}
