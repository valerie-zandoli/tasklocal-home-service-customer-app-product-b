import { getSession, logout } from "./api.js";
import { escapeHtml, PRODUCT_NAME } from "./utils.js";

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    window.location.href = "login.html";
    return null;
  }
  return session;
}

export function renderNav(session, activePage) {
  const nav = document.getElementById("app-nav");
  if (!nav) return;
  const links = [
    { href: "listings.html", label: "Browse" },
    { href: "bookings.html", label: "My Bookings" },
  ];
  nav.innerHTML = `
    <div class="nav-inner">
      <a class="brand" href="listings.html" title="${PRODUCT_NAME}">
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
    window.location.href = "login.html";
  });
}
