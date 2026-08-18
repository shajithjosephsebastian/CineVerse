import json
import os
import time
import requests

# =============================================================
# ONE-TIME MEDIA BACKFILL
#
# Goes through data/movies.json once and fills in "trailer"
# and "backdrop" for any movie missing either one.
#
# Uses append_to_response=videos on the movie-details endpoint,
# so both fields come from a SINGLE request per movie — same
# cost as backfilling trailer alone.
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

def get_trailer(details):

    videos = details.get("videos", {}).get("results", [])

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
# GET DETAILS
#
# One request, returns both videos and backdrop_path.
# =============================================================

def get_details(tmdb_id):

    url = (
        f"https://api.themoviedb.org/3/movie/"
        f"{tmdb_id}?language=en-US&append_to_response=videos"
    )

    response = requests.get(
        url,
        headers=headers,
        timeout=15
    )

    response.raise_for_status()

    return response.json()


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

trailers_updated = 0
backdrops_updated = 0
skipped_complete = 0
skipped_no_tmdb_id = 0
failed = 0

for movie in movies:

    title = movie.get("title", "Unknown")

    needs_trailer = not movie.get("trailer")
    needs_backdrop = not movie.get("backdrop")

    # Already has both, nothing to do
    if not needs_trailer and not needs_backdrop:
        skipped_complete += 1
        continue

    tmdb_id = movie.get("tmdb_id")

    if not tmdb_id:
        print(f"Skipping (no tmdb_id): {title}")
        skipped_no_tmdb_id += 1
        continue

    print(f"Fetching details: {title} (TMDb {tmdb_id})")

    try:

        details = get_details(tmdb_id)

        if needs_trailer:

            trailer = get_trailer(details)

            movie["trailer"] = trailer

            if trailer:
                trailers_updated += 1
            else:
                print(f"  No YouTube trailer found for {title}")

        if needs_backdrop:

            backdrop = ""

            if details.get("backdrop_path"):

                backdrop = (
                    "https://image.tmdb.org/t/p/w1280"
                    + details["backdrop_path"]
                )

            movie["backdrop"] = backdrop

            if backdrop:
                backdrops_updated += 1
            else:
                print(f"  No backdrop found for {title}")

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
print("Media backfill complete!")
print("========================================")
print(f"Trailers added:        {trailers_updated}")
print(f"Backdrops added:       {backdrops_updated}")
print(f"Already complete:      {skipped_complete}")
print(f"No tmdb_id (skipped):  {skipped_no_tmdb_id}")
print(f"Failed:                {failed}")
print(f"Total movies:          {len(movies)}")
print("========================================")
