import { fetchMyBookings, rateBooking } from "./api.js";
import { requireSession, renderNav } from "./nav.js";
import { escapeHtml } from "./utils.js";

const session = await requireSession();
if (session) {
  renderNav(session, "bookings.html");

  const listEl = document.getElementById("bookings-list");
  const emptyState = document.getElementById("empty-state");
  const bookingsError = document.getElementById("bookings-error");

  function formatSlot(iso) {
    if (!iso) return null;
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
        const ratingBlock =
          b.booking_status === "completed" && !b.rating
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
            : b.rating
            ? `<span>Rated ${b.rating}/5</span>`
            : "";

        const status = escapeHtml(b.booking_status);
        const scheduled = formatSlot(b.scheduled_slot);

        return `
          <div class="booking-row">
            <div>
              <strong>${listingTitle}</strong>
              <div><span class="status-pill status-${status}">${status}</span></div>
              ${scheduled ? `<div style="color:var(--text-muted);font-size:0.85rem;">Scheduled: ${escapeHtml(scheduled)}</div>` : ""}
              <div style="color:var(--text-muted);font-size:0.85rem;">$${Number(b.total_cost).toFixed(2)} total &middot; ${escapeHtml(b.booking_id)}</div>
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
