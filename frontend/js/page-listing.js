import { fetchListing, createBooking } from "./api.js";
import { requireSession, renderNav } from "./nav.js";

const session = await requireSession();
if (session) {
  renderNav(session, "listings.html");

  const container = document.getElementById("listing-detail");
  const params = new URLSearchParams(window.location.search);
  const listingId = params.get("id");

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function formatSlot(iso) {
    try {
      return new Date(iso).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  if (!listingId) {
    container.innerHTML = `<p class="error-text">No listing specified.</p>`;
  } else {
    const listing = await fetchListing(listingId);
    if (!listing) {
      container.innerHTML = `<p class="error-text">That listing could not be found. It may have been removed.</p>`;
    } else {
      let selectedSlot = null;

      container.innerHTML = `
        <div class="detail-header">
          <span class="badge">${escapeHtml(listing.service_type)}</span>
          <h1>${escapeHtml(listing.title)}</h1>
          <p>${escapeHtml(listing.description)}</p>
          <p class="detail-price">$${Number(listing.hourly_rate).toFixed(2)} <span style="font-weight:400;color:var(--text-muted);font-size:0.9rem;">/ hr</span></p>
        </div>
        <h3>Choose a time</h3>
        <div class="slot-grid" id="slot-grid"></div>
        <button class="primary" id="book-btn" style="max-width:280px" disabled>Select a time to book</button>
        <p class="error-text" id="booking-error"></p>
      `;

      const slots = Array.isArray(listing.availability_slots) ? listing.availability_slots : [];
      const slotGrid = document.getElementById("slot-grid");
      const bookBtn = document.getElementById("book-btn");
      const bookingError = document.getElementById("booking-error");

      if (slots.length === 0) {
        slotGrid.innerHTML = `<p class="empty-state">No open time slots right now — check back later.</p>`;
      } else {
        slotGrid.innerHTML = slots
          .map((s, i) => `<button type="button" class="slot-btn" data-slot="${escapeHtml(s)}" data-i="${i}">${formatSlot(s)}</button>`)
          .join("");
      }

      slotGrid.addEventListener("click", (e) => {
        const btn = e.target.closest(".slot-btn");
        if (!btn) return;
        slotGrid.querySelectorAll(".slot-btn").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        selectedSlot = btn.dataset.slot;
        bookBtn.disabled = false;
        bookBtn.textContent = "Book this slot";
      });

      bookBtn.addEventListener("click", async () => {
        bookingError.textContent = "";
        if (!selectedSlot) {
          bookingError.textContent = "Choose a time slot first.";
          return;
        }
        bookBtn.disabled = true;
        bookBtn.textContent = "Booking…";
        try {
          const commission = 1.15; // matches the ~10-20% commission the team's schema calculates
          await createBooking({
            customerId: session.customerId,
            listingId: listing.listing_id,
            totalCost: Math.round(listing.hourly_rate * commission * 100) / 100,
          });
          window.location.href = "bookings.html";
        } catch (err) {
          bookingError.textContent = err.message;
          bookBtn.disabled = false;
          bookBtn.textContent = "Book this slot";
        }
      });
    }
  }
}
