import json
import os
import time
import requests

# =============================================================
# ONE-TIME MEDIA BACKFILL
#
# Goes through data/movies.json once and fills in:
#   - trailer
#   - backdrop
#   - runtime
#   - director
#   - cast
#   - certification
#
# Uses append_to_response=videos,credits,release_dates
# so all required data comes from a SINGLE TMDb request
# per movie.
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
# GET DIRECTOR
# =============================================================

def get_director(movie):

    crew = movie.get("credits", {}).get("crew", [])

    for person in crew:

        if person.get("job") == "Director":
            return person.get("name", "")

    return ""


# =============================================================
# GET CAST
# =============================================================

def get_cast(movie, limit=5):

    cast = movie.get("credits", {}).get("cast", [])

    names = [
        person.get("name", "")
        for person in cast[:limit]
    ]

    return ", ".join(
        name for name in names
        if name
    )


# =============================================================
# GET CERTIFICATION
#
# Uses the US certification when available.
# =============================================================

def get_certification(movie):

    results = movie.get(
        "release_dates",
        {}
    ).get(
        "results",
        []
    )

    for entry in results:

        if entry.get("iso_3166_1") == "US":

            for release in entry.get(
                "release_dates",
                []
            ):

                cert = release.get("certification")

                if cert:
                    return cert

    return ""


# =============================================================
# GET DETAILS
#
# One request returns:
#   - movie details
#   - videos
#   - credits
#   - release dates / certification
# =============================================================

def get_details(tmdb_id):

    url = (
        f"https://api.themoviedb.org/3/movie/"
        f"{tmdb_id}?language=en-US"
        f"&append_to_response=videos,credits,release_dates"
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

with open(
    movies_file,
    "r",
    encoding="utf-8"
) as f:

    movies = json.load(f)


if not isinstance(movies, list):

    raise Exception(
        "movies.json must contain an array."
    )


# =============================================================
# BACKFILL
# =============================================================

trailers_updated = 0
backdrops_updated = 0
credits_updated = 0
runtime_updated = 0
certifications_updated = 0

skipped_complete = 0
skipped_no_tmdb_id = 0
failed = 0


for movie in movies:

    title = movie.get(
        "title",
        "Unknown"
    )

    # ---------------------------------------------------------
    # Determine what is missing
    # ---------------------------------------------------------

    needs_trailer = not movie.get("trailer")

    needs_backdrop = not movie.get("backdrop")

    needs_credits = not movie.get("director")

    needs_runtime = not movie.get("runtime")

    needs_certification = not movie.get(
        "certification"
    )

    # ---------------------------------------------------------
    # Nothing needs updating
    # ---------------------------------------------------------

    if (
        not needs_trailer
        and not needs_backdrop
        and not needs_credits
        and not needs_runtime
        and not needs_certification
    ):

        skipped_complete += 1
        continue

    # ---------------------------------------------------------
    # TMDb ID
    # ---------------------------------------------------------

    tmdb_id = movie.get("tmdb_id")

    if not tmdb_id:

        print(
            f"Skipping (no tmdb_id): {title}"
        )

        skipped_no_tmdb_id += 1

        continue

    print(
        f"Fetching details: "
        f"{title} (TMDb {tmdb_id})"
    )

    try:

        # -----------------------------------------------------
        # ONE TMDb REQUEST
        # -----------------------------------------------------

        details = get_details(tmdb_id)

        # -----------------------------------------------------
        # TRAILER
        # -----------------------------------------------------

        if needs_trailer:

            trailer = get_trailer(
                details
            )

            movie["trailer"] = trailer

            if trailer:

                trailers_updated += 1

            else:

                print(
                    f"  No YouTube trailer found "
                    f"for {title}"
                )

        # -----------------------------------------------------
        # BACKDROP
        # -----------------------------------------------------

        if needs_backdrop:

            backdrop = ""

            if details.get(
                "backdrop_path"
            ):

                backdrop = (
                    "https://image.tmdb.org/t/p/w1280"
                    + details["backdrop_path"]
                )

            movie["backdrop"] = backdrop

            if backdrop:

                backdrops_updated += 1

            else:

                print(
                    f"  No backdrop found "
                    f"for {title}"
                )

        # -----------------------------------------------------
        # RUNTIME
        # -----------------------------------------------------

        if needs_runtime:

            runtime = details.get(
                "runtime"
            )

            movie["runtime"] = (
                runtime
                if runtime
                else ""
            )

            if runtime:

                runtime_updated += 1

        # -----------------------------------------------------
        # DIRECTOR
        # -----------------------------------------------------

        if needs_credits:

            director = get_director(
                details
            )

            movie["director"] = director

            cast = get_cast(
                details
            )

            movie["cast"] = cast

            if director or cast:

                credits_updated += 1

        # -----------------------------------------------------
        # CERTIFICATION
        # -----------------------------------------------------

        if needs_certification:

            certification = get_certification(
                details
            )

            movie["certification"] = (
                certification
            )

            if certification:

                certifications_updated += 1

    except requests.RequestException as error:

        print(
            f"  Failed for {title}: {error}"
        )

        failed += 1

    # ---------------------------------------------------------
    # Small pause to stay comfortably under TMDb's rate limit
    # ---------------------------------------------------------

    time.sleep(0.1)


# =============================================================
# SAVE
# =============================================================

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
print("Media backfill complete!")
print("========================================")
print(
    f"Trailers added:        {trailers_updated}"
)
print(
    f"Backdrops added:       {backdrops_updated}"
)
print(
    f"Runtime added:         {runtime_updated}"
)
print(
    f"Credits added:         {credits_updated}"
)
print(
    f"Certifications added:  {certifications_updated}"
)
print(
    f"Already complete:      {skipped_complete}"
)
print(
    f"No tmdb_id (skipped):  {skipped_no_tmdb_id}"
)
print(
    f"Failed:                {failed}"
)
print(
    f"Total movies:          {len(movies)}"
)
print("========================================")
