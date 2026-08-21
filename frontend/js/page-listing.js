import { fetchListing, createBooking, randomBookingId } from "./api.js";
import { requireSession, renderNav } from "./nav.js";
import { escapeHtml, formatCurrency, formatServiceType } from "./utils.js";

const session = await requireSession();
if (session) {
  renderNav(session, "listings.html");

  const container = document.getElementById("listing-detail");
  const params = new URLSearchParams(window.location.search);
  const listingId = params.get("id");

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
      // Generated once per slot selection and reused across a manual retry
      // (see createBooking's bookingId param) so a "Book" click after a lost
      // response doesn't create a second, duplicate booking for the same
      // slot. Cleared whenever the customer picks a different slot, since
      // that's a genuinely new booking intent.
      let pendingBookingId = null;

      container.innerHTML = `
        <div class="detail-header">
          <span class="badge">${escapeHtml(formatServiceType(listing.service_type))}</span>
          <h1>${escapeHtml(listing.title)}</h1>
          <p>${escapeHtml(listing.description)}</p>
          <p class="detail-price">${formatCurrency(listing.hourly_rate)} <span>/ hr</span></p>
        </div>
        <h3>Choose a time</h3>
        <div class="slot-grid" id="slot-grid"></div>
        <button class="primary" id="book-btn" disabled>Select a time to book</button>
        <p class="error-text" id="booking-error" aria-live="polite"></p>
      `;

      const slots = Array.isArray(listing.availability_slots) ? listing.availability_slots : [];
      const slotGrid = document.getElementById("slot-grid");
      const bookBtn = document.getElementById("book-btn");
      const bookingError = document.getElementById("booking-error");

      if (slots.length === 0) {
        slotGrid.innerHTML = `<p class="empty-state">No open time slots right now — check back later.</p>`;
      } else {
        slotGrid.innerHTML = slots
          .map(
            (s, i) =>
              `<button type="button" class="slot-btn" aria-pressed="false" data-slot="${escapeHtml(s)}" data-i="${i}">${formatSlot(s)}</button>`
          )
          .join("");
      }

      slotGrid.addEventListener("click", (e) => {
        const btn = e.target.closest(".slot-btn");
        if (!btn) return;
        slotGrid.querySelectorAll(".slot-btn").forEach((b) => {
          b.classList.remove("selected");
          b.setAttribute("aria-pressed", "false");
        });
        btn.classList.add("selected");
        btn.setAttribute("aria-pressed", "true");
        selectedSlot = btn.dataset.slot;
        pendingBookingId = null;
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
        if (!pendingBookingId) {
          pendingBookingId = randomBookingId();
        }
        try {
          // total_cost is computed from the real listing price — server-side
          // in Supabase mode (bookings_set_total_cost trigger), or here in
          // mock mode — never trusted from arbitrary client input.
          await createBooking({
            bookingId: pendingBookingId,
            customerId: session.customerId,
            listingId: listing.listing_id,
            hourlyRate: listing.hourly_rate,
            scheduledSlot: selectedSlot,
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
