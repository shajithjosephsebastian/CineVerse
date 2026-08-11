const ALLOWED_ORIGIN = "https://shajithjosephsebastian.github.io";

function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
            ...corsHeaders()
        }
    });
}

export default {
    async fetch(request, env) {

        // =========================================================
        // CORS
        // =========================================================

        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: corsHeaders()
            });
        }

        const url = new URL(request.url);

        // =========================================================
        // TEST
        // =========================================================

        if (url.pathname === "/" && request.method === "GET") {
            return jsonResponse({
                success: true,
                message: "CineVerse Admin API is working!"
            });
        }

        // =========================================================
        // SEARCH MOVIES
        // GET /search?q=F1
        // =========================================================

        if (url.pathname === "/search" && request.method === "GET") {

            const query = url.searchParams.get("q");

            if (!query || query.trim().length < 2) {
                return jsonResponse({
                    success: false,
                    error: "Please provide a movie name."
                }, 400);
            }

            if (!env.TMDB_API_TOKEN) {
                return jsonResponse({
                    success: false,
                    error: "TMDb API token is not configured."
                }, 500);
            }

            try {

                const tmdbUrl =
                    "https://api.themoviedb.org/3/search/movie" +
                    "?query=" + encodeURIComponent(query.trim()) +
                    "&include_adult=false" +
                    "&language=en-US" +
                    "&page=1";

                const response = await fetch(tmdbUrl, {
                    headers: {
                        "Authorization": `Bearer ${env.TMDB_API_TOKEN}`,
                        "Accept": "application/json"
                    }
                });

                if (!response.ok) {
                    return jsonResponse({
                        success: false,
                        error: "TMDb request failed.",
                        status: response.status
                    }, 502);
                }

                const data = await response.json();

                const results = data.results
                    .slice(0, 10)
                    .map(movie => ({
                        tmdb_id: movie.id,
                        title: movie.title,
                        original_title: movie.original_title,
                        year: movie.release_date
                            ? movie.release_date.substring(0, 4)
                            : null,
                        overview: movie.overview,
                        poster: movie.poster_path
                            ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
                            : null
                    }));

                return jsonResponse({
                    success: true,
                    results: results
                });

            } catch (error) {

                return jsonResponse({
                    success: false,
                    error: "Failed to contact TMDb."
                }, 500);
            }
        }

        // =========================================================
        // ADD MOVIE
        // POST /add
        //
        // Request:
        //
        // {
        //     "tmdb_id": 550
        // }
        //
        // Result in imdb_list.json:
        //
        // {
        //     "imdb": "tt0137523",
        //     "tmdb": "550"
        // }
        // =========================================================

        if (url.pathname === "/add" && request.method === "POST") {

            try {

                // -------------------------------------------------
                // Read request
                // -------------------------------------------------

                const body = await request.json();

                const tmdbId = body.tmdb_id;

                if (!tmdbId) {
                    return jsonResponse({
                        success: false,
                        error: "TMDb movie ID is required."
                    }, 400);
                }

                const tmdbIdString = String(tmdbId);

                // -------------------------------------------------
                // Check TMDb token
                // -------------------------------------------------

                if (!env.TMDB_API_TOKEN) {
                    return jsonResponse({
                        success: false,
                        error: "TMDb API token is not configured."
                    }, 500);
                }

                // -------------------------------------------------
                // Get movie details from TMDb
                //
                // This gives us the IMDb ID.
                // -------------------------------------------------

                const movieUrl =
                    `https://api.themoviedb.org/3/movie/${tmdbIdString}` +
                    "?language=en-US";

                const movieResponse = await fetch(movieUrl, {
                    headers: {
                        "Authorization": `Bearer ${env.TMDB_API_TOKEN}`,
                        "Accept": "application/json"
                    }
                });

                if (!movieResponse.ok) {

                    const errorText = await movieResponse.text();

                    return jsonResponse({
                        success: false,
                        error: "Could not get movie details from TMDb.",
                        status: movieResponse.status,
                        details: errorText
                    }, 502);
                }

                const movieData = await movieResponse.json();

                const imdbId = movieData.imdb_id;

                if (!imdbId) {
                    return jsonResponse({
                        success: false,
                        error: "TMDb did not provide an IMDb ID for this movie.",
                        tmdb_id: tmdbIdString
                    }, 400);
                }

                // -------------------------------------------------
                // GitHub repository information
                // -------------------------------------------------

                const owner = "shajithjosephsebastian";
                const repo = "CineVerse";
                const filePath = "imdb_list.json";

                const githubUrl =
                    `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

                // -------------------------------------------------
                // Check GitHub token
                // -------------------------------------------------

                if (!env.GITHUB_TOKEN) {
                    return jsonResponse({
                        success: false,
                        error: "GitHub token is not configured."
                    }, 500);
                }

                // -------------------------------------------------
                // Get current imdb_list.json
                // -------------------------------------------------

                const githubResponse = await fetch(githubUrl, {
                    headers: {
                        "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
                        "Accept": "application/vnd.github+json",
                        "X-GitHub-Api-Version": "2022-11-28",
                        "User-Agent": "CineVerse-Admin"
                    }
                });

                if (!githubResponse.ok) {

                    const errorText = await githubResponse.text();

                    return jsonResponse({
                        success: false,
                        error: "Could not read imdb_list.json from GitHub.",
                        status: githubResponse.status,
                        details: errorText
                    }, 500);
                }

                const githubData = await githubResponse.json();

                // -------------------------------------------------
                // Decode GitHub file
                // -------------------------------------------------

                const encodedContent =
                    githubData.content.replace(/\n/g, "");

                const decodedContent =
                    atob(encodedContent);

                let movies;

                try {

                    movies = JSON.parse(decodedContent);

                } catch (error) {

                    return jsonResponse({
                        success: false,
                        error: "imdb_list.json contains invalid JSON."
                    }, 500);
                }

                // -------------------------------------------------
                // Make sure JSON is an array
                // -------------------------------------------------

                if (!Array.isArray(movies)) {

                    return jsonResponse({
                        success: false,
                        error: "imdb_list.json must contain an array."
                    }, 500);
                }

                // -------------------------------------------------
                // Check duplicate
                //
                // Check both IMDb and TMDb IDs.
                // -------------------------------------------------

                const alreadyExists = movies.some(movie => {

                    const existingImdb =
                        movie.imdb
                            ? String(movie.imdb)
                            : "";

                    const existingTmdb =
                        movie.tmdb
                            ? String(movie.tmdb)
                            : "";

                    return (
                        existingImdb === imdbId ||
                        existingTmdb === tmdbIdString
                    );
                });

                if (alreadyExists) {

                    return jsonResponse({
                        success: false,
                        error: "Movie already exists.",
                        imdb: imdbId,
                        tmdb: tmdbIdString
                    }, 409);
                }

                // -------------------------------------------------
                // Add movie with BOTH IDs
                // -------------------------------------------------

                movies.push({
                    imdb: imdbId,
                    tmdb: tmdbIdString
                });

                // -------------------------------------------------
                // Convert JSON to Base64
                // -------------------------------------------------

                const updatedJson =
                    JSON.stringify(movies, null, 2) + "\n";

                const updatedContent =
                    btoa(updatedJson);

                // -------------------------------------------------
                // Update GitHub
                // -------------------------------------------------

                const updateResponse = await fetch(githubUrl, {

                    method: "PUT",

                    headers: {
                        "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
                        "Accept": "application/vnd.github+json",
                        "Content-Type": "application/json",
                        "X-GitHub-Api-Version": "2022-11-28",
                        "User-Agent": "CineVerse-Admin"
                    },

                    body: JSON.stringify({

                        message:
                            `Add movie ${imdbId}`,

                        content:
                            updatedContent,

                        sha:
                            githubData.sha
                    })
                });

                if (!updateResponse.ok) {

                    const errorText =
                        await updateResponse.text();

                    return jsonResponse({
                        success: false,
                        error: "Failed to update GitHub.",
                        status: updateResponse.status,
                        details: errorText
                    }, 500);
                }

                // -------------------------------------------------
                // Success
                // -------------------------------------------------

                return jsonResponse({

                    success: true,

                    message:
                        "Movie added successfully.",

                    imdb:
                        imdbId,

                    tmdb:
                        tmdbIdString

                });

            } catch (error) {

                return jsonResponse({

                    success: false,

                    error:
                        "Failed to add movie.",

                    details:
                        error.message

                }, 500);
            }
        }

        // =========================================================
        // UNKNOWN ENDPOINT
        // =========================================================

        return jsonResponse({

            success: false,

            error:
                "Endpoint not found."

        }, 404);
    }
};
