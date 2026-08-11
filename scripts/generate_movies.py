import json
import os
import requests

TMDB_TOKEN = os.getenv("TMDB_API_TOKEN")

if not TMDB_TOKEN:
    raise Exception("TMDB_API_TOKEN environment variable not found.")

headers = {
    "Authorization": f"Bearer {TMDB_TOKEN}",
    "accept": "application/json"
}

# =============================================================
# LOAD imdb_list.json
# =============================================================

with open("imdb_list.json", "r", encoding="utf-8") as f:
    movie_list = json.load(f)


# =============================================================
# LOAD EXISTING movies.json
# =============================================================

movies_file = "data/movies.json"

if os.path.exists(movies_file):

    try:

        with open(movies_file, "r", encoding="utf-8") as f:
            existing_movies = json.load(f)

        if not isinstance(existing_movies, list):
            existing_movies = []

    except (json.JSONDecodeError, OSError):

        existing_movies = []

else:

    existing_movies = []


# =============================================================
# CREATE LOOKUPS
# =============================================================

existing_by_imdb = {}
existing_by_tmdb = {}

for movie in existing_movies:

    imdb_id = movie.get("id")

    tmdb_id = movie.get("tmdb_id")

    if imdb_id:
        existing_by_imdb[str(imdb_id)] = movie

    if tmdb_id:
        existing_by_tmdb[str(tmdb_id)] = movie


# =============================================================
# GENRE LOOKUP
# =============================================================

genre_lookup = {
    28: "Action",
    12: "Adventure",
    16: "Animation",
    35: "Comedy",
    80: "Crime",
    99: "Documentary",
    18: "Drama",
    10751: "Family",
    14: "Fantasy",
    36: "History",
    27: "Horror",
    10402: "Music",
    9648: "Mystery",
    10749: "Romance",
    878: "Science Fiction",
    10770: "TV Movie",
    53: "Thriller",
    10752: "War",
    37: "Western"
}


movies = []

new_movies = 0
cached_movies = 0


# =============================================================
# PROCESS MOVIES
# =============================================================

for item in movie_list:

    imdb_id = item.get("imdb")
    tmdb_id = item.get("tmdb")

    if imdb_id:
        imdb_id = str(imdb_id)

    if tmdb_id:
        tmdb_id = str(tmdb_id)


    # =========================================================
    # CHECK CACHE
    # =========================================================

    cached_movie = None

    if imdb_id and imdb_id in existing_by_imdb:
        cached_movie = existing_by_imdb[imdb_id]

    elif tmdb_id and tmdb_id in existing_by_tmdb:
        cached_movie = existing_by_tmdb[tmdb_id]


    # =========================================================
    # MOVIE ALREADY EXISTS
    # =========================================================

    if cached_movie:

        print(
            f"Using cached movie: "
            f"{cached_movie.get('title', 'Unknown')}"
        )

        movies.append(cached_movie)

        cached_movies += 1

        continue


    # =========================================================
    # NEW MOVIE
    # =========================================================

    print(
        f"New movie detected: "
        f"IMDb={imdb_id}, TMDb={tmdb_id}"
    )


    movie = None


    # =========================================================
    # CASE 1
    # TMDb ID already available
    #
    # One TMDb request.
    # =========================================================

    if tmdb_id:

        print(
            f"Fetching TMDb details: {tmdb_id}"
        )

        url = (
            f"https://api.themoviedb.org/3/movie/"
            f"{tmdb_id}?language=en-US"
        )

        response = requests.get(
            url,
            headers=headers
        )

        response.raise_for_status()

        movie = response.json()

        if not movie.get("id"):

            print(
                f"Movie not found: TMDb ID {tmdb_id}"
            )

            continue


        # If IMDb ID isn't present, get it from TMDb.

        if not imdb_id:

            imdb_id = movie.get("imdb_id", "")


    # =========================================================
    # CASE 2
    # Only IMDb ID available
    #
    # Two TMDb requests:
    #
    # IMDb → /find
    # TMDb → /movie
    #
    # This only applies to old entries.
    # =========================================================

    elif imdb_id and imdb_id.startswith("tt"):

        print(
            f"Finding TMDb ID for IMDb ID: "
            f"{imdb_id}"
        )

        find_url = (
            f"https://api.themoviedb.org/3/find/"
            f"{imdb_id}?external_source=imdb_id"
        )

        response = requests.get(
            find_url,
            headers=headers
        )

        response.raise_for_status()

        result = response.json()

        if not result.get("movie_results"):

            print(
                f"Movie not found: IMDb ID {imdb_id}"
            )

            continue

        tmdb_id = str(
            result["movie_results"][0]["id"]
        )


        # Get full movie details.

        print(
            f"Fetching full details: "
            f"TMDb ID {tmdb_id}"
        )

        details_url = (
            f"https://api.themoviedb.org/3/movie/"
            f"{tmdb_id}?language=en-US"
        )

        details_response = requests.get(
            details_url,
            headers=headers
        )

        details_response.raise_for_status()

        movie = details_response.json()


    else:

        print(
            f"Invalid movie entry: "
            f"{item}"
        )

        continue


    # =========================================================
    # GENRES
    # =========================================================

    genres = [
        genre_lookup.get(
            genre["id"],
            str(genre["id"])
        )
        for genre in movie.get("genres", [])
    ]


    # =========================================================
    # POSTER
    # =========================================================

    poster = ""

    if movie.get("poster_path"):

        poster = (
            "https://image.tmdb.org/t/p/w500"
            + movie["poster_path"]
        )


    # =========================================================
    # YEAR
    # =========================================================

    year = ""

    if movie.get("release_date"):

        year = movie["release_date"][:4]


    # =========================================================
    # VIDEO
    # =========================================================

    video = ""

    if imdb_id:

        video = (
            f"https://streamimdb.ru/embed/movie/"
            f"{imdb_id}"
        )


    # =========================================================
    # CREATE MOVIE OBJECT
    # =========================================================

    movie_data = {

        "id": imdb_id if imdb_id else tmdb_id,

        "tmdb_id": int(tmdb_id)
        if tmdb_id
        else "",

        "title": movie.get(
            "title",
            ""
        ),

        "year": int(year)
        if year
        else "",

        "genre": ", ".join(genres),

        "rating": movie.get(
            "vote_average",
            0
        ),

        "poster": poster,

        "description": movie.get(
            "overview",
            ""
        ),

        "video": video

    }


    movies.append(movie_data)

    new_movies += 1


# =============================================================
# SAVE movies.json
# =============================================================

os.makedirs(
    "data",
    exist_ok=True
)

with open(
    movies_file,
    "w",
    encoding="utf-8"
) as f:

    json.dump(
        movies,
        f,
        indent=2,
        ensure_ascii=False
    )


# =============================================================
# SUMMARY
# =============================================================

print()
print("========================================")
print("movies.json generated successfully!")
print("========================================")
print(f"Cached movies: {cached_movies}")
print(f"New movies:    {new_movies}")
print(f"Total movies:  {len(movies)}")
print("========================================")
