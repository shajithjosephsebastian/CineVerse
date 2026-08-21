"""
Builds data/movies.json from imdb_list.json using the TMDb API.

For each entry in imdb_list.json:
  - If it's already in the existing movies.json (cached), reuse it as-is
    with ZERO TMDb requests.
  - If it's new, fetch full details from TMDb in ONE request (using
    append_to_response to also pull trailer/credits/certification in
    that same call) and build a movie record.

A failure on any single movie (bad ID, TMDb hiccup, unexpected shape) is
caught and logged so it doesn't take down the whole run — it just gets
skipped and retried on the next run.
"""

import json
import os
import requests

TMDB_TOKEN = os.getenv("TMDB_API_TOKEN")
if not TMDB_TOKEN:
    raise Exception("TMDB_API_TOKEN environment variable not found.")

HEADERS = {"Authorization": f"Bearer {TMDB_TOKEN}", "accept": "application/json"}

IMDB_LIST_FILE = "imdb_list.json"
MOVIES_FILE = "data/movies.json"

# TMDb genre id -> readable name
GENRE_LOOKUP = {
    28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
    99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
    27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance",
    878: "Science Fiction", 10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
}


# =============================================================
# TMDb field extractors
# All read from a single already-fetched /movie/{id} response
# (fetched with append_to_response=videos,credits,release_dates)
# — none of these make their own request.
# =============================================================

def get_trailer(movie):
    """Prefer an official YouTube trailer, fall back to the first one found."""
    videos = movie.get("videos", {}).get("results", [])
    youtube_trailers = [v for v in videos if v.get("site") == "YouTube" and v.get("type") == "Trailer"]
    if not youtube_trailers:
        return ""
    official = [v for v in youtube_trailers if v.get("official") is True]
    key = (official[0] if official else youtube_trailers[0]).get("key")
    return f"https://www.youtube.com/embed/{key}" if key else ""


def get_director(movie):
    for person in movie.get("credits", {}).get("crew", []):
        if person.get("job") == "Director":
            return person.get("name", "")
    return ""


def get_cast(movie, limit=5):
    names = [p.get("name", "") for p in movie.get("credits", {}).get("cast", [])[:limit]]
    return ", ".join(n for n in names if n)


def get_certification(movie):
    """US certification (e.g. PG-13) if TMDb has one."""
    for entry in movie.get("release_dates", {}).get("results", []):
        if entry.get("iso_3166_1") == "US":
            for release in entry.get("release_dates", []):
                if release.get("certification"):
                    return release["certification"]
    return ""


def fetch_movie_details(tmdb_id):
    """One TMDb request: details + videos + credits + release_dates."""
    url = (f"https://api.themoviedb.org/3/movie/{tmdb_id}"
           f"?language=en-US&append_to_response=videos,credits,release_dates")
    response = requests.get(url, headers=HEADERS, timeout=20)
    response.raise_for_status()
    return response.json()


def build_movie_record(movie, imdb_id, tmdb_id):
    """Turn a raw TMDb response into our stored movie shape."""
    genres = [GENRE_LOOKUP.get(g["id"], str(g["id"])) for g in movie.get("genres", [])]
    year = movie.get("release_date", "")[:4]
    poster = f"https://image.tmdb.org/t/p/w500{movie['poster_path']}" if movie.get("poster_path") else ""
    backdrop = f"https://image.tmdb.org/t/p/w1280{movie['backdrop_path']}" if movie.get("backdrop_path") else ""
    video = f"https://streamimdb.ru/embed/movie/{imdb_id}" if imdb_id else ""

    return {
        "id": imdb_id or tmdb_id,
        "tmdb_id": int(tmdb_id) if tmdb_id else "",
        "title": movie.get("title", ""),
        "year": int(year) if year else "",
        "genre": ", ".join(genres),
        "rating": movie.get("vote_average", 0),
        "poster": poster,
        "backdrop": backdrop,
        "description": movie.get("overview", ""),
        "video": video,
        "trailer": get_trailer(movie),
        "runtime": movie.get("runtime") or "",
        "director": get_director(movie),
        "cast": get_cast(movie),
        "certification": get_certification(movie),
    }


# =============================================================
# Load input + existing cache
# =============================================================

with open(IMDB_LIST_FILE, "r", encoding="utf-8") as f:
    movie_list = json.load(f)
if not isinstance(movie_list, list):
    raise Exception("imdb_list.json must contain an array.")

existing_movies = []
if os.path.exists(MOVIES_FILE):
    try:
        with open(MOVIES_FILE, "r", encoding="utf-8") as f:
            existing_movies = json.load(f)
        if not isinstance(existing_movies, list):
            existing_movies = []
    except (json.JSONDecodeError, OSError):
        existing_movies = []

existing_by_imdb = {str(m["id"]): m for m in existing_movies if m.get("id")}
existing_by_tmdb = {str(m["tmdb_id"]): m for m in existing_movies if m.get("tmdb_id")}

# =============================================================
# Process each entry
# =============================================================

movies = []
stats = {"new": 0, "cached": 0, "updated_entries": 0, "trailers": 0, "failed": 0}

for item in movie_list:
    imdb_id = str(item["imdb"]) if item.get("imdb") else None
    tmdb_id = str(item["tmdb"]) if item.get("tmdb") else None

    cached_movie = existing_by_imdb.get(imdb_id) or existing_by_tmdb.get(tmdb_id)

    # ---------- CACHED: reuse as-is, zero requests ----------
    if cached_movie:
        print(f"Using cached movie: {cached_movie.get('title', 'Unknown')}")

        imdb_id = str(cached_movie.get("id") or imdb_id or "")
        tmdb_id = str(cached_movie.get("tmdb_id") or tmdb_id or "")

        original_item = dict(item)
        if imdb_id:
            item["imdb"] = imdb_id
        if tmdb_id:
            item["tmdb"] = tmdb_id
        if item != original_item:
            stats["updated_entries"] += 1

        cached_movie["id"] = imdb_id or tmdb_id
        cached_movie["tmdb_id"] = int(tmdb_id) if tmdb_id else ""
        movies.append(cached_movie)
        stats["cached"] += 1
        continue

    # ---------- NEW MOVIE ----------
    print(f"New movie detected: IMDb={imdb_id}, TMDb={tmdb_id}")

    try:
        if tmdb_id:
            # Case 1: TMDb ID known — one request.
            movie = fetch_movie_details(tmdb_id)
            if not movie.get("id"):
                print(f"Movie not found: TMDb ID {tmdb_id}")
                continue
            if not imdb_id:
                imdb_id = str(movie.get("imdb_id", "")) or None

        elif imdb_id and imdb_id.startswith("tt"):
            # Case 2: legacy entries with only an IMDb ID — two requests
            # (find the TMDb ID, then fetch details).
            print(f"Finding TMDb ID for IMDb ID: {imdb_id}")
            find_url = f"https://api.themoviedb.org/3/find/{imdb_id}?external_source=imdb_id"
            find_response = requests.get(find_url, headers=HEADERS, timeout=20)
            find_response.raise_for_status()
            results = find_response.json().get("movie_results", [])
            if not results:
                print(f"Movie not found: IMDb ID {imdb_id}")
                continue
            tmdb_id = str(results[0]["id"])
            movie = fetch_movie_details(tmdb_id)

        else:
            print(f"Invalid movie entry: {item}")
            continue

        # Write resolved IDs back to imdb_list.json
        original_item = dict(item)
        if imdb_id:
            item["imdb"] = imdb_id
        if tmdb_id:
            item["tmdb"] = tmdb_id
        if item != original_item:
            stats["updated_entries"] += 1

        record = build_movie_record(movie, imdb_id, tmdb_id)
        if record["trailer"]:
            stats["trailers"] += 1
        movies.append(record)
        stats["new"] += 1

    except requests.RequestException as error:
        print(f"  FAILED (network/TMDb error) for IMDb={imdb_id}, TMDb={tmdb_id}: {error}")
        stats["failed"] += 1
    except (KeyError, ValueError, TypeError) as error:
        print(f"  FAILED (unexpected data) for IMDb={imdb_id}, TMDb={tmdb_id}: {error}")
        stats["failed"] += 1

# =============================================================
# Save results
# =============================================================

with open(IMDB_LIST_FILE, "w", encoding="utf-8") as f:
    json.dump(movie_list, f, indent=2, ensure_ascii=False)

os.makedirs("data", exist_ok=True)
with open(MOVIES_FILE, "w", encoding="utf-8") as f:
    json.dump(movies, f, indent=2, ensure_ascii=False)

print()
print("========================================")
print("CineVerse generation complete!")
print("========================================")
print(f"Cached movies:   {stats['cached']}")
print(f"New movies:      {stats['new']}")
print(f"Updated entries: {stats['updated_entries']}")
print(f"Trailers added:  {stats['trailers']}")
print(f"Failed movies:   {stats['failed']}")
print(f"Total movies:    {len(movies)}")
print("========================================")
