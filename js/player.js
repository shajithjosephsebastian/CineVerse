const params = new URLSearchParams(window.location.search);

const movieId = params.get("id");

fetch("data/movies.json")
.then(response => response.json())
.then(movies=>{

    const movie = movies.find(m=>m.id===movieId);

    if(!movie){

        document.body.innerHTML=`

        <div class="container text-center mt-5">

            <h2>

                Movie not found

            </h2>

        </div>

        `;

        return;

    }

    document.title = movie.title;

    document.getElementById("playerTitle").textContent = movie.title;

    document.getElementById("playerDescription").textContent =
        movie.description;

    document.getElementById("playerMeta").innerHTML =

        `⭐ ${movie.rating} |
         📅 ${movie.year} |
         🎭 ${movie.genre}`;

    document.getElementById("videoFrame").src =
        movie.video;

});
