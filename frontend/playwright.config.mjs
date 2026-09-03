// Run with: npm run test:e2e (from frontend/), or `npx playwright test`.
// Deliberately separate from `node --test frontend/js/*.test.mjs` (CI's
// default suite): every spec here drives a real browser against the app
// running on scripts/dev-server.py, which itself talks to the real, live
// Supabase project (frontend/js/config.js has no "mock mode" toggle a test
// runner can flip -- the deployed app always uses the real project). That
// makes this suite slow, occasionally flaky the way anything hitting a real
// network is, and -- for the one spec that completes a real booking --
// something that leaves a real row behind (see e2e/core-flows.spec.mjs's
// own comment on that test, and backend/scripts/cleanup-live-test-data.mjs).
// None of that belongs in a fast, deterministic, every-push CI gate.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // shares one live login session's booking state across specs in a file; parallel workers would race each other
  // 1 worker, not Playwright's default (parallel across projects even with
  // fullyParallel: false scoped to one): every spec here authenticates
  // against the same live Supabase Auth endpoint, which rate-limits sign-ins
  // per IP -- confirmed live, running all 3 projects' logins at once caused
  // real sign-in timeouts that a single Alex Rivera login by itself never does.
  workers: 1,
  retries: 0, // a real flake here should be visible, not silently retried away
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8901",
    trace: "retain-on-failure",
  },
  // 5%, not 0: verified by hand that macOS re-launches Chromium with
  // slightly different font-hinting/anti-aliasing from run to run on
  // identical content -- a real, deterministic-per-run but non-
  // deterministic-across-runs ~4% pixel diff on the login page alone, with
  // no actual layout change (confirmed by eye against the diff image).
  // Tight enough to still catch a genuine regression (a missing element or
  // broken layout moves far more than 5% of the page's pixels).
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.05 } },
  webServer: {
    command: "python3 ../scripts/dev-server.py 8901",
    url: "http://127.0.0.1:8901",
    reuseExistingServer: true,
    timeout: 15000,
    stdout: "ignore", // every request already gets logged by dev-server.py's own access log -- useful when running the server standalone, just noise interleaved into a test report
  },
  // Functional coverage (core-flows, performance) only needs to prove the
  // app works once, against one real viewport/theme -- desktop-light.
  // desktop-dark and mobile-light exist purely to give visual.spec.mjs a
  // second theme and a second viewport to screenshot; re-running the same
  // functional assertions a 2nd/3rd time under a different color scheme
  // would just be padding, not new coverage.
  projects: [
    // testIgnore: performance-throttled.spec.mjs only makes sense under the
    // throttled-mobile project below -- running it here too would just be
    // the same test unthrottled, a redundant no-op.
    { name: "desktop-light", testIgnore: /performance-throttled\.spec\.mjs/, use: { ...devices["Desktop Chrome"], colorScheme: "light" } },
    { name: "desktop-dark", testMatch: /visual\.spec\.mjs/, use: { ...devices["Desktop Chrome"], colorScheme: "dark" } },
    { name: "mobile-light", testMatch: /visual\.spec\.mjs/, use: { ...devices["iPhone 14"], colorScheme: "light" } },
    // Chromium-based (not iPhone 14/WebKit): performance-throttled.spec.mjs
    // needs Chromium's CDP Network domain for real throttling.
    { name: "throttled-mobile", testMatch: /performance-throttled\.spec\.mjs/, use: { ...devices["Pixel 7"] } },
  ],
});
