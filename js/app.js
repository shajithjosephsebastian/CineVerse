const movieContainer = document.getElementById("movieContainer");
const searchBox = document.querySelector(".search-box");

let movies = [];

// Load Movies
async function loadMovies() {

    try {

        const response = await fetch("data/movies.json");

        movies = await response.json();

        displayMovies(movies);

    }

    catch(error){

        console.error(error);

        movieContainer.innerHTML = `
            <div class="text-center text-danger">
                Failed to load movies.
            </div>
        `;

    }

}

// Display Movies

function displayMovies(movieList){

    movieContainer.innerHTML = "";

    if(movieList.length === 0){

        movieContainer.innerHTML = `
            <div class="col-12 text-center py-5">

                <h3>No movies found</h3>

            </div>
        `;

        return;

    }

    movieList.forEach(movie=>{

        movieContainer.innerHTML += `

        <div class="col-lg-3 col-md-4 col-sm-6 mb-4">

            <div class="movie-card">

                <img
                    src="${movie.poster}"
                    class="movie-poster"
                    alt="${movie.title}">

                <div class="movie-content">

                    <div class="movie-title">

                        ${movie.title}

                    </div>

                    <div class="movie-info">

                        ⭐ ${movie.rating}

                        <br>

                        📅 ${movie.year}

                        <br>

                        🎭 ${movie.genre}

                    </div>

                    <button
                        class="watch-btn"
                        onclick="openMovie('${movie.id}')">

                        Watch Now

                    </button>

                </div>

            </div>

        </div>

        `;

    });

}
// Search

searchBox.addEventListener("input",()=>{

    const search = searchBox.value.toLowerCase();

    const filtered = movies.filter(movie =>

    movie.title.toLowerCase().includes(search) ||

    movie.genre.toLowerCase().includes(search) ||

    movie.description.toLowerCase().includes(search)

);

    displayMovies(filtered);

});

// Open Movie

function openMovie(id){

    window.location.href=`movie.html?id=${id}`;

}

loadMovies();
