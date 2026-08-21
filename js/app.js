// =====================================================
// CATALOG PAGE (index.html)
// Loads movies.json, then handles search, genre filter,
// sort, My List, and rendering the movie card grid.
// splitGenres / ratingBadgeHTML come from utils.js.
// getWatchlist / isInWatchlist / toggleWatchlist come
// from watchlist.js.
// =====================================================

const movieContainer = document.getElementById("movieContainer");
const searchBox = document.querySelector(".search-box");
const genreBar = document.getElementById("genreBar");
const sortSelect = document.getElementById("sortSelect");
const myListToggle = document.getElementById("myListToggle");

let movies = [];
let activeGenre = "All";
let myListActive = false;
let activeSort = "newest";

// ---------- LOAD ----------

async function loadMovies() {
    showSkeletons();
    try {
        const response = await fetch("data/movies.json");
        if (!response.ok) throw new Error("Request failed");
        movies = await response.json();
        buildGenreBar(movies);
        applyFilters();
    } catch (error) {
        console.error(error);
        movieContainer.innerHTML = `
            <div class="error-state">
                <i class="fa-solid fa-film"></i>
                <h3>Couldn't load the reel</h3>
                <p>Check your connection and try again.</p>
            </div>`;
    }
}

function showSkeletons(count = 8) {
    movieContainer.innerHTML = Array.from({ length: count })
        .map(() => `<div class="col-lg-3 col-md-4 col-sm-6 mb-4"><div class="skeleton-card"></div></div>`)
        .join("");
}

// ---------- GENRE PILLS ----------

function buildGenreBar(movieList) {
    const genres = ["All", ...new Set(movieList.flatMap(m => splitGenres(m.genre)))];

    genreBar.innerHTML = genres.map(genre => `
        <button type="button" class="genre-pill${genre === activeGenre ? " active" : ""}" data-genre="${genre}">
            ${genre}
        </button>`).join("");

    genreBar.querySelectorAll(".genre-pill").forEach(pill => {
        pill.addEventListener("click", () => {
            activeGenre = pill.dataset.genre;
            genreBar.querySelectorAll(".genre-pill").forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            applyFilters();
        });
    });
}

// ---------- SORT ----------
// movies.json follows imdb_list.json order, so "newest" is simply reversed.

function sortMovies(movieList) {
    const sorted = [...movieList];
    const byNumber = key => (a, b) => (Number(a[key]) || 0) - (Number(b[key]) || 0);
    const byTitle = (a, b) => (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" });

    switch (activeSort) {
        case "newest":      return sorted.reverse();
        case "rating-desc": return sorted.sort((a, b) => byNumber("rating")(b, a));
        case "rating-asc":  return sorted.sort(byNumber("rating"));
        case "year-desc":   return sorted.sort((a, b) => byNumber("year")(b, a));
        case "year-asc":    return sorted.sort(byNumber("year"));
        case "title-asc":   return sorted.sort(byTitle);
        case "title-desc":  return sorted.sort((a, b) => byTitle(b, a));
        default:             return sorted;
    }
}

if (sortSelect) {
    sortSelect.addEventListener("change", () => {
        activeSort = sortSelect.value;
        applyFilters();
    });
}

// ---------- MY LIST TOGGLE ----------

myListToggle.addEventListener("click", () => {
    myListActive = !myListActive;
    myListToggle.classList.toggle("active", myListActive);
    applyFilters();
});

// ---------- COMBINE FILTERS + SORT, THEN RENDER ----------

function applyFilters() {
    const search = searchBox.value.toLowerCase();
    const watchlist = getWatchlist();

    const filtered = movies.filter(movie => {
        const matchesGenre = activeGenre === "All" || splitGenres(movie.genre).includes(activeGenre);
        const matchesSearch = movie.title.toLowerCase().includes(search)
            || movie.genre.toLowerCase().includes(search)
            || (movie.description || "").toLowerCase().includes(search);
        const matchesWatchlist = !myListActive || watchlist.includes(String(movie.id));
        return matchesGenre && matchesSearch && matchesWatchlist;
    });

    displayMovies(sortMovies(filtered));
}

// ---------- RENDER CARD GRID ----------

function displayMovies(movieList) {
    if (movieList.length === 0) {
        const message = myListActive
            ? "Tap the bookmark icon on a movie to add it here."
            : "Try a different title, genre, or search term.";
        movieContainer.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-clapperboard"></i>
                <h3>No movies found</h3>
                <p>${message}</p>
            </div>`;
        return;
    }

    movieContainer.innerHTML = movieList.map((movie, i) => `
        <div class="col-lg-3 col-md-4 col-sm-6 mb-4">
            <div class="movie-card" style="animation-delay:${Math.min(i, 8) * 0.05}s" onclick="openMovie('${movie.id}')">
                <div class="poster-frame">
                    <img src="${movie.poster}" class="movie-poster" alt="${movie.title}" loading="lazy">
                    <button type="button" class="watchlist-btn${isInWatchlist(movie.id) ? " active" : ""}"
                            onclick="event.stopPropagation(); handleWatchlistToggle('${movie.id}', this)"
                            aria-label="Toggle watchlist">
                        <i class="fa-solid fa-bookmark"></i>
                    </button>
                    ${ratingBadgeHTML(movie.rating)}
                </div>
                <div class="movie-content">
                    <div class="movie-title">${movie.title}</div>
                    <div class="movie-info">
                        <span><i class="fa-regular fa-calendar"></i> ${movie.year}</span>
                        <span><i class="fa-solid fa-masks-theater"></i> ${movie.genre}</span>
                    </div>
                    <button class="watch-btn" onclick="event.stopPropagation(); openMovie('${movie.id}')">Watch Now</button>
                </div>
            </div>
        </div>`).join("");
}

// ---------- SEARCH / NAVIGATE / WATCHLIST ----------

searchBox.addEventListener("input", applyFilters);

function openMovie(id) {
    window.location.href = `movie.html?id=${id}`;
}

function handleWatchlistToggle(id, button) {
    const inList = toggleWatchlist(id);
    button.classList.toggle("active", inList);
    if (myListActive && !inList) applyFilters(); // drop it from view immediately
}

loadMovies();
