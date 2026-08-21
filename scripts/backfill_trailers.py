"""
ONE-TIME backfill: fills in trailer / backdrop / runtime / director /
cast / certification for any movie in data/movies.json that's missing
one, using a single TMDb request per movie (append_to_response pulls
videos + credits + release_dates alongside the normal details).

Separate from generate_movies.py on purpose — the regular pipeline stays
at 0 TMDb requests for cached movies. Run this by hand (or via a manual
workflow_dispatch) whenever older catalog entries need catching up.
"""

import json
import os
import time
import requests

TMDB_TOKEN = os.getenv("TMDB_API_TOKEN")
if not TMDB_TOKEN:
    raise Exception("TMDB_API_TOKEN environment variable not found.")

HEADERS = {"Authorization": f"Bearer {TMDB_TOKEN}", "accept": "application/json"}
MOVIES_FILE = "data/movies.json"


# ---------- Same TMDb field extractors as generate_movies.py ----------

def get_trailer(details):
    videos = details.get("videos", {}).get("results", [])
    youtube_trailers = [v for v in videos if v.get("site") == "YouTube" and v.get("type") == "Trailer"]
    if not youtube_trailers:
        return ""
    official = [v for v in youtube_trailers if v.get("official") is True]
    key = (official[0] if official else youtube_trailers[0]).get("key")
    return f"https://www.youtube.com/embed/{key}" if key else ""


def get_director(details):
    for person in details.get("credits", {}).get("crew", []):
        if person.get("job") == "Director":
            return person.get("name", "")
    return ""


def get_cast(details, limit=5):
    names = [p.get("name", "") for p in details.get("credits", {}).get("cast", [])[:limit]]
    return ", ".join(n for n in names if n)


def get_certification(details):
    for entry in details.get("release_dates", {}).get("results", []):
        if entry.get("iso_3166_1") == "US":
            for release in entry.get("release_dates", []):
                if release.get("certification"):
                    return release["certification"]
    return ""


def get_details(tmdb_id):
    """One request returns details + videos + credits + release_dates."""
    url = (f"https://api.themoviedb.org/3/movie/{tmdb_id}"
           f"?language=en-US&append_to_response=videos,credits,release_dates")
    response = requests.get(url, headers=HEADERS, timeout=15)
    response.raise_for_status()
    return response.json()


# =============================================================
# Load, backfill, save
# =============================================================

with open(MOVIES_FILE, "r", encoding="utf-8") as f:
    movies = json.load(f)
if not isinstance(movies, list):
    raise Exception("movies.json must contain an array.")

stats = {"trailers": 0, "backdrops": 0, "runtime": 0, "credits": 0,
          "certifications": 0, "already_complete": 0, "no_tmdb_id": 0, "failed": 0}

for movie in movies:
    title = movie.get("title", "Unknown")

    needs = {
        "trailer": not movie.get("trailer"),
        "backdrop": not movie.get("backdrop"),
        "runtime": not movie.get("runtime"),
        "credits": not movie.get("director"),
        "certification": not movie.get("certification"),
    }

    if not any(needs.values()):
        stats["already_complete"] += 1
        continue

    tmdb_id = movie.get("tmdb_id")
    if not tmdb_id:
        print(f"Skipping (no tmdb_id): {title}")
        stats["no_tmdb_id"] += 1
        continue

    print(f"Fetching details: {title} (TMDb {tmdb_id})")

    try:
        details = get_details(tmdb_id)  # single request covers everything below

        if needs["trailer"]:
            movie["trailer"] = get_trailer(details)
            if movie["trailer"]:
                stats["trailers"] += 1
            else:
                print(f"  No YouTube trailer found for {title}")

        if needs["backdrop"]:
            path = details.get("backdrop_path")
            movie["backdrop"] = f"https://image.tmdb.org/t/p/w1280{path}" if path else ""
            if movie["backdrop"]:
                stats["backdrops"] += 1
            else:
                print(f"  No backdrop found for {title}")

        if needs["runtime"]:
            movie["runtime"] = details.get("runtime") or ""
            if movie["runtime"]:
                stats["runtime"] += 1

        if needs["credits"]:
            movie["director"] = get_director(details)
            movie["cast"] = get_cast(details)
            if movie["director"] or movie["cast"]:
                stats["credits"] += 1

        if needs["certification"]:
            movie["certification"] = get_certification(details)
            if movie["certification"]:
                stats["certifications"] += 1

    except requests.RequestException as error:
        print(f"  Failed for {title}: {error}")
        stats["failed"] += 1

    time.sleep(0.1)  # stay comfortably under TMDb's rate limit

with open(MOVIES_FILE, "w", encoding="utf-8") as f:
    json.dump(movies, f, indent=2, ensure_ascii=False)

print()
print("========================================")
print("Media backfill complete!")
print("========================================")
print(f"Trailers added:        {stats['trailers']}")
print(f"Backdrops added:       {stats['backdrops']}")
print(f"Runtime added:         {stats['runtime']}")
print(f"Credits added:         {stats['credits']}")
print(f"Certifications added:  {stats['certifications']}")
print(f"Already complete:      {stats['already_complete']}")
print(f"No tmdb_id (skipped):  {stats['no_tmdb_id']}")
print(f"Failed:                {stats['failed']}")
print(f"Total movies:          {len(movies)}")
print("========================================")
