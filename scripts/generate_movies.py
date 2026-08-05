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

for item in imdb_movies:

    imdb_id = item["imdb"]
    video = f"https://streamimdb.ru/embed/movie/{imdb_id}"

    # Find TMDb ID from IMDb ID
    url = f"https://api.themoviedb.org/3/find/{imdb_id}?external_source=imdb_id"

    response = requests.get(url, headers=headers)
    response.raise_for_status()

    result = response.json()

    if not result["movie_results"]:
        print(f"Movie not found: {imdb_id}")
        continue

    movie = result["movie_results"][0]

    genres = []

    if "genre_ids" in movie:
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

        genres = [
            genre_lookup.get(g, str(g))
            for g in movie["genre_ids"]
        ]

    poster = ""

    if movie["poster_path"]:
        poster = (
            "https://image.tmdb.org/t/p/w500"
            + movie["poster_path"]
        )

    year = ""

    if movie.get("release_date"):
        year = movie["release_date"][:4]

    movies.append({

        "id": imdb_id,

        "title": movie["title"],

        "year": int(year) if year else "",

        "genre": ", ".join(genres),

        "rating": movie["vote_average"],

        "poster": poster,

        "description": movie["overview"],

        "video": video

    })

os.makedirs("data", exist_ok=True)

with open("data/movies.json", "w", encoding="utf-8") as f:

    json.dump(movies, f, indent=2, ensure_ascii=False)

print("movies.json generated successfully!")
