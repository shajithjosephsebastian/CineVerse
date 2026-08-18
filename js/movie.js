const skeleton = document.getElementById("detailSkeleton");
const content = document.getElementById("detailContent");
const notFound = document.getElementById("detailNotFound");

// Reuse the same genre-splitting logic as the catalog page (handles "Action, Sci-Fi")
function splitGenres(genreField){
    return (genreField || "")
        .split(",")
        .map(g => g.trim())
        .filter(Boolean);
}

function getMovieId(){
    const params = new URLSearchParams(window.location.search);
    return params.get("id");
}

function showNotFound(){
    skeleton.classList.add("d-none");
    content.classList.add("d-none");
    notFound.classList.remove("d-none");
}

function renderMovie(movie){
    document.title = `${movie.title} — CineVerse`;

    if (movie.backdrop) {
        document.getElementById("backdropHero")
            .style.setProperty("--backdrop-image", `url("${movie.backdrop}")`);
    }

    const poster = document.getElementById("moviePoster");
    poster.src = movie.poster;
    poster.alt = movie.title;

    document.getElementById("movieTitle").textContent = movie.title;
    document.getElementById("movieRating").textContent = movie.rating;

    const meta = document.getElementById("movieMeta");
    const genreChips = splitGenres(movie.genre)
        .map(g => `<span class="meta-chip"><i class="fa-solid fa-masks-theater"></i> ${g}</span>`)
        .join("");
    meta.innerHTML = `
        <span class="meta-chip"><i class="fa-regular fa-calendar"></i> ${movie.year}</span>
        ${genreChips}
    `;

    document.getElementById("movieDescription").textContent =
        movie.description || "No synopsis available for this title yet.";

    const watchButton = document.getElementById("watchButton");
    watchButton.href = `player.html?id=${movie.id}`;

    setupTrailer(movie.trailer);

    skeleton.classList.add("d-none");
    content.classList.remove("d-none");
}

// Show the trailer button only if a trailer exists, and lazy-load
// the iframe on modal open so it doesn't load or play in the background.
function setupTrailer(trailerUrl){
    const trailerButton = document.getElementById("trailerButton");
    const trailerFrame = document.getElementById("trailerFrame");
    const trailerModalEl = document.getElementById("trailerModal");

    if (!trailerUrl) {
        trailerButton.classList.add("d-none");
        return;
    }

    trailerButton.classList.remove("d-none");

    trailerModalEl.addEventListener("show.bs.modal", () => {
        trailerFrame.src = `${trailerUrl}?autoplay=1`;
    });
    trailerModalEl.addEventListener("hidden.bs.modal", () => {
        trailerFrame.src = "";
    });
}

async function loadMovie(){
    const id = getMovieId();
    if (!id) {
        showNotFound();
        return;
    }
    try {
        const response = await fetch("data/movies.json");
        if (!response.ok) throw new Error("Request failed");
        const movies = await response.json();
        const movie = movies.find(m => String(m.id) === String(id));
        if (!movie) {
            showNotFound();
            return;
        }
        renderMovie(movie);
    }
    catch(error){
        console.error(error);
        showNotFound();
    }
}

loadMovie();
