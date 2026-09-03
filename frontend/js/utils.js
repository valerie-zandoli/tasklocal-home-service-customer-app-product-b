// Pure helpers shared across pages. Deliberately dependency-free (no DOM
// APIs) so they're testable with plain `node --test`, not just in a browser
// — see utils.test.mjs. Previously escapeHtml() was copy-pasted into four
// different page modules; this is the one copy.

// Single source of truth for the product's full name, so nav.js and
// page-index.js can't drift out of sync with each other on a future rename.
// "TaskLocal | X" matches the naming already used by Product A ("TaskLocal |
// Provider workspace") and Product D ("TaskLocal | Trust & Safety") -- see
// the brand-audit findings this replaced.
export const PRODUCT_NAME = "TaskLocal | Customer Booking";

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

// Hardcoded to en-US/USD on purpose, not left unlocalized by oversight --
// this product is scoped to the New York City metro area only (see
// README.md's "Scope decisions"), and multi-language/multi-currency support
// was reviewed and deliberately declined for now.
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

const SLOT_FORMAT_OPTIONS = {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

// `iso` is availability_slots/scheduled_slot data written by the supply
// side of the marketplace (a different product in this capstone), not
// validated by this app's own input handling — so an unparseable value is
// a real possibility, not just a hypothetical. `new Date(iso)` never
// throws on bad input (it silently produces an Invalid Date, which
// toLocaleString then renders as the literal string "Invalid Date"), so a
// try/catch around it can't actually catch anything; checking
// `Number.isNaN(date.getTime())` is what actually detects it. Escaping the
// raw fallback — rather than assuming it's safe to render as-is — is what
// makes this safe to interpolate directly at every call site, without each
// caller having to remember to escape it themselves.
export function formatSlot(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return escapeHtml(String(iso));
  return date.toLocaleString(undefined, SLOT_FORMAT_OPTIONS);
}

// Decides what the rating UI should show for a booking, independent of the
// actual HTML — was three-way ternary logic buried inline in
// page-bookings.js, untestable without a DOM. A customer can only rate a
// completed booking, and only once.
export function getRatingDisplayState(booking) {
  if (booking.booking_status === "completed" && !booking.rating) return "form";
  if (booking.rating) return "rated";
  return "none";
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
