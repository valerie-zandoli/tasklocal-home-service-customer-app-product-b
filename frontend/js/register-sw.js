// Plain script (not type="module"), loaded on every page: registers sw.js so
// the manifest's installability/icons actually deliver a working "Add to
// Home Screen" experience with offline support, instead of being cosmetic.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.error("Service worker registration failed:", err);
    });
  });
}
