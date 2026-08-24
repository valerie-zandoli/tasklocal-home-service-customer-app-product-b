// Run with: node --test frontend/js/contrast.test.mjs
// Turns a one-off manual WCAG contrast check (done by hand during a review
// round, against whatever colors css/styles.css happened to have at the
// time) into a repeatable test against the real, current file -- so a
// future color-token change that breaks contrast gets caught here instead
// of needing another manual audit to notice.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(path.resolve(__dirname, "../css/styles.css"), "utf8");

// --var: #rrggbb declarations. Extracts from the first ":root { ... }" block
// (light) and the ":root { ... }" block inside
// "@media (prefers-color-scheme: dark) { ... }" (dark) -- matching the two
// places styles.css actually declares these tokens, rather than a general
// CSS parser this project has no other need for.
function extractVars(cssBlock) {
  const vars = {};
  // #rgb shorthand (e.g. --status-draft-bg: #eee;) and #rrggbb both appear
  // in this file's light/dark blocks -- normalize the former to 6 digits so
  // hexToRgb() below only has to handle one format.
  for (const m of cssBlock.matchAll(/--([\w-]+):\s*#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\s*;/g)) {
    const hex = m[2].length === 3 ? [...m[2]].map((c) => c + c).join("") : m[2];
    vars[m[1]] = "#" + hex;
  }
  return vars;
}

const rootMatch = CSS.match(/:root\s*\{([^}]*)\}/);
const darkMatch = CSS.match(/prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/);
assert.ok(rootMatch, "expected to find a :root { ... } block in styles.css");
assert.ok(darkMatch, "expected to find a dark-mode :root { ... } block in styles.css");

const light = extractVars(rootMatch[1]);
const dark = { ...light, ...extractVars(darkMatch[1]) }; // dark block only overrides what changes

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relativeLuminance([r, g, b]) {
  const channel = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hexToRgb(hex1));
  const l2 = relativeLuminance(hexToRgb(hex2));
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

// Every text/background pair actually used for real text in the app, per
// mode. `AA` is 4.5:1 (normal text) or 3:1 (large text, 18.7px+ bold /
// 24px+ regular) -- .badge is 0.72rem (~11.5px) bold, which doesn't
// qualify as "large", so it's held to the stricter 4.5:1 like everything
// else here.
function pairsForMode(vars) {
  return [
    ["status-draft", vars["status-draft-text"], vars["status-draft-bg"]],
    ["status-pending", vars["status-pending-text"], vars["status-pending-bg"]],
    ["status-confirmed", vars["status-confirmed-text"], vars["status-confirmed-bg"]],
    ["status-completed", vars["status-completed-text"], vars["status-completed-bg"]],
    [".badge (brand on badge-bg)", vars["brand"], vars["badge-bg"]],
    ["danger text on page background", vars["danger"], vars["bg"]],
    ["text-muted on background", vars["text-muted"], vars["bg"]],
  ];
}

test("every status-badge, .badge, danger, and muted-text color pair clears WCAG AA (4.5:1) in light mode", () => {
  for (const [label, fg, bg] of pairsForMode(light)) {
    assert.ok(fg && bg, `light mode: missing color for ${label}`);
    const ratio = contrastRatio(fg, bg);
    assert.ok(ratio >= 4.5, `light ${label}: ${fg} on ${bg} is only ${ratio.toFixed(2)}:1, needs >= 4.5:1`);
  }
});

test("every status-badge, .badge, danger, and muted-text color pair clears WCAG AA (4.5:1) in dark mode", () => {
  for (const [label, fg, bg] of pairsForMode(dark)) {
    assert.ok(fg && bg, `dark mode: missing color for ${label}`);
    const ratio = contrastRatio(fg, bg);
    assert.ok(ratio >= 4.5, `dark ${label}: ${fg} on ${bg} is only ${ratio.toFixed(2)}:1, needs >= 4.5:1`);
  }
});

test("the primary button's white text clears WCAG AA on --brand-solid, in both modes", () => {
  for (const [modeName, vars] of [["light", light], ["dark", dark]]) {
    const ratio = contrastRatio("#ffffff", vars["brand-solid"]);
    assert.ok(ratio >= 4.5, `${modeName} button: white on ${vars["brand-solid"]} is only ${ratio.toFixed(2)}:1, needs >= 4.5:1`);
  }
});
