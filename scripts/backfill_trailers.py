import json
import os
import time
import requests

# =============================================================
# ONE-TIME TRAILER BACKFILL
#
# Goes through data/movies.json once and fills in a "trailer"
# field for any movie that doesn't have one yet.
#
# This is separate from generate_movies.py on purpose: the
# normal pipeline should stay at 0 TMDb requests for cached
# movies. This script is the one-time exception, meant to be
# run by hand (or via a manual workflow_dispatch), not on
# every push.
# =============================================================

TMDB_TOKEN = os.getenv("TMDB_API_TOKEN")

if not TMDB_TOKEN:
    raise Exception("TMDB_API_TOKEN environment variable not found.")

headers = {
    "Authorization": f"Bearer {TMDB_TOKEN}",
    "accept": "application/json"
}

movies_file = "data/movies.json"


# =============================================================
# GET TRAILER
#
# Same selection logic as generate_movies.py: prefer an
# official YouTube trailer, fall back to the first one found.
# =============================================================

def get_trailer(tmdb_id):

    url = (
        f"https://api.themoviedb.org/3/movie/"
        f"{tmdb_id}/videos?language=en-US"
    )

    response = requests.get(
        url,
        headers=headers,
        timeout=15
    )

    response.raise_for_status()

    data = response.json()

    videos = data.get("results", [])

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
# LOAD movies.json
# =============================================================

with open(movies_file, "r", encoding="utf-8") as f:
    movies = json.load(f)

if not isinstance(movies, list):
    raise Exception("movies.json must contain an array.")


# =============================================================
# BACKFILL
# =============================================================

updated = 0
skipped_has_trailer = 0
skipped_no_tmdb_id = 0
failed = 0

for movie in movies:

    title = movie.get("title", "Unknown")

    # Already has a trailer, nothing to do
    if movie.get("trailer"):
        skipped_has_trailer += 1
        continue

    tmdb_id = movie.get("tmdb_id")

    if not tmdb_id:
        print(f"Skipping (no tmdb_id): {title}")
        skipped_no_tmdb_id += 1
        continue

    print(f"Fetching trailer: {title} (TMDb {tmdb_id})")

    try:

        trailer = get_trailer(tmdb_id)

        movie["trailer"] = trailer

        if trailer:
            updated += 1
        else:
            print(f"  No YouTube trailer found for {title}")

    except requests.RequestException as error:

        print(f"  Failed for {title}: {error}")
        failed += 1

    # Small pause to stay comfortably under TMDb's rate limit
    time.sleep(0.1)


# =============================================================
# SAVE
# =============================================================

with open(movies_file, "w", encoding="utf-8") as f:
    json.dump(movies, f, indent=2, ensure_ascii=False)


# =============================================================
# SUMMARY
# =============================================================

print()
print("========================================")
print("Trailer backfill complete!")
print("========================================")
print(f"Trailers added:        {updated}")
print(f"Already had trailer:   {skipped_has_trailer}")
print(f"No tmdb_id (skipped):  {skipped_no_tmdb_id}")
print(f"Failed:                {failed}")
print(f"Total movies:          {len(movies)}")
print("========================================")
