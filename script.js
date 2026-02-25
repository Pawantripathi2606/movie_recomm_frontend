/**
 * CineMatch — Movie Recommendation Frontend
 * ==========================================
 * Handles:
 *  - Search + autocomplete against /search endpoint
 *  - POST to /recommend for recommendations
 *  - Poster lazy-loading with graceful placeholder fallback
 *  - Full keyboard navigation (Enter / Arrow keys / Escape)
 *  - Error and loading state management
 *
 * 🔧 CONFIGURATION: Set your Render backend URL below.
 */

// ─────────────────────────────────────────────────────────────
// ⚙️  CONFIG
// Local dev  → "http://localhost:8000"
// Production → "https://your-app.onrender.com"
// ─────────────────────────────────────────────────────────────
const API_BASE_URL = "https://movie-recomm-backend-md34.onrender.com";

// ─────────────────────────────────────────────────────────────
// DOM References
// ─────────────────────────────────────────────────────────────
const movieInput = document.getElementById("movie-input");
const recommendBtn = document.getElementById("recommend-btn");
const loadingEl = document.getElementById("loading");
const errorBox = document.getElementById("error-box");
const errorMessage = document.getElementById("error-message");
const retryBtn = document.getElementById("retry-btn");
const resultsEl = document.getElementById("results");
const moviesGrid = document.getElementById("movies-grid");
const emptyState = document.getElementById("empty-state");
const queryTitle = document.getElementById("query-title");
const resultsCount = document.getElementById("results-count");
const autocompleteList = document.getElementById("autocomplete-list");
const cardTemplate = document.getElementById("movie-card-template");
const quickBtns = document.querySelectorAll(".quick-btn");

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────
let isLoading = false;
let autocompleteIndex = -1;
let autocompleteItems = [];
let autocompleteTimer = null;
let lastQuery = "";

// ─────────────────────────────────────────────────────────────
// UI State Manager — uses explicit display instead of `hidden`
// so CSS resets can never accidentally reveal wrong panels.
// ─────────────────────────────────────────────────────────────
const PANELS = {
  loading: loadingEl,
  error: errorBox,
  results: resultsEl,
  empty: emptyState,
};

function showState(state) {
  Object.entries(PANELS).forEach(([name, el]) => {
    el.hidden = (name !== state);
    el.style.display = (name === state) ? "" : "none";
  });

  // Smooth scroll to results area
  if (state === "results" || state === "loading") {
    document.getElementById("results-section").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

// ─────────────────────────────────────────────────────────────
// Recommend — core API call
// ─────────────────────────────────────────────────────────────
async function getRecommendations(title) {
  if (isLoading || !title.trim()) return;

  isLoading = true;
  lastQuery = title.trim();
  recommendBtn.disabled = true;
  recommendBtn.classList.add("loading");
  closeAutocomplete();
  showState("loading");

  let succeeded = false;

  try {
    const response = await fetch(`${API_BASE_URL}/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: lastQuery }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const detail = errorData.detail || `Server error (${response.status})`;
      throw new Error(detail);
    }

    const data = await response.json();

    // API returns: { recommendations: [{title, poster_url}, ...] }
    if (!data.recommendations || data.recommendations.length === 0) {
      throw new Error("No recommendations found. Try a different movie title.");
    }

    renderMovies(data);
    succeeded = true;
    showState("results");

  } catch (err) {
    console.error("Recommendation error:", err);
    const msg = err.message.includes("Failed to fetch")
      ? "Cannot reach the server. Please check your internet connection or try again."
      : err.message;
    errorMessage.textContent = msg;
    if (!succeeded) showState("error");
  } finally {
    isLoading = false;
    recommendBtn.disabled = false;
    recommendBtn.classList.remove("loading");
  }
}


// ─────────────────────────────────────────────────────────────
// Render Movie Cards
// ─────────────────────────────────────────────────────────────
function renderMovies(data) {
  // API response: { recommendations: [{title, poster_url}], query, total }
  const movies = data.recommendations || [];
  queryTitle.textContent = data.query || "";
  resultsCount.textContent = `${movies.length} results`;
  moviesGrid.innerHTML = "";

  movies.forEach((movie) => {
    const node = cardTemplate.content.cloneNode(true);
    const card = node.querySelector(".movie-card");
    const img = node.querySelector(".card-poster");
    const placeholder = node.querySelector(".card-poster-placeholder");
    const titleEl = node.querySelector(".card-title");
    const dateEl = node.querySelector(".card-date");
    const overviewEl = node.querySelector(".card-overview");
    const overlay = node.querySelector(".card-overlay");

    // Title
    titleEl.textContent = movie.title || "Unknown Title";
    card.setAttribute("aria-label", movie.title || "Movie");

    // Hide fields not returned by this endpoint
    dateEl.style.display = "none";
    overviewEl.style.display = "none";
    overlay.style.display = "none";

    // Poster — lazy-load with emoji fallback
    if (movie.poster_url) {
      img.src = movie.poster_url;
      img.alt = `${movie.title} poster`;
      img.onload = () => {
        img.classList.add("loaded");
        placeholder.style.display = "none";
      };
      img.onerror = () => {
        img.style.display = "none";
        placeholder.style.display = "flex";
      };
    }

    moviesGrid.appendChild(node);
  });
}

// ─────────────────────────────────────────────────────────────
// Autocomplete
// ─────────────────────────────────────────────────────────────
async function fetchAutocomplete(query) {
  if (!query || query.length < 2) {
    closeAutocomplete();
    return;
  }
  try {
    const res = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(query)}&limit=6`);
    if (!res.ok) return;
    const data = await res.json();
    renderAutocomplete(data.results || []);
  } catch {
    closeAutocomplete();
  }
}

function renderAutocomplete(items) {
  autocompleteList.innerHTML = "";
  autocompleteItems = items;
  autocompleteIndex = -1;

  if (!items.length) {
    closeAutocomplete();
    return;
  }

  items.forEach((title, i) => {
    const li = document.createElement("li");
    li.textContent = title;
    li.setAttribute("role", "option");
    li.setAttribute("id", `ac-item-${i}`);
    li.addEventListener("click", () => selectAutocomplete(title));
    autocompleteList.appendChild(li);
  });

  autocompleteList.hidden = false;
}

function closeAutocomplete() {
  autocompleteList.hidden = true;
  autocompleteList.innerHTML = "";
  autocompleteItems = [];
  autocompleteIndex = -1;
}

function selectAutocomplete(title) {
  movieInput.value = title;
  closeAutocomplete();
  getRecommendations(title);
}

function updateAutocompleteHighlight() {
  const items = autocompleteList.querySelectorAll("li");
  items.forEach((li, i) => {
    li.setAttribute("aria-selected", i === autocompleteIndex ? "true" : "false");
  });
  if (autocompleteIndex >= 0 && items[autocompleteIndex]) {
    movieInput.value = autocompleteItems[autocompleteIndex];
  }
}

// ─────────────────────────────────────────────────────────────
// Event Listeners
// ─────────────────────────────────────────────────────────────

// Input: debounced autocomplete
movieInput.addEventListener("input", (e) => {
  clearTimeout(autocompleteTimer);
  const val = e.target.value.trim();
  if (val.length >= 2) {
    autocompleteTimer = setTimeout(() => fetchAutocomplete(val), 300);
  } else {
    closeAutocomplete();
  }
});

// Keyboard navigation
movieInput.addEventListener("keydown", (e) => {
  const items = autocompleteList.querySelectorAll("li");

  if (e.key === "ArrowDown" && !autocompleteList.hidden) {
    e.preventDefault();
    autocompleteIndex = Math.min(autocompleteIndex + 1, items.length - 1);
    updateAutocompleteHighlight();
    return;
  }
  if (e.key === "ArrowUp" && !autocompleteList.hidden) {
    e.preventDefault();
    autocompleteIndex = Math.max(autocompleteIndex - 1, -1);
    updateAutocompleteHighlight();
    return;
  }
  if (e.key === "Escape") {
    closeAutocomplete();
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    if (autocompleteIndex >= 0 && autocompleteItems[autocompleteIndex]) {
      selectAutocomplete(autocompleteItems[autocompleteIndex]);
    } else {
      getRecommendations(movieInput.value);
    }
  }
});

// Click outside to close autocomplete
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-container")) {
    closeAutocomplete();
  }
});

// Search button
recommendBtn.addEventListener("click", () => {
  getRecommendations(movieInput.value);
});

// Quick pick buttons
quickBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    movieInput.value = btn.dataset.movie;
    getRecommendations(btn.dataset.movie);
  });
});

// Retry button
retryBtn.addEventListener("click", () => {
  if (lastQuery) {
    getRecommendations(lastQuery);
  } else {
    showState("empty");
  }
});

// ─────────────────────────────────────────────────────────────
// Initial State
// ─────────────────────────────────────────────────────────────
showState("empty");
movieInput.focus();

// Health-check ping on boot (non-blocking)
(async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/`, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    console.log(`🎬 API status: ${data.status} | Movies loaded: ${data.total_movies}`);
  } catch {
    console.warn("⚠️  Could not reach API — check BACKEND_URL in script.js");
  }
})();
