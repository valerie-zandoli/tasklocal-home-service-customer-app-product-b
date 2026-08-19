import { fetchMyBookings, rateBooking } from "./api.js";
import { requireSession, renderNav } from "./nav.js";

const session = await requireSession();
if (session) {
  renderNav(session, "bookings.html");

  const listEl = document.getElementById("bookings-list");
  const emptyState = document.getElementById("empty-state");

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : str;
    return div.innerHTML;
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
                <select required>
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

        return `
          <div class="booking-row">
            <div>
              <strong>${listingTitle}</strong>
              <div><span class="status-pill status-${b.booking_status}">${b.booking_status}</span></div>
              <div style="color:var(--text-muted);font-size:0.85rem;">$${Number(b.total_cost).toFixed(2)} total &middot; ${b.booking_id}</div>
            </div>
            ${ratingBlock}
          </div>
        `;
      })
      .join("");

    listEl.querySelectorAll(".rating-form").forEach((form) => {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const select = form.querySelector("select");
        const rating = Number(select.value);
        if (!rating) return;
        const btn = form.querySelector("button");
        btn.disabled = true;
        try {
          await rateBooking(form.dataset.bookingId, rating);
          await render();
        } catch (err) {
          alert(err.message);
          btn.disabled = false;
        }
      });
    });
  }

  render();
}
