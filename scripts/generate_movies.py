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
    imdb_movies = json.load(f)

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


for item in imdb_movies:

    imdb_id = item.get("imdb")
    tmdb_id = item.get("tmdb")

    if not imdb_id and not tmdb_id:
        print("Skipping entry with no IMDb or TMDb ID.")
        continue

    # ---------------------------------------------------------
    # Determine whether we have an IMDb ID or TMDb ID
    # ---------------------------------------------------------

    # IMDb IDs look like: tt0137523
    if imdb_id and str(imdb_id).startswith("tt"):

        imdb_id = str(imdb_id)

        # If TMDb ID is already stored, use it directly.
        if tmdb_id:
            tmdb_id = str(tmdb_id)

        else:
            # Find TMDb movie using IMDb ID
            print(f"Finding TMDb movie for IMDb ID: {imdb_id}")

            url = (
                f"https://api.themoviedb.org/3/find/"
                f"{imdb_id}?external_source=imdb_id"
            )

            response = requests.get(url, headers=headers)
            response.raise_for_status()

            result = response.json()

            if not result.get("movie_results"):
                print(f"Movie not found: {imdb_id}")
                continue

            movie = result["movie_results"][0]
            tmdb_id = str(movie["id"])

    else:

        # -----------------------------------------------------
        # Numeric value means TMDb ID
        # This supports your current imdb_list.json entries.
        # -----------------------------------------------------

        if not tmdb_id:
            tmdb_id = str(imdb_id)

        tmdb_id = str(tmdb_id)

        print(f"Fetching movie using TMDb ID: {tmdb_id}")

        url = f"https://api.themoviedb.org/3/movie/{tmdb_id}"

        response = requests.get(url, headers=headers)
        response.raise_for_status()

        movie = response.json()

        if not movie.get("id"):
            print(f"Movie not found: TMDb ID {tmdb_id}")
            continue

        # IMDb ID may not exist in this entry yet.
        # It can be added later by the admin system.
        if not imdb_id or not str(imdb_id).startswith("tt"):
            imdb_id = movie.get("imdb_id", "")

    # ---------------------------------------------------------
    # Get movie details
    # ---------------------------------------------------------

    genres = [
        genre_lookup.get(g["id"], str(g["id"]))
        for g in movie.get("genres", [])
    ]

    poster = ""

    if movie.get("poster_path"):
        poster = (
            "https://image.tmdb.org/t/p/w500"
            + movie["poster_path"]
        )

    year = ""

    if movie.get("release_date"):
        year = movie["release_date"][:4]

    # ---------------------------------------------------------
    # Video URL
    # ---------------------------------------------------------

    video = ""

    if imdb_id:
        video = f"https://streamimdb.ru/embed/movie/{imdb_id}"

    # ---------------------------------------------------------
    # Add movie
    # ---------------------------------------------------------

    movies.append({

        "id": imdb_id if imdb_id else tmdb_id,

        "tmdb_id": int(tmdb_id) if tmdb_id else "",

        "title": movie.get("title", ""),

        "year": int(year) if year else "",

        "genre": ", ".join(genres),

        "rating": movie.get("vote_average", 0),

        "poster": poster,

        "description": movie.get("overview", ""),

        "video": video

    })


# -------------------------------------------------------------
# Write movies.json
# -------------------------------------------------------------

os.makedirs("data", exist_ok=True)

with open("data/movies.json", "w", encoding="utf-8") as f:

    json.dump(
        movies,
        f,
        indent=2,
        ensure_ascii=False
    )

print(f"movies.json generated successfully! {len(movies)} movies processed.")
