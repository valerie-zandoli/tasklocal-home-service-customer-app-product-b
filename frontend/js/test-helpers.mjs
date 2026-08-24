// Shared by page-listing.test.mjs and page-listings.test.mjs. Not a *.test.mjs
// file itself, so `node --test frontend/js/*.test.mjs` doesn't try to run it
// as its own suite.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, "..");

// api.js's readMockListings()/readMockBookings() call plain fetch("data/...")
// -- installing this makes those resolve against the real committed JSON
// files (frontend/data/listings.json, bookings.json) instead of hitting the
// network, so these are real-data integration tests, not tests against
// fabricated fixtures. `transform` optionally mutates the parsed JSON before
// it's returned, for the one test that needs to inject a malicious value.
export function installFetchStub(transform) {
  global.fetch = async (url) => {
    const pathname = new URL(url, "http://localhost/").pathname;
    const filePath = path.join(FRONTEND_DIR, pathname);
    const text = await fs.promises.readFile(filePath, "utf8");
    let data = JSON.parse(text);
    if (transform) data = transform(pathname, data);
    return { ok: true, json: async () => data };
  };
}

export function setupDom(JSDOM, html, { url = "http://localhost/" } = {}) {
  const jsdomErrors = [];
  const dom = new JSDOM(html, { url, runScripts: "outside-only" });
  dom.virtualConsole.on("jsdomError", (err) => jsdomErrors.push(err));
  global.window = dom.window;
  global.document = dom.window.document;
  global.sessionStorage = dom.window.sessionStorage;
  global.localStorage = dom.window.localStorage;
  global.URLSearchParams = dom.window.URLSearchParams;
  return { dom, jsdomErrors };
}

export function navigationWasAttempted(jsdomErrors) {
  return jsdomErrors.some((e) => /navigation/i.test(e.message));
}
