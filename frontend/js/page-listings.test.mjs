// Run with: node --test frontend/js/page-listings.test.mjs
// Needs jsdom (see nav.test.mjs's note). Uses real frontend/data/listings.json
// via installFetchStub() rather than fabricated fixtures, so these tests
// also incidentally re-validate the data this session's data-integrity work
// just cleaned up.

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { installFetchStub, setupDom } from "./test-helpers.mjs";
import { DEMO_USERS } from "./demo-users.js";
import { LISTINGS_PAGE_SIZE } from "./api.js";

// page-listings.js has no exports -- it runs entirely as a top-level side
// effect on import (requireSession, DOM wiring, initial render()). A plain
// `import("./page-listings.js")` a second time in the same process returns
// the already-executed module from Node's ES module cache without
// re-running any of that, which would silently no-op every test after the
// first. A unique query string per call forces a fresh module instance
// (and re-execution) each time; its own static `import "./api.js"` still
// resolves to the one shared api.js instance either way, which is fine here
// -- these tests don't need a fresh mock-listings cache per test, just a
// fresh page.
let importCounter = 0;
function importPageListings() {
  return import(`./page-listings.js?t=${++importCounter}`);
}

const SESSION_KEY = "tasklocal_session";

const LISTINGS_HTML = `<!doctype html><body>
  <nav id="app-nav"></nav>
  <form class="filters" id="filters-form">
    <input id="search" type="text" />
    <select id="service_type"><option value="">All types</option></select>
    <input id="max_price" type="number" />
  </form>
  <p class="error-text" id="listings-error"></p>
  <div id="listing-grid" class="listing-grid"></div>
  <p id="empty-state" class="empty-state" hidden></p>
  <button type="button" id="load-more" hidden>Load more</button>
</body>`;

function signIn() {
  const user = DEMO_USERS[0];
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ email: user.email, displayName: user.displayName, customerId: user.customerId })
  );
}

test("renders one page of cards, escapes a malicious title instead of injecting it, then Load more appends the rest", async () => {
  setupDom(JSDOM, LISTINGS_HTML, { url: "http://localhost/listings.html" });
  signIn();
  const malicious = '<img src=x onerror="alert(1)">';
  installFetchStub((pathname, data) => {
    if (pathname === "/data/listings.json") data[0].title = malicious;
    return data;
  });

  await importPageListings();
  await new Promise((r) => setTimeout(r, 50));

  let cards = document.querySelectorAll(".listing-card");
  // frontend/data/listings.json has 55 real listings -- more than one page.
  assert.equal(cards.length, LISTINGS_PAGE_SIZE, "expected exactly one page of cards on first render");
  // If the title were unescaped, this would find a real <img> element instead
  // of literal text -- same technique nav.test.mjs uses to prove escapeHtml()
  // is actually applied, not just present somewhere in the codebase.
  assert.equal(document.querySelector(".listing-card img"), null);
  assert.match(cards[0].querySelector("h3").textContent, /^<img/);
  assert.ok(cards[0].querySelector(".badge").textContent.length > 0);
  assert.match(cards[0].querySelector(".price").textContent, /^\$\d/);

  const loadMoreBtn = document.getElementById("load-more");
  assert.equal(loadMoreBtn.hidden, false, "expected Load more visible after a full first page");

  loadMoreBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(document.querySelectorAll(".listing-card").length, LISTINGS_PAGE_SIZE * 2, "expected a second full page appended, not replacing the first");
  assert.equal(loadMoreBtn.hidden, false, "still more listings left after two full pages of 55");

  loadMoreBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 50));
  cards = document.querySelectorAll(".listing-card");
  assert.equal(cards.length, 55, "expected the remaining listings on the final, partial page");
  assert.equal(loadMoreBtn.hidden, true, "expected Load more hidden once a partial (non-full) page comes back");
});

test("filtering by search narrows the grid to matching listings only", async () => {
  setupDom(JSDOM, LISTINGS_HTML, { url: "http://localhost/listings.html" });
  signIn();
  installFetchStub();

  await importPageListings();
  await new Promise((r) => setTimeout(r, 50));
  const totalCards = document.querySelectorAll(".listing-card").length;
  assert.equal(totalCards, LISTINGS_PAGE_SIZE, "expected one page of cards, unfiltered");

  const searchInput = document.getElementById("search");
  searchInput.value = "Move-Out Cleaning";
  searchInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  // render() is debounced 150ms after the last input event.
  await new Promise((r) => setTimeout(r, 250));

  const filteredCards = document.querySelectorAll(".listing-card");
  assert.ok(filteredCards.length > 0, "expected at least one match for a real listing title");
  assert.ok(filteredCards.length < totalCards, "expected the search to actually narrow the results");
  // filterListings (utils.js, already covered in utils.test.mjs) matches
  // title OR description -- descriptions are drawn from a small shared pool
  // independent of titles, so e.g. a "Deep Apartment Cleaning" listing can
  // legitimately match a "Move-Out Cleaning" search via its description.
  for (const card of filteredCards) {
    const text = card.querySelector("h3").textContent + " " + card.querySelector(".desc").textContent;
    assert.match(text, /Move-Out Cleaning/i);
  }
});

test("shows the empty state, not stale cards, when nothing matches the filter", async () => {
  setupDom(JSDOM, LISTINGS_HTML, { url: "http://localhost/listings.html" });
  signIn();
  installFetchStub();

  await importPageListings();
  await new Promise((r) => setTimeout(r, 50));

  const searchInput = document.getElementById("search");
  searchInput.value = "zzz-no-such-service-zzz";
  searchInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 250));

  assert.equal(document.getElementById("empty-state").hidden, false);
  assert.equal(document.querySelectorAll(".listing-card").length, 0);
});
