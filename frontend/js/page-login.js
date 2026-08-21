import { login, getSession } from "./api.js";
import { DEMO_USERS } from "./demo-users.js";

const existing = await getSession();
if (existing) {
  window.location.replace("listings.html");
}

const form = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const errorText = document.getElementById("error-text");
const demoGrid = document.getElementById("demo-grid");

demoGrid.innerHTML = DEMO_USERS.map(
  (u) => `<button type="button" data-email="${u.email}">${u.displayName}</button>`
).join("");

demoGrid.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-email]");
  if (!btn) return;
  // Look up the password from the in-memory DEMO_USERS array rather than a
  // data-password attribute: keeps it out of the rendered DOM/page source,
  // which matters now that this runs on a real public URL, not just localhost.
  const user = DEMO_USERS.find((u) => u.email === btn.dataset.email);
  if (!user) return;
  emailInput.value = user.email;
  passwordInput.value = user.password;
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorText.textContent = "";
  const submitBtn = form.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  try {
    await login(emailInput.value.trim(), passwordInput.value);
    window.location.href = "listings.html";
  } catch (err) {
    errorText.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
  }
});
