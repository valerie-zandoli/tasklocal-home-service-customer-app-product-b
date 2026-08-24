import { fetchListings } from "./api.js";
import { requireSession, renderNav } from "./nav.js";
import { escapeHtml, formatCurrency, formatServiceType } from "./utils.js";

const session = await requireSession();
if (session) {
  renderNav(session, "listings.html");

  const grid = document.getElementById("listing-grid");
  const emptyState = document.getElementById("empty-state");
  const listingsError = document.getElementById("listings-error");
  const form = document.getElementById("filters-form");
  const searchInput = document.getElementById("search");
  const serviceTypeSelect = document.getElementById("service_type");
  const maxPriceInput = document.getElementById("max_price");

  async function render() {
    listingsError.textContent = "";
    const search = searchInput.value.trim();
    const serviceType = serviceTypeSelect.value;
    const maxPriceRaw = maxPriceInput.value;
    const maxPrice = maxPriceRaw ? Number(maxPriceRaw) : undefined;

    let listings;
    try {
      listings = await fetchListings({ search, serviceType, maxPrice });
    } catch (err) {
      grid.innerHTML = "";
      emptyState.hidden = true;
      listingsError.textContent = err.message;
      return;
    }

    if (listings.length === 0) {
      grid.innerHTML = "";
      emptyState.hidden = false;
      return;
    }
    emptyState.hidden = true;

    grid.innerHTML = listings
      .map(
        (l) => `
        <a class="listing-card" href="listing.html?id=${encodeURIComponent(l.listing_id)}">
          <span class="badge">${escapeHtml(formatServiceType(l.service_type))}</span>
          <h3>${escapeHtml(l.title)}</h3>
          <p class="desc">${escapeHtml(l.description)}</p>
          <p class="price">${formatCurrency(l.hourly_rate)} <span>/ hr</span></p>
        </a>
      `
      )
      .join("");
  }

  let debounceTimer;
  form.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, 150);
  });

  render();
}
