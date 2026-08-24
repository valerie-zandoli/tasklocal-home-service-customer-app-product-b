import { getSession, logout } from "./api.js";
import { escapeHtml, PRODUCT_NAME } from "./utils.js";

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    window.location.href = "login";
    return null;
  }
  // Module scripts don't re-run when a page is restored from the browser's
  // back/forward cache, so without this, clicking Back after "Log out" could
  // briefly show this page's last-rendered state (real booking data still in
  // the DOM) before anything re-checks auth. Re-check on restore, but only
  // redirect if the session is actually gone — a still-logged-in user going
  // Back shouldn't eat an unnecessary full reload (lost scroll position, any
  // in-progress filter typing) when there's nothing to protect against.
  window.addEventListener("pageshow", async (event) => {
    if (!event.persisted) return;
    const stillValid = await getSession();
    if (!stillValid) {
      window.location.href = "login";
    }
  });
  return session;
}

export function renderNav(session, activePage) {
  const nav = document.getElementById("app-nav");
  if (!nav) return;
  const links = [
    { href: "listings", label: "Browse" },
    { href: "bookings", label: "My Bookings" },
  ];
  nav.innerHTML = `
    <div class="nav-inner">
      <a class="brand" href="listings" title="${PRODUCT_NAME}">
        <img class="brand-logo" src="assets/logo.svg" alt="" width="24" height="24" />
        <span class="brand-name">${PRODUCT_NAME}</span>
      </a>
      <div class="nav-links">
        ${links
          .map((l) => {
            const isActive = l.href === activePage;
            return `<a href="${l.href}" class="${isActive ? "active" : ""}"${isActive ? ' aria-current="page"' : ""}>${l.label}</a>`;
          })
          .join("")}
      </div>
      <div class="nav-user">
        <span>${escapeHtml(session.displayName)}</span>
        <button id="logout-btn" class="link-btn">Log out</button>
      </div>
    </div>
  `;
  document.getElementById("logout-btn").addEventListener("click", async () => {
    await logout();
    window.location.href = "login";
  });
}
