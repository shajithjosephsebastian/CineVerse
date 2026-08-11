const ALLOWED_ORIGIN = "https://shajithjosephsebastian.github.io";

function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
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

        // Handle browser CORS preflight
        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: corsHeaders()
            });
        }

        const url = new URL(request.url);

        // Test endpoint
        if (url.pathname === "/") {
            return jsonResponse({
                success: true,
                message: "CineVerse Admin API is working!"
            });
        }

        // Movie search endpoint
        if (url.pathname === "/search") {

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

        return jsonResponse({
            success: false,
            error: "Endpoint not found."
        }, 404);
    }
};
