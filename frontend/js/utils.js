// Pure helpers shared across pages. Deliberately dependency-free (no DOM
// APIs) so they're testable with plain `node --test`, not just in a browser
// — see utils.test.mjs. Previously escapeHtml() was copy-pasted into four
// different page modules; this is the one copy.

// Single source of truth for the product's full name, so nav.js and
// page-index.js can't drift out of sync with each other on a future rename.
export const PRODUCT_NAME =
  "Product B, Customer (demand) Web and Mobile Application for TaskLocal Home-Service";

const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value) {
  if (value == null) return "";
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatCurrency(amount) {
  return CURRENCY_FORMATTER.format(Number(amount));
}

// The stored service_type value ("handyman", etc.) is the shared cross-team
// category key from the team's data schema — it can't be renamed without a
// team sign-off. This maps it to the label actually shown to customers, so
// the display name can change independently of that shared key.
const SERVICE_TYPE_LABELS = {
  cleaning: "Cleaning",
  handyman: "Handy People",
  moving: "Moving",
  custom: "Custom",
};

export function formatServiceType(serviceType) {
  return SERVICE_TYPE_LABELS[serviceType] || serviceType;
}

export function filterListings(rows, { serviceType, maxPrice, search } = {}) {
  let result = rows;
  if (serviceType) {
    result = result.filter((r) => r.service_type === serviceType);
  }
  if (maxPrice) {
    result = result.filter((r) => r.hourly_rate <= maxPrice);
  }
  if (search) {
    const q = search.toLowerCase();
    result = result.filter(
      (r) => r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)
    );
  }
  return result;
}
