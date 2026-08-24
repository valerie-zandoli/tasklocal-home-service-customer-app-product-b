// Plain script (not type="module"), loaded on every page. The Web App
// Manifest spec has no dark-mode-conditional theme_color/background_color —
// unlike the <meta name="theme-color" media="..."> tags in <head>, which
// only cover in-page browser chrome, not a PWA's install/launch splash
// screen. Without this, installing the app from a dark-mode device would
// still show manifest.json's light background_color on launch. Swapping
// the <link rel="manifest"> href to a dark-color copy of the same manifest
// is the standard workaround.
const manifestLink = document.querySelector('link[rel="manifest"]');
if (manifestLink && window.matchMedia("(prefers-color-scheme: dark)").matches) {
  manifestLink.href = "manifest-dark.json";
}
