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
# FILES
# =============================================================

movie_list_file = "imdb_list.json"
movies_file = "data/movies.json"

# =============================================================
# LOAD imdb_list.json
# =============================================================

with open(movie_list_file, "r", encoding="utf-8") as f:
    movie_list = json.load(f)

if not isinstance(movie_list, list):
    raise Exception("imdb_list.json must contain an array.")

# =============================================================
# LOAD EXISTING movies.json
# =============================================================

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
updated_entries = 0
trailers_added = 0
failed_movies = 0


# =============================================================
# GET TRAILER
#
# Reads the trailer out of a movie details response that was
# already fetched with append_to_response=videos, so this adds
# ZERO extra TMDb requests — the trailer data rides along with
# the movie details we're fetching anyway.
# =============================================================

def get_trailer(movie):

    if not movie:
        return ""

    videos = movie.get("videos", {}).get("results", [])

    youtube_trailers = [
        v for v in videos
        if v.get("site") == "YouTube"
        and v.get("type") == "Trailer"
    ]

    if not youtube_trailers:
        return ""

    official = [
        v for v in youtube_trailers
        if v.get("official") is True
    ]

    chosen = (
        official[0]
        if official
        else youtube_trailers[0]
    )

    key = chosen.get("key")

    if not key:
        return ""

    return f"https://www.youtube.com/embed/{key}"


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

        # -----------------------------------------------------
        # Recover IDs from cached movie
        # -----------------------------------------------------

        cached_imdb = cached_movie.get("id")
        cached_tmdb = cached_movie.get("tmdb_id")

        if cached_imdb:
            imdb_id = str(cached_imdb)

        if cached_tmdb:
            tmdb_id = str(cached_tmdb)

        # -----------------------------------------------------
        # Update imdb_list.json entry if necessary
        # -----------------------------------------------------

        original_item = dict(item)

        if imdb_id:
            item["imdb"] = imdb_id

        if tmdb_id:
            item["tmdb"] = tmdb_id

        if item != original_item:
            updated_entries += 1

        # -----------------------------------------------------
        # Make sure cached movie has the correct IDs
        # -----------------------------------------------------

        cached_movie["id"] = imdb_id if imdb_id else tmdb_id

        cached_movie["tmdb_id"] = (
            int(tmdb_id)
            if tmdb_id
            else ""
        )

        movies.append(cached_movie)

        cached_movies += 1

        continue

    # =========================================================
    # NEW MOVIE
    #
    # Everything below is wrapped in a try/except: if this one
    # movie fails (bad ID, TMDb hiccup, unexpected response
    # shape), we log it and move on to the next movie instead
    # of losing the entire run's progress.
    # =========================================================

    print(
        f"New movie detected: "
        f"IMDb={imdb_id}, TMDb={tmdb_id}"
    )

    try:

        movie = None

        # =====================================================
        # CASE 1
        # TMDb ID available
        #
        # ONE TMDb request
        # =====================================================

        if tmdb_id:

            print(
                f"Fetching TMDb details: {tmdb_id}"
            )

            url = (
                f"https://api.themoviedb.org/3/movie/"
                f"{tmdb_id}?language=en-US&append_to_response=videos"
            )

            response = requests.get(
                url,
                headers=headers,
                timeout=20
            )

            response.raise_for_status()

            movie = response.json()

            if not movie.get("id"):

                print(
                    f"Movie not found: TMDb ID {tmdb_id}"
                )

                continue

            # -------------------------------------------------
            # Get IMDb ID from the same TMDb response
            # -------------------------------------------------

            if not imdb_id:

                imdb_id = movie.get("imdb_id", "")

                if imdb_id:
                    imdb_id = str(imdb_id)

        # =====================================================
        # CASE 2
        # Only IMDb ID available
        #
        # TWO TMDb requests
        #
        # IMDb → /find
        # TMDb → /movie
        #
        # This is only for old entries.
        # =====================================================

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
                headers=headers,
                timeout=20
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

            # -------------------------------------------------
            # Get full movie details
            # -------------------------------------------------

            print(
                f"Fetching full details: "
                f"TMDb ID {tmdb_id}"
            )

            details_url = (
                f"https://api.themoviedb.org/3/movie/"
                f"{tmdb_id}?language=en-US&append_to_response=videos"
            )

            details_response = requests.get(
                details_url,
                headers=headers,
                timeout=20
            )

            details_response.raise_for_status()

            movie = details_response.json()

        # =====================================================
        # INVALID ENTRY
        # =====================================================

        else:

            print(
                f"Invalid movie entry: "
                f"{item}"
            )

            continue

        # =====================================================
        # UPDATE imdb_list.json
        #
        # This is the important part.
        #
        # The IMDb ID comes directly from the movie details
        # response, so NO additional TMDb request is needed.
        # =====================================================

        original_item = dict(item)

        if imdb_id:
            item["imdb"] = imdb_id

        if tmdb_id:
            item["tmdb"] = str(tmdb_id)

        if item != original_item:
            updated_entries += 1

        # =====================================================
        # GENRES
        # =====================================================

        genres = [
            genre_lookup.get(
                genre["id"],
                str(genre["id"])
            )
            for genre in movie.get("genres", [])
        ]

        # =====================================================
        # POSTER
        # =====================================================

        poster = ""

        if movie.get("poster_path"):

            poster = (
                "https://image.tmdb.org/t/p/w500"
                + movie["poster_path"]
            )

        # =====================================================
        # BACKDROP
        #
        # Comes free from the same response as poster/trailer —
        # no extra TMDb request. Used as a full-bleed banner on
        # the movie detail page.
        # =====================================================

        backdrop = ""

        if movie.get("backdrop_path"):

            backdrop = (
                "https://image.tmdb.org/t/p/w1280"
                + movie["backdrop_path"]
            )

        # =====================================================
        # YEAR
        # =====================================================

        year = ""

        if movie.get("release_date"):

            year = movie["release_date"][:4]

        # =====================================================
        # VIDEO
        # =====================================================

        video = ""

        if imdb_id:

            video = (
                f"https://streamimdb.ru/embed/movie/"
                f"{imdb_id}"
            )

        # =====================================================
        # TRAILER
        #
        # Comes free from the same request above thanks to
        # append_to_response=videos — no extra TMDb call.
        # =====================================================

        trailer = get_trailer(movie)

        if trailer:
            trailers_added += 1

        # =====================================================
        # CREATE MOVIE OBJECT
        # =====================================================

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

            "backdrop": backdrop,

            "description": movie.get(
                "overview",
                ""
            ),

            "video": video,

            "trailer": trailer
        }

        movies.append(movie_data)

        new_movies += 1

    except requests.RequestException as error:

        print(
            f"  FAILED (network/TMDb error) for "
            f"IMDb={imdb_id}, TMDb={tmdb_id}: {error}"
        )

        failed_movies += 1

        continue

    except (KeyError, ValueError, TypeError) as error:

        print(
            f"  FAILED (unexpected data) for "
            f"IMDb={imdb_id}, TMDb={tmdb_id}: {error}"
        )

        failed_movies += 1

        continue

# =============================================================
# SAVE imdb_list.json
# =============================================================

with open(
    movie_list_file,
    "w",
    encoding="utf-8"
) as f:

    json.dump(
        movie_list,
        f,
        indent=2,
        ensure_ascii=False
    )

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
print("CineVerse generation complete!")
print("========================================")
print(f"Cached movies:   {cached_movies}")
print(f"New movies:      {new_movies}")
print(f"Updated entries: {updated_entries}")
print(f"Trailers added:  {trailers_added}")
print(f"Failed movies:   {failed_movies}")
print(f"Total movies:    {len(movies)}")
print("========================================")
