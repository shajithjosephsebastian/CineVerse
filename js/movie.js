// =====================================================
// MOVIE DETAIL PAGE (movie.html)
// Reads ?id= from the URL, finds that movie in
// movies.json, and populates the page: poster, meta,
// credits, trailer modal, watchlist button, and a
// "Similar Movies" row computed from shared genres.
// =====================================================

const skeleton = document.getElementById("detailSkeleton");
const content = document.getElementById("detailContent");
const notFound = document.getElementById("detailNotFound");

function getMovieId() {
    return new URLSearchParams(window.location.search).get("id");
}

function showNotFound() {
    skeleton.classList.add("d-none");
    content.classList.add("d-none");
    notFound.classList.remove("d-none");
}

// ---------- OPEN GRAPH META (best effort) ----------
// NOTE: most link-preview bots (WhatsApp, Discord, iMessage) fetch raw
// HTML and do NOT run JavaScript, so this won't make shared movie links
// show that movie's own poster/title in a chat preview — those still see
// the generic tags in <head>. True per-movie previews need the page
// pre-rendered server-side. Still worth doing for the tab title, bookmarks,
// and any crawler that does run JS.
function setMetaTag(attr, key, value) {
    let tag = document.querySelector(`meta[${attr}="${key}"]`);
    if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute(attr, key);
        document.head.appendChild(tag);
    }
    tag.setAttribute("content", value);
}

function updateMetaForMovie(movie) {
    setMetaTag("property", "og:title", `${movie.title} — CineVerse`);
    setMetaTag("property", "og:description",
        movie.description ? movie.description.slice(0, 160) : "Browse movies, watch trailers, and build your watchlist on CineVerse.");
    if (movie.backdrop || movie.poster) setMetaTag("property", "og:image", movie.backdrop || movie.poster);
}

// ---------- RENDER ----------

function renderMovie(movie, allMovies) {
    document.title = `${movie.title} — CineVerse`;
    updateMetaForMovie(movie);

    if (movie.backdrop) {
        document.getElementById("backdropHero").style.setProperty("--backdrop-image", `url("${movie.backdrop}")`);
    }

    const poster = document.getElementById("moviePoster");
    poster.src = movie.poster;
    poster.alt = movie.title;

    document.getElementById("movieTitle").textContent = movie.title;

    const ratingBadge = document.getElementById("movieRatingBadge");
    ratingBadge.classList.toggle("rating-badge-unreleased", isUnreleasedRating(movie.rating));
    ratingBadge.innerHTML = ratingBadgeContent(movie.rating);

    const genreChips = splitGenres(movie.genre)
        .map(g => `<span class="meta-chip"><i class="fa-solid fa-masks-theater"></i> ${g}</span>`).join("");
    const runtimeChip = movie.runtime
        ? `<span class="meta-chip"><i class="fa-regular fa-clock"></i> ${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m</span>` : "";
    const certChip = movie.certification
        ? `<span class="meta-chip"><i class="fa-solid fa-shield-halved"></i> ${movie.certification}</span>` : "";

    document.getElementById("movieMeta").innerHTML = `
        <span class="meta-chip"><i class="fa-regular fa-calendar"></i> ${movie.year}</span>
        ${runtimeChip}${certChip}${genreChips}`;

    document.getElementById("movieDescription").textContent =
        movie.description || "No synopsis available for this title yet.";

    document.getElementById("watchButton").href = `player.html?id=${movie.id}`;

    setupTrailer(movie.trailer);
    setupWatchlist(movie.id);
    setupCredits(movie);
    renderRelated(movie, allMovies);

    skeleton.classList.add("d-none");
    content.classList.remove("d-none");
}

// ---------- CREDITS ----------

function setupCredits(movie) {
    let html = "";
    if (movie.director) html += `<p><span class="credit-label">Director</span> ${movie.director}</p>`;
    if (movie.cast) html += `<p><span class="credit-label">Cast</span> ${movie.cast}</p>`;
    document.getElementById("movieCredits").innerHTML = html;
}

// ---------- WATCHLIST BUTTON ----------

function setupWatchlist(movieId) {
    const button = document.getElementById("watchlistButton");
    const label = document.getElementById("watchlistButtonLabel");

    const paint = inList => {
        button.classList.toggle("active", inList);
        label.textContent = inList ? "In Watchlist" : "Add to Watchlist";
    };

    paint(isInWatchlist(movieId));
    button.addEventListener("click", () => paint(toggleWatchlist(movieId)));
}

// ---------- RELATED MOVIES ----------
// Ranked by how many genres they share with the current movie, then
// by rating. Section stays hidden if nothing shares a genre.

function getRelatedMovies(movie, allMovies, limit = 8) {
    const currentGenres = splitGenres(movie.genre);

    return allMovies
        .filter(m => String(m.id) !== String(movie.id))
        .map(m => ({ movie: m, shared: splitGenres(m.genre).filter(g => currentGenres.includes(g)).length }))
        .filter(entry => entry.shared > 0)
        .sort((a, b) => b.shared - a.shared || (b.movie.rating || 0) - (a.movie.rating || 0))
        .slice(0, limit)
        .map(entry => entry.movie);
}

function renderRelated(movie, allMovies) {
    const section = document.getElementById("relatedSection");
    const related = getRelatedMovies(movie, allMovies);

    if (related.length === 0) {
        section.classList.add("d-none");
        return;
    }

    document.getElementById("relatedScroll").innerHTML = related.map(m => `
        <a class="related-card" href="movie.html?id=${m.id}">
            <div class="poster-frame">
                <img src="${m.poster}" class="movie-poster" alt="${m.title}" loading="lazy">
                ${ratingBadgeHTML(m.rating)}
            </div>
            <div class="related-card-title">${m.title}</div>
            <div class="related-card-year">${m.year}</div>
        </a>`).join("");

    section.classList.remove("d-none");
}

// ---------- TRAILER MODAL ----------
// Button only shows if a trailer exists. The iframe src is set on open
// and cleared on close so the trailer doesn't load/play in the background.

function setupTrailer(trailerUrl) {
    const trailerButton = document.getElementById("trailerButton");
    const trailerFrame = document.getElementById("trailerFrame");
    const trailerModalEl = document.getElementById("trailerModal");

    if (!trailerUrl) {
        trailerButton.classList.add("d-none");
        return;
    }

    trailerButton.classList.remove("d-none");
    trailerModalEl.addEventListener("show.bs.modal", () => { trailerFrame.src = `${trailerUrl}?autoplay=1`; });
    trailerModalEl.addEventListener("hidden.bs.modal", () => { trailerFrame.src = ""; });
}

// ---------- LOAD ----------

async function loadMovie() {
    const id = getMovieId();
    if (!id) return showNotFound();

    try {
        const response = await fetch("data/movies.json");
        if (!response.ok) throw new Error("Request failed");
        const movies = await response.json();
        const movie = movies.find(m => String(m.id) === String(id));

        if (!movie) return showNotFound();
        renderMovie(movie, movies);
    } catch (error) {
        console.error(error);
        showNotFound();
    }
}

loadMovie();
