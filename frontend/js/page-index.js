import { getSession } from "./api.js";

try {
  const session = await getSession();
  window.location.replace(session ? "listings.html" : "login.html");
} catch (err) {
  document.getElementById("loading-state").innerHTML =
    `<p class="error-text">Something went wrong loading Product B, Customer (demand) Web and Mobile Application for TaskLocal Home-Service. Please refresh the page.</p>`;
  console.error(err);
}
