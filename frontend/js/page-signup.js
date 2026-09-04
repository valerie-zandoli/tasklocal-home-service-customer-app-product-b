import { signUp, getSession } from "./api.js";

const existing = await getSession();
if (existing) {
  window.location.replace("listings.html");
}

const form = document.getElementById("signup-form");
const nameInput = document.getElementById("display-name");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const errorText = document.getElementById("error-text");
const successText = document.getElementById("success-text");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorText.textContent = "";
  successText.textContent = "";
  const submitBtn = form.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  try {
    const { needsEmailConfirmation } = await signUp({
      email: emailInput.value.trim(),
      password: passwordInput.value,
      displayName: nameInput.value.trim(),
    });
    if (needsEmailConfirmation) {
      // Whether this branch is ever reached depends on this Supabase
      // project's own email-confirmation setting -- this app can't send or
      // intercept that email itself, so the only honest thing to show is
      // where to go next, not a redirect that would silently fail.
      form.hidden = true;
      successText.textContent = "Account created! Check your email to confirm it, then log in.";
    } else {
      window.location.href = "listings.html";
    }
  } catch (err) {
    errorText.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
  }
});
