// =====================================================
// VIDEO PLAYER PAGE (player.html)
// Reads ?id= from the URL, finds the movie in
// movies.json, and loads its video into the iframe.
// =====================================================

const skeleton = document.getElementById("playerSkeleton");
const content = document.getElementById("playerContent");
const notFound = document.getElementById("playerNotFound");
const movieId = new URLSearchParams(window.location.search).get("id");

function showNotFound() {
    skeleton.classList.add("d-none");
    content.classList.add("d-none");
    notFound.classList.remove("d-none");
}

fetch("data/movies.json")
    .then(response => response.json())
    .then(movies => {
        const movie = movies.find(m => m.id === movieId);
        if (!movie) return showNotFound();

        document.title = `${movie.title} | CineVerse`;
        document.getElementById("playerTitle").textContent = movie.title;
        document.getElementById("playerDescription").textContent = movie.description;

        const genreChips = splitGenres(movie.genre)
            .map(g => `<span class="meta-chip"><i class="fa-solid fa-masks-theater"></i> ${g}</span>`).join("");

        document.getElementById("playerMeta").innerHTML = `
            <span class="meta-chip">${ratingBadgeContent(movie.rating)}</span>
            <span class="meta-chip"><i class="fa-regular fa-calendar"></i> ${movie.year}</span>
            ${genreChips}`;

        document.getElementById("videoFrame").src = movie.video;

        skeleton.classList.add("d-none");
        content.classList.remove("d-none");
    })
    .catch(error => {
        console.error(error);
        showNotFound();
    });
