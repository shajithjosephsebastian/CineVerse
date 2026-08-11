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

with open("imdb_list.json", "r", encoding="utf-8") as f:
    movie_list = json.load(f)

movies = []

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


for item in movie_list:

    imdb_id = item.get("imdb")
    tmdb_id = item.get("tmdb")

    if not imdb_id and not tmdb_id:
        print("Skipping movie with no IMDb or TMDb ID.")
        continue

    # Convert IDs to strings
    if imdb_id:
        imdb_id = str(imdb_id)

    if tmdb_id:
        tmdb_id = str(tmdb_id)

    movie = None

    # =========================================================
    # CASE 1:
    # We already have a TMDb ID.
    #
    # This is the preferred method because it requires only
    # ONE TMDb request to get the complete movie details.
    # =========================================================

    if tmdb_id:

        print(
            f"Fetching movie details from TMDb ID: "
            f"{tmdb_id}"
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

        # If IMDb ID is missing, get it from TMDb
        if not imdb_id:
            imdb_id = movie.get("imdb_id", "")

    # =========================================================
    # CASE 2:
    # We only have an IMDb ID.
    #
    # Find the TMDb ID first.
    # =========================================================

    elif imdb_id and imdb_id.startswith("tt"):

        print(
            f"Finding TMDb movie for IMDb ID: "
            f"{imdb_id}"
        )

        url = (
            f"https://api.themoviedb.org/3/find/"
            f"{imdb_id}?external_source=imdb_id"
        )

        response = requests.get(
            url,
            headers=headers
        )

        response.raise_for_status()

        result = response.json()

        if not result.get("movie_results"):
            print(
                f"Movie not found: IMDb ID {imdb_id}"
            )
            continue

        movie = result["movie_results"][0]

        tmdb_id = str(movie["id"])

        # -----------------------------------------------------
        # IMPORTANT:
        # The /find endpoint does not give us all movie details.
        # Fetch the full movie details using the TMDb ID.
        # -----------------------------------------------------

        print(
            f"Fetching full details from TMDb ID: "
            f"{tmdb_id}"
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
            f"Invalid movie ID: "
            f"IMDb={imdb_id}, TMDb={tmdb_id}"
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
    # VIDEO URL
    # =========================================================

    video = ""

    if imdb_id:

        video = (
            f"https://streamimdb.ru/embed/movie/"
            f"{imdb_id}"
        )

    # =========================================================
    # ADD MOVIE
    # =========================================================

    movies.append({

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

    })


# =============================================================
# WRITE movies.json
# =============================================================

os.makedirs(
    "data",
    exist_ok=True
)

with open(
    "data/movies.json",
    "w",
    encoding="utf-8"
) as f:

    json.dump(
        movies,
        f,
        indent=2,
        ensure_ascii=False
    )

print(
    f"movies.json generated successfully! "
    f"{len(movies)} movies processed."
)
