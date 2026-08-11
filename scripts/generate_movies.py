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

# ---------------------------------------------------------
# Load movie list
# ---------------------------------------------------------

with open("imdb_list.json", "r", encoding="utf-8") as f:
    movie_list = json.load(f)

movies = []

# ---------------------------------------------------------
# Genre lookup
# ---------------------------------------------------------

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

# ---------------------------------------------------------
# Process movies
# ---------------------------------------------------------

for item in movie_list:

    # =====================================================
    # CASE 1: TMDb ID
    # =====================================================

    if "tmdb" in item:

        tmdb_id = str(item["tmdb"]).strip()

        if not tmdb_id:
            print("Empty TMDb ID. Skipping.")
            continue

        print(f"Fetching movie using TMDb ID: {tmdb_id}")

        url = (
            f"https://api.themoviedb.org/3/movie/{tmdb_id}"
        )

        response = requests.get(
            url,
            headers=headers,
            timeout=30
        )

        if response.status_code == 404:
            print(f"TMDb movie not found: {tmdb_id}")
            continue

        response.raise_for_status()

        movie = response.json()

        # We don't necessarily have an IMDb ID here.
        imdb_id = None

        # TMDb's movie details response can contain the IMDb ID
        # when append_to_response=external_ids is requested.
        #
        # However, to keep this to ONE request, we don't make
        # another request just to obtain the IMDb ID.

        video_id = tmdb_id

    # =====================================================
    # CASE 2: IMDb ID
    # =====================================================

    elif "imdb" in item:

        imdb_id = str(item["imdb"]).strip()

        if not imdb_id:
            print("Empty IMDb ID. Skipping.")
            continue

        print(f"Finding TMDb movie using IMDb ID: {imdb_id}")

        url = (
            f"https://api.themoviedb.org/3/find/"
            f"{imdb_id}"
            f"?external_source=imdb_id"
        )

        response = requests.get(
            url,
            headers=headers,
            timeout=30
        )

        response.raise_for_status()

        result = response.json()

        if not result.get("movie_results"):
            print(f"Movie not found for IMDb ID: {imdb_id}")
            continue

        movie = result["movie_results"][0]

        tmdb_id = str(movie["id"])

        video_id = imdb_id

    # =====================================================
    # INVALID ENTRY
    # =====================================================

    else:

        print(
            "Invalid movie entry. "
            "Expected 'imdb' or 'tmdb'."
        )

        continue

    # =====================================================
    # Genres
    # =====================================================

    genres = []

    # /movie/{id} returns full genre objects
    if "genres" in movie:

        genres = [
            genre_lookup.get(
                genre["id"],
                str(genre["id"])
            )
            for genre in movie["genres"]
        ]

    # /find/{imdb_id} returns genre_ids
    elif "genre_ids" in movie:

        genres = [
            genre_lookup.get(
                g,
                str(g)
            )
            for g in movie["genre_ids"]
        ]

    # =====================================================
    # Poster
    # =====================================================

    poster = ""

    if movie.get("poster_path"):

        poster = (
            "https://image.tmdb.org/t/p/w500"
            + movie["poster_path"]
        )

    # =====================================================
    # Release year
    # =====================================================

    year = ""

    if movie.get("release_date"):

        year = movie["release_date"][:4]

    # =====================================================
    # Video URL
    # =====================================================

    video = (
        f"https://streamimdb.ru/embed/movie/{video_id}"
    )

    # =====================================================
    # Add movie
    # =====================================================

    movies.append({

        "id": tmdb_id,

        "title": movie.get("title", ""),

        "year": int(year) if year else "",

        "genre": ", ".join(genres),

        "rating": movie.get("vote_average", 0),

        "poster": poster,

        "description": movie.get("overview", ""),

        "video": video

    })

# ---------------------------------------------------------
# Generate movies.json
# ---------------------------------------------------------

os.makedirs("data", exist_ok=True)

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
