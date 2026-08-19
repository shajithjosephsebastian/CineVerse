const movieContainer = document.getElementById("movieContainer");
const searchBox = document.querySelector(".search-box");
const genreBar = document.getElementById("genreBar");

let movies = [];
let activeGenre = "All";
let myListActive = false;

// Skeleton loading placeholders while data loads
function showSkeletons(count = 8){
    movieContainer.innerHTML = Array.from({ length: count }).map(() => `
        <div class="col-lg-3 col-md-4 col-sm-6 mb-4">
            <div class="skeleton-card"></div>
        </div>
    `).join("");
}

// Load Movies
async function loadMovies(){
    showSkeletons();
    try {
        const response = await fetch("data/movies.json");
        if (!response.ok) throw new Error("Request failed");
        movies = await response.json();
        buildGenreBar(movies);
        displayMovies(movies);
    }
    catch(error){
        console.error(error);
        movieContainer.innerHTML = `
            <div class="error-state">
                <i class="fa-solid fa-film"></i>
                <h3>Couldn't load the reel</h3>
                <p>Check your connection and try again.</p>
            </div>
        `;
    }
}

// Split a movie's genre field into individual genre names (handles "Action, Adventure")
function splitGenres(genreField){
    return (genreField || "")
        .split(",")
        .map(g => g.trim())
        .filter(Boolean);
}

// TMDb reports 0.0 when a movie has no votes yet (usually unreleased), not
// as an actual rating — showing "⭐ 0.0" would misread as a real bad score.
function ratingBadgeHTML(rating){
    if (!rating || rating <= 0) {
        return `<span class="rating-badge rating-badge-unreleased"><i class="fa-regular fa-clock"></i> Unreleased</span>`;
    }
    return `<span class="rating-badge"><i class="fa-solid fa-star"></i> ${rating}</span>`;
}

// My List toggle
const myListToggle = document.getElementById("myListToggle");
myListToggle.addEventListener("click", () => {
    myListActive = !myListActive;
    myListToggle.classList.toggle("active", myListActive);
    applyFilters();
});

// Build genre filter pills from the loaded catalog
function buildGenreBar(movieList){
    const allGenres = movieList.flatMap(m => splitGenres(m.genre));
    const genres = ["All", ...new Set(allGenres)];
    genreBar.innerHTML = genres.map(genre => `
        <button
            type="button"
            class="genre-pill${genre === activeGenre ? " active" : ""}"
            data-genre="${genre}">
            ${genre}
        </button>
    `).join("");

    genreBar.querySelectorAll(".genre-pill").forEach(pill => {
        pill.addEventListener("click", () => {
            activeGenre = pill.dataset.genre;
            genreBar.querySelectorAll(".genre-pill").forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            applyFilters();
        });
    });
}

// Combine search + genre + watchlist filters
function applyFilters(){
    const search = searchBox.value.toLowerCase();
    const watchlist = getWatchlist();
    const filtered = movies.filter(movie => {
        const matchesGenre = activeGenre === "All" || splitGenres(movie.genre).includes(activeGenre);
        const matchesSearch =
            movie.title.toLowerCase().includes(search) ||
            movie.genre.toLowerCase().includes(search) ||
            (movie.description || "").toLowerCase().includes(search);
        const matchesWatchlist = !myListActive || watchlist.includes(String(movie.id));
        return matchesGenre && matchesSearch && matchesWatchlist;
    });
    displayMovies(filtered);
}

// Display Movies
function displayMovies(movieList){
    movieContainer.innerHTML = "";
    if(movieList.length === 0){
        const message = myListActive
            ? "Tap the bookmark icon on a movie to add it here."
            : "Try a different title, genre, or search term.";
        movieContainer.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-clapperboard"></i>
                <h3>No movies found</h3>
                <p>${message}</p>
            </div>
        `;
        return;
    }
    movieContainer.innerHTML = movieList.map((movie, i) => `
        <div class="col-lg-3 col-md-4 col-sm-6 mb-4">
            <div class="movie-card" style="animation-delay:${Math.min(i, 8) * 0.05}s" onclick="openMovie('${movie.id}')">
                <div class="poster-frame">
                    <img
                        src="${movie.poster}"
                        class="movie-poster"
                        alt="${movie.title}"
                        loading="lazy">
                    <button
                        type="button"
                        class="watchlist-btn${isInWatchlist(movie.id) ? " active" : ""}"
                        onclick="event.stopPropagation(); handleWatchlistToggle('${movie.id}', this)"
                        aria-label="Toggle watchlist">
                        <i class="fa-solid fa-bookmark"></i>
                    </button>
                    ${ratingBadgeHTML(movie.rating)}
                </div>
                <div class="movie-content">
                    <div class="movie-title">
                        ${movie.title}
                    </div>
                    <div class="movie-info">
                        <span><i class="fa-regular fa-calendar"></i> ${movie.year}</span>
                        <span><i class="fa-solid fa-masks-theater"></i> ${movie.genre}</span>
                    </div>
                    <button
                        class="watch-btn"
                        onclick="event.stopPropagation(); openMovie('${movie.id}')">
                        Watch Now
                    </button>
                </div>
            </div>
        </div>
    `).join("");
}

// Search
searchBox.addEventListener("input", applyFilters);

// Open Movie
function openMovie(id){
    window.location.href = `movie.html?id=${id}`;
}

// Toggle a movie's watchlist state from its card button
function handleWatchlistToggle(id, button){
    const inList = toggleWatchlist(id);
    button.classList.toggle("active", inList);

    // If viewing My List and an item was just removed, drop it immediately
    if (myListActive && !inList) {
        applyFilters();
    }
}

loadMovies();
