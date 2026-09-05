// Gives the app real offline support and reliable "Add to Home Screen"
// eligibility — frontend/manifest.json's icons/theme-color alone don't
// guarantee either without a service worker present.
//
// Network-first with a cache fallback: always tries the network so data
// stays fresh, and only serves the last-cached copy when that fails (no
// network, or offline). Bump CACHE_NAME when the app shell's file list
// below changes, so clients pick up the new set instead of serving a stale
// mix of old and new files.
const CACHE_NAME = "tasklocal-shell-v4";

const APP_SHELL = [
  "index.html",
  "login.html",
  "signup.html",
  "listings.html",
  "listing.html",
  "bookings.html",
  "404.html",
  "css/styles.css",
  "js/config.js",
  "js/register-sw.js",
  "js/set-manifest-theme.js",
  "js/api.js",
  "js/nav.js",
  "js/utils.js",
  "js/supabaseClient.js",
  "js/demo-users.js",
  "js/page-index.js",
  "js/page-login.js",
  "js/page-signup.js",
  "js/page-listings.js",
  "js/page-listing.js",
  "js/page-bookings.js",
  "data/listings.json",
  "data/bookings.json",
  // data/customers.json deliberately excluded: nothing in frontend/js/ ever
  // fetches it, so precaching it was wasted work at install time.
  "assets/logo.svg",
  "assets/favicon-32.png",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/icon-maskable-192.png",
  "assets/icon-maskable-512.png",
  "manifest.json",
  "manifest-dark.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Only same-origin GETs: never intercept Supabase auth/RPC calls (a
  // different origin) or any non-GET request — those must always hit the
  // real network so auth state and writes stay correct.
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) {
    return;
  }
  event.respondWith(
    fetch(req)
      .then((res) => {
        // Only cache a genuinely good response. Caching a transient 4xx/5xx
        // here would silently overwrite the last known-good cached copy,
        // and that broken response would then be what a later offline visit
        // gets served by the catch() fallback below — defeating the point
        // of having a fallback at all.
        if (res.ok) {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
