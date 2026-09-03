// Run with: node --test frontend/js/ci-config.test.mjs
// Checks the project's own stated CI/config rules against the actual files
// on disk -- e.g. .github/workflows/test.yml's own comments explain *why*
// every action is SHA-pinned, but nothing enforced that a future edit
// couldn't quietly reintroduce a mutable tag (`@v4`) instead. Plain text/
// regex checks, not a real YAML parser: this only ever needs to validate
// this repo's own small, hand-written config files, not arbitrary YAML, so
// adding a parsing dependency for it isn't worth it (this whole suite's
// only external dependency remains jsdom, per README.md's "Architecture").

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const WORKFLOWS_DIR = path.join(REPO_ROOT, ".github/workflows");

function readText(relPath) {
  return readFileSync(path.join(REPO_ROOT, relPath), "utf8");
}

const workflowFiles = readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));

test("every GitHub Actions workflow file has at least one job", () => {
  assert.ok(workflowFiles.length > 0, "expected at least one file in .github/workflows");
  for (const file of workflowFiles) {
    const text = readText(`.github/workflows/${file}`);
    assert.match(text, /^jobs:/m, `${file} has no top-level "jobs:" key`);
  }
});

test("every `uses:` step across all workflows is pinned to a 40-character commit SHA, not a mutable tag", () => {
  for (const file of workflowFiles) {
    const text = readText(`.github/workflows/${file}`);
    const usesLines = [...text.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((m) => m[1]);
    assert.ok(usesLines.length > 0, `${file} has no "uses:" steps at all -- check the file still has actions in it`);
    for (const ref of usesLines) {
      const at = ref.lastIndexOf("@");
      assert.ok(at !== -1, `${file}: "${ref}" has no @ref at all`);
      const pin = ref.slice(at + 1);
      assert.match(pin, /^[0-9a-f]{40}$/, `${file}: "${ref}" is pinned to "${pin}", not a 40-character commit SHA`);
    }
  }
});

test("every `uses:` line that's SHA-pinned carries a trailing version comment, so a human can tell what it resolves to without looking it up", () => {
  for (const file of workflowFiles) {
    const text = readText(`.github/workflows/${file}`);
    const usesLines = text.split("\n").filter((l) => /uses:\s*\S+@[0-9a-f]{40}/.test(l));
    for (const line of usesLines) {
      assert.match(line, /#\s*v?\d/, `${file}: "${line.trim()}" is SHA-pinned but has no trailing "# vX.Y.Z" comment`);
    }
  }
});

test("every workflow file declares a top-level `permissions:` block, not just job-level or none at all", () => {
  for (const file of workflowFiles) {
    const text = readText(`.github/workflows/${file}`);
    // Top-level means column 0 -- distinguishes it from a job-scoped
    // `    permissions:` block nested under one specific job, which doesn't
    // constrain any *other* job in the same file that omits its own.
    assert.match(text, /^permissions:/m, `${file} has no top-level permissions: block`);
  }
});

test("no workflow file's top-level permissions block grants blanket write access", () => {
  for (const file of workflowFiles) {
    const text = readText(`.github/workflows/${file}`);
    const match = text.match(/^permissions:\s*\n((?:^ {2}.+\n?)*)/m);
    assert.ok(match, `${file}: couldn't isolate the top-level permissions block's contents`);
    assert.doesNotMatch(match[1], /:\s*write-all\b/, `${file}'s top-level permissions block grants write-all`);
  }
});

test("dependabot.yml exists, is version 2, and covers both npm projects in this repo", () => {
  const text = readText(".github/dependabot.yml");
  assert.match(text, /^version:\s*2\s*$/m, "dependabot.yml should declare version: 2");
  assert.match(text, /directory:\s*"\/frontend"/, "dependabot.yml has no entry for /frontend");
  assert.match(text, /directory:\s*"\/backend"/, "dependabot.yml has no entry for /backend");
});
