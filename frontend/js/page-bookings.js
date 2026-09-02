import { fetchMyBookings, rateBooking } from "./api.js";
import { requireSession, renderNav } from "./nav.js";
import { escapeHtml, formatCurrency, getRatingDisplayState, formatSlot } from "./utils.js";

const session = await requireSession();
if (session) {
  renderNav(session, "bookings.html");

  const listEl = document.getElementById("bookings-list");
  const emptyState = document.getElementById("empty-state");
  const bookingsError = document.getElementById("bookings-error");

  async function render() {
    const bookings = await fetchMyBookings(session.customerId);

    if (bookings.length === 0) {
      listEl.innerHTML = "";
      emptyState.hidden = false;
      return;
    }
    emptyState.hidden = true;

    listEl.innerHTML = bookings
      .map((b) => {
        const listingTitle = b.listings ? escapeHtml(b.listings.title) : "Listing removed";
        const ratingState = getRatingDisplayState(b);
        const ratingBlock =
          ratingState === "form"
            ? `
              <form class="rating-form" data-booking-id="${b.booking_id}">
                <select required aria-label="Rate this booking">
                  <option value="">Rate…</option>
                  <option value="5">5 - Excellent</option>
                  <option value="4">4 - Good</option>
                  <option value="3">3 - Okay</option>
                  <option value="2">2 - Poor</option>
                  <option value="1">1 - Very poor</option>
                </select>
                <button type="submit">Submit</button>
              </form>
            `
            : ratingState === "rated"
            ? `<span>Rated ${b.rating}/5</span>`
            : `<span class="booking-meta">Rating unlocks once this booking is completed</span>`;

        const status = escapeHtml(b.booking_status);
        const scheduled = formatSlot(b.scheduled_slot);

        return `
          <div class="booking-row">
            <div>
              <strong>${listingTitle}</strong>
              <div><span class="status-pill status-${status}">${status}</span></div>
              ${scheduled ? `<div class="booking-meta">Scheduled: ${scheduled}</div>` : ""}
              <div class="booking-meta">${formatCurrency(b.total_cost)} total &middot; ${escapeHtml(b.booking_id)}</div>
            </div>
            ${ratingBlock}
          </div>
        `;
      })
      .join("");

    listEl.querySelectorAll(".rating-form").forEach((form) => {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        bookingsError.textContent = "";
        const select = form.querySelector("select");
        const rating = Number(select.value);
        if (!rating) return;
        const btn = form.querySelector("button");
        btn.disabled = true;
        try {
          await rateBooking(form.dataset.bookingId, rating);
          await render();
        } catch (err) {
          bookingsError.textContent = err.message;
          btn.disabled = false;
        }
      });
    });
  }

  try {
    await render();
  } catch (err) {
    bookingsError.textContent = err.message;
  }
}
