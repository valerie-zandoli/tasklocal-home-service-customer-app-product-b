import { getSession, logout } from "./api.js";

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    window.location.href = "login.html";
    return null;
  }
  return session;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : str;
  return div.innerHTML;
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
      <a class="brand" href="listings.html">TaskLocal <span>Home-Service</span></a>
      <div class="nav-links">
        ${links
          .map(
            (l) =>
              `<a href="${l.href}" class="${l.href === activePage ? "active" : ""}">${l.label}</a>`
          )
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
