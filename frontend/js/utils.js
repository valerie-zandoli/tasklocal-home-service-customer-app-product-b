// Pure helpers shared across pages. Deliberately dependency-free (no DOM
// APIs) so they're testable with plain `node --test`, not just in a browser
// — see utils.test.mjs. Previously escapeHtml() was copy-pasted into four
// different page modules; this is the one copy.

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
