import { getSession } from "./api.js";
import { PRODUCT_NAME } from "./utils.js";

try {
  const session = await getSession();
  window.location.replace(session ? "listings.html" : "login.html");
} catch (err) {
  document.getElementById("loading-state").innerHTML =
    `<p class="error-text">Something went wrong loading ${PRODUCT_NAME}. Please refresh the page.</p>`;
  console.error(err);
}
