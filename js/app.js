const movieContainer = document.getElementById("movieContainer");
const searchBox = document.querySelector(".search-box");
const genreBar = document.getElementById("genreBar");
const sortSelect = document.getElementById("sortSelect");

let movies = [];
let activeGenre = "All";
let myListActive = false;
let activeSort = "newest";

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

        if (!response.ok) {
            throw new Error("Request failed");
        }

        movies = await response.json();

        buildGenreBar(movies);
        applyFilters();
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

// Split a movie's genre field into individual genre names
// Handles "Action, Adventure"
function splitGenres(genreField){
    return (genreField || "")
        .split(",")
        .map(g => g.trim())
        .filter(Boolean);
}

// TMDb reports 0.0 when a movie has no votes yet (usually unreleased),
// not as an actual rating.
function ratingBadgeHTML(rating){
    if (!rating || rating <= 0) {
        return `
            <span class="rating-badge rating-badge-unreleased">
                <i class="fa-regular fa-clock"></i>
                Unreleased
            </span>
        `;
    }

    return `
        <span class="rating-badge">
            <i class="fa-solid fa-star"></i>
            ${rating}
        </span>
    `;
}

// =============================================================
// SORTING
// =============================================================

function sortMovies(movieList){

    const sorted = [...movieList];

    switch(activeSort){

        // -----------------------------------------------------
        // NEWEST ADDED
        //
        // movies.json follows the order of imdb_list.json.
        // The newest movie is therefore at the end.
        // -----------------------------------------------------

        case "newest":
            return sorted.reverse();

        // -----------------------------------------------------
        // RATING HIGH → LOW
        // -----------------------------------------------------

        case "rating-desc":
            return sorted.sort((a, b) => {
                const ratingA = Number(a.rating) || 0;
                const ratingB = Number(b.rating) || 0;

                return ratingB - ratingA;
            });

        // -----------------------------------------------------
        // RATING LOW → HIGH
        // -----------------------------------------------------

        case "rating-asc":
            return sorted.sort((a, b) => {
                const ratingA = Number(a.rating) || 0;
                const ratingB = Number(b.rating) || 0;

                return ratingA - ratingB;
            });

        // -----------------------------------------------------
        // YEAR NEWEST → OLDEST
        // -----------------------------------------------------

        case "year-desc":
            return sorted.sort((a, b) => {
                const yearA = Number(a.year) || 0;
                const yearB = Number(b.year) || 0;

                return yearB - yearA;
            });

        // -----------------------------------------------------
        // YEAR OLDEST → NEWEST
        // -----------------------------------------------------

        case "year-asc":
            return sorted.sort((a, b) => {
                const yearA = Number(a.year) || 0;
                const yearB = Number(b.year) || 0;

                return yearA - yearB;
            });

        // -----------------------------------------------------
        // TITLE A → Z
        // -----------------------------------------------------

        case "title-asc":
            return sorted.sort((a, b) =>
                (a.title || "").localeCompare(
                    b.title || "",
                    undefined,
                    { sensitivity: "base" }
                )
            );

        // -----------------------------------------------------
        // TITLE Z → A
        // -----------------------------------------------------

        case "title-desc":
            return sorted.sort((a, b) =>
                (b.title || "").localeCompare(
                    a.title || "",
                    undefined,
                    { sensitivity: "base" }
                )
            );

        default:
            return sorted;
    }
}

// =============================================================
// SORT CONTROL
// =============================================================

if (sortSelect){

    sortSelect.addEventListener("change", () => {

        activeSort = sortSelect.value;

        applyFilters();

    });

}

// =============================================================
// MY LIST TOGGLE
// =============================================================

const myListToggle = document.getElementById("myListToggle");

myListToggle.addEventListener("click", () => {

    myListActive = !myListActive;

    myListToggle.classList.toggle(
        "active",
        myListActive
    );

    applyFilters();
});

// =============================================================
// BUILD GENRE FILTER PILLS
// =============================================================

function buildGenreBar(movieList){

    const allGenres = movieList.flatMap(
        m => splitGenres(m.genre)
    );

    const genres = [
        "All",
        ...new Set(allGenres)
    ];

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

            genreBar
                .querySelectorAll(".genre-pill")
                .forEach(p =>
                    p.classList.remove("active")
                );

            pill.classList.add("active");

            applyFilters();

        });

    });
}

// =============================================================
// COMBINE SEARCH + GENRE + WATCHLIST + SORT
// =============================================================

function applyFilters(){

    const search = searchBox.value.toLowerCase();

    const watchlist = getWatchlist();

    const filtered = movies.filter(movie => {

        const matchesGenre =
            activeGenre === "All" ||
            splitGenres(movie.genre).includes(activeGenre);

        const matchesSearch =
            movie.title.toLowerCase().includes(search) ||
            movie.genre.toLowerCase().includes(search) ||
            (movie.description || "")
                .toLowerCase()
                .includes(search);

        const matchesWatchlist =
            !myListActive ||
            watchlist.includes(String(movie.id));

        return (
            matchesGenre &&
            matchesSearch &&
            matchesWatchlist
        );

    });

    const sorted = sortMovies(filtered);

    displayMovies(sorted);
}

// =============================================================
// DISPLAY MOVIES
// =============================================================

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

            <div
                class="movie-card"
                style="animation-delay:${Math.min(i, 8) * 0.05}s"
                onclick="openMovie('${movie.id}')">

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

                        <span>
                            <i class="fa-regular fa-calendar"></i>
                            ${movie.year}
                        </span>

                        <span>
                            <i class="fa-solid fa-masks-theater"></i>
                            ${movie.genre}
                        </span>

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

// =============================================================
// SEARCH
// =============================================================

searchBox.addEventListener(
    "input",
    applyFilters
);

// =============================================================
// OPEN MOVIE
// =============================================================

function openMovie(id){

    window.location.href =
        `movie.html?id=${id}`;

}

// =============================================================
// TOGGLE WATCHLIST
// =============================================================

function handleWatchlistToggle(id, button){

    const inList = toggleWatchlist(
        id
    );

    button.classList.toggle(
        "active",
        inList
    );

    // If viewing My List and an item was just removed,
    // drop it immediately.
    if(myListActive && !inList){

        applyFilters();

    }

}

// =============================================================
// START
// =============================================================

loadMovies();
