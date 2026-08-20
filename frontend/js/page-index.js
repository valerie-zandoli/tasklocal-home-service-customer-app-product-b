import { getSession } from "./api.js";

try {
  const session = await getSession();
  window.location.replace(session ? "listings.html" : "login.html");
} catch (err) {
  document.getElementById("loading-state").innerHTML =
    `<p class="error-text">Something went wrong loading TaskLocal Home-Service. Please refresh the page.</p>`;
  console.error(err);
}
