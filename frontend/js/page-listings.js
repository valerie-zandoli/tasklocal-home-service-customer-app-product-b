import { fetchListings, LISTINGS_PAGE_SIZE } from "./api.js";
import { requireSession, renderNav } from "./nav.js";
import { escapeHtml, formatCurrency, formatServiceType } from "./utils.js";

const session = await requireSession();
if (session) {
  renderNav(session, "listings.html");

  const grid = document.getElementById("listing-grid");
  const emptyState = document.getElementById("empty-state");
  const listingsError = document.getElementById("listings-error");
  const loadMoreBtn = document.getElementById("load-more");
  const form = document.getElementById("filters-form");
  const searchInput = document.getElementById("search");
  const serviceTypeSelect = document.getElementById("service_type");
  const maxPriceInput = document.getElementById("max_price");

  // Lets a link into this page pre-filter (e.g. page-listing.js's "browse
  // similar listings" from a sold-out listing's own service type) instead
  // of landing on an unfiltered grid the customer has to re-filter by hand.
  // Only reads a recognized <option> value -- an unrecognized or missing
  // query param leaves the select on its default "All types".
  const requestedServiceType = new URLSearchParams(window.location.search).get("service_type");
  if (requestedServiceType && [...serviceTypeSelect.options].some((o) => o.value === requestedServiceType)) {
    serviceTypeSelect.value = requestedServiceType;
  }

  function cardHtml(l) {
    return `
      <a class="listing-card" href="listing.html?id=${encodeURIComponent(l.listing_id)}">
        <span class="badge">${escapeHtml(formatServiceType(l.service_type))}</span>
        <h3>${escapeHtml(l.title)}</h3>
        <p class="desc">${escapeHtml(l.description)}</p>
        <p class="price">${formatCurrency(l.hourly_rate)} <span>/ hr</span></p>
      </a>
    `;
  }

  function currentFilters() {
    const maxPriceRaw = maxPriceInput.value;
    return {
      search: searchInput.value.trim(),
      serviceType: serviceTypeSelect.value,
      maxPrice: maxPriceRaw ? Number(maxPriceRaw) : undefined,
    };
  }

  // Re-fetches from the top of the current filters (offset 0), replacing
  // whatever's rendered -- used on load and whenever a filter changes.
  async function render() {
    listingsError.textContent = "";
    let listings;
    try {
      listings = await fetchListings(currentFilters());
    } catch (err) {
      grid.innerHTML = "";
      emptyState.hidden = true;
      loadMoreBtn.hidden = true;
      listingsError.textContent = err.message;
      return;
    }

    if (listings.length === 0) {
      grid.innerHTML = "";
      emptyState.hidden = false;
      loadMoreBtn.hidden = true;
      return;
    }
    emptyState.hidden = true;
    grid.innerHTML = listings.map(cardHtml).join("");
    // A full page might mean more remain, or might just be an exact
    // multiple of the page size -- in the latter case, one extra "Load
    // more" click harmlessly comes back empty and hides the button then.
    loadMoreBtn.hidden = listings.length < LISTINGS_PAGE_SIZE;
  }

  loadMoreBtn.addEventListener("click", async () => {
    listingsError.textContent = "";
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = "Loading…";
    try {
      // Every rendered card is one listing, in fetch order, so the grid's
      // own child count is exactly how many rows to skip for the next page.
      const listings = await fetchListings({ ...currentFilters(), offset: grid.children.length });
      grid.insertAdjacentHTML("beforeend", listings.map(cardHtml).join(""));
      loadMoreBtn.hidden = listings.length < LISTINGS_PAGE_SIZE;
    } catch (err) {
      listingsError.textContent = err.message;
    } finally {
      loadMoreBtn.disabled = false;
      loadMoreBtn.textContent = "Load more";
    }
  });

  let debounceTimer;
  form.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, 150);
  });

  render();
}
