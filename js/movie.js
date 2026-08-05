const params = new URLSearchParams(window.location.search);

const movieId = params.get("id");

fetch("data/movies.json")
.then(response => response.json())
.then(movies => {

    const movie = movies.find(m => m.id === movieId);

    if(!movie){

        document.body.innerHTML = `
        <div class="container text-center mt-5">

            <h1>Movie Not Found</h1>

            <a href="index.html"
               class="btn btn-primary mt-3">

               Go Home

            </a>

        </div>
        `;

        return;

    }

    document.title = movie.title + " | CineVerse";

    document.getElementById("moviePoster").src = movie.poster;

    document.getElementById("movieTitle").textContent = movie.title;

    document.getElementById("movieMeta").innerHTML = `
        ⭐ ${movie.rating}
        &nbsp;&nbsp;|&nbsp;&nbsp;
        📅 ${movie.year}
        &nbsp;&nbsp;|&nbsp;&nbsp;
        🎭 ${movie.genre}
    `;

    document.getElementById("movieDescription").textContent = movie.description;

    document.getElementById("watchButton").href =
        `player.html?id=${movie.id}`;

})
.catch(error => {

    console.error(error);

});
