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
  (u) => `<button type="button" data-email="${u.email}" data-password="${u.password}">${u.displayName}</button>`
).join("");

demoGrid.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-email]");
  if (!btn) return;
  emailInput.value = btn.dataset.email;
  passwordInput.value = btn.dataset.password;
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
