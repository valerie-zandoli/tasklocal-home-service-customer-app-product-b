import { fetchListings } from "./api.js";
import { requireSession, renderNav } from "./nav.js";

const session = await requireSession();
if (session) {
  renderNav(session, "listings.html");

  const grid = document.getElementById("listing-grid");
  const emptyState = document.getElementById("empty-state");
  const form = document.getElementById("filters-form");
  const searchInput = document.getElementById("search");
  const serviceTypeSelect = document.getElementById("service_type");
  const maxPriceInput = document.getElementById("max_price");

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  async function render() {
    const search = searchInput.value.trim();
    const serviceType = serviceTypeSelect.value;
    const maxPriceRaw = maxPriceInput.value;
    const maxPrice = maxPriceRaw ? Number(maxPriceRaw) : undefined;

    const listings = await fetchListings({ search, serviceType, maxPrice });

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
          <span class="badge">${escapeHtml(l.service_type)}</span>
          <h3>${escapeHtml(l.title)}</h3>
          <p class="desc">${escapeHtml(l.description)}</p>
          <p class="price">$${Number(l.hourly_rate).toFixed(2)} <span>/ hr</span></p>
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
