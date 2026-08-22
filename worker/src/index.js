const ALLOWED_ORIGIN =
    "https://shajithjosephsebastian.github.io";

const SESSION_DURATION = 60 * 60; // 1 hour

const RATE_LIMIT_WINDOW = 120; // 2 minutes, in seconds
const RATE_LIMIT_MAX = 5;      // failed login attempts allowed per window


// =========================================================
// CORS
// =========================================================

function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
}


// =========================================================
// JSON RESPONSE
// =========================================================

function jsonResponse(data, status = 200) {
    return new Response(
        JSON.stringify(data),
        {
            status,
            headers: {
                "Content-Type": "application/json",
                ...corsHeaders()
            }
        }
    );
}


// =========================================================
// BASE64URL
// =========================================================

function base64UrlEncode(bytes) {

    let binary = "";

    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}


function base64UrlDecode(str) {

    str = str
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    while (str.length % 4) {
        str += "=";
    }

    const binary = atob(str);

    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
}


// =========================================================
// HMAC KEY
// =========================================================

async function getSigningKey(password) {

    const encoder = new TextEncoder();

    return crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        {
            name: "HMAC",
            hash: "SHA-256"
        },
        false,
        ["sign", "verify"]
    );
}


// =========================================================
// CREATE AUTH TOKEN
// =========================================================

async function createToken(password) {

    const timestamp =
        Math.floor(Date.now() / 1000);

    const payload =
        String(timestamp);

    const key =
        await getSigningKey(password);

    const signature =
        await crypto.subtle.sign(
            "HMAC",
            key,
            new TextEncoder().encode(payload)
        );

    const signatureEncoded =
        base64UrlEncode(
            new Uint8Array(signature)
        );

    const payloadEncoded =
        base64UrlEncode(
            new TextEncoder().encode(payload)
        );

    return `${payloadEncoded}.${signatureEncoded}`;
}


// =========================================================
// VERIFY AUTH TOKEN
// =========================================================

async function verifyToken(token, password) {

    if (!token) {
        return false;
    }

    const parts = token.split(".");

    if (parts.length !== 2) {
        return false;
    }

    try {

        const payloadBytes =
            base64UrlDecode(parts[0]);

        const payload =
            new TextDecoder().decode(payloadBytes);

        const timestamp =
            Number(payload);

        if (!Number.isFinite(timestamp)) {
            return false;
        }

        const now =
            Math.floor(Date.now() / 1000);

        // Token expired
        if (
            now - timestamp < 0 ||
            now - timestamp > SESSION_DURATION
        ) {
            return false;
        }

        const key =
            await getSigningKey(password);

        const signature =
            base64UrlDecode(parts[1]);

        return await crypto.subtle.verify(
            "HMAC",
            key,
            signature,
            new TextEncoder().encode(payload)
        );

    } catch {

        return false;
    }
}


// =========================================================
// AUTHENTICATION
// =========================================================

async function isAuthenticated(request, env) {

    if (!env.ADMIN_PASSWORD) {
        return false;
    }

    const authorization =
        request.headers.get("Authorization");

    if (!authorization) {
        return false;
    }

    if (!authorization.startsWith("Bearer ")) {
        return false;
    }

    const token =
        authorization.substring(7);

    return await verifyToken(
        token,
        env.ADMIN_PASSWORD
    );
}


// =========================================================
// LOGIN RATE LIMITING
//
// Tracks failed login attempts per IP in KV (Workers have no
// memory between requests, so this needs somewhere persistent).
// Fails OPEN if RATE_LIMIT_KV isn't bound — a missing binding
// should never lock out the real admin, just skip the limit.
// =========================================================

async function checkRateLimit(env, ip) {

    if (!env.RATE_LIMIT_KV) {
        console.log("RATE_LIMIT_KV not bound — rate limiting disabled.");
        return { blocked: false };
    }

    const record = JSON.parse(
        await env.RATE_LIMIT_KV.get(`login_attempts:${ip}`) || "null"
    );

    const now = Math.floor(Date.now() / 1000);

    if (
        record &&
        now - record.windowStart < RATE_LIMIT_WINDOW &&
        record.count >= RATE_LIMIT_MAX
    ) {
        return {
            blocked: true,
            retryAfter: RATE_LIMIT_WINDOW - (now - record.windowStart)
        };
    }

    return { blocked: false };
}


async function recordFailedAttempt(env, ip) {

    if (!env.RATE_LIMIT_KV) {
        return;
    }

    const key = `login_attempts:${ip}`;

    const record = JSON.parse(
        await env.RATE_LIMIT_KV.get(key) || "null"
    );

    const now = Math.floor(Date.now() / 1000);

    const updated = (record && now - record.windowStart < RATE_LIMIT_WINDOW)
        ? { windowStart: record.windowStart, count: record.count + 1 }
        : { windowStart: now, count: 1 };

    await env.RATE_LIMIT_KV.put(
        key,
        JSON.stringify(updated),
        { expirationTtl: RATE_LIMIT_WINDOW + 30 }
    );
}


async function clearRateLimit(env, ip) {

    if (!env.RATE_LIMIT_KV) {
        return;
    }

    await env.RATE_LIMIT_KV.delete(`login_attempts:${ip}`);
}


// =========================================================
// WORKER
// =========================================================

export default {

    async fetch(request, env) {

        // =====================================================
        // CORS PREFLIGHT
        // =====================================================

        if (request.method === "OPTIONS") {

            return new Response(
                null,
                {
                    status: 204,
                    headers: corsHeaders()
                }
            );
        }


        const url =
            new URL(request.url);


        // =====================================================
        // TEST ENDPOINT
        // =====================================================

        if (
            url.pathname === "/" &&
            request.method === "GET"
        ) {

            return jsonResponse({
                success: true,
                message: "CineVerse Admin API is working!"
            });
        }


        // =====================================================
        // LOGIN
        // POST /login
        //
        // Body:
        //
        // {
        //     "password": "your-password"
        // }
        //
        // Blocked with 429 after RATE_LIMIT_MAX failed attempts
        // from the same IP within RATE_LIMIT_WINDOW seconds.
        // =====================================================

        if (
            url.pathname === "/login" &&
            request.method === "POST"
        ) {

            try {

                if (!env.ADMIN_PASSWORD) {

                    return jsonResponse({
                        success: false,
                        error: "ADMIN_PASSWORD is not configured."
                    }, 500);
                }


                const ip =
                    request.headers.get("CF-Connecting-IP") || "unknown";

                const rateCheck =
                    await checkRateLimit(env, ip);

                if (rateCheck.blocked) {

                    return jsonResponse({
                        success: false,
                        error: `Too many failed attempts. Try again in ${rateCheck.retryAfter}s.`
                    }, 429);
                }


                const body =
                    await request.json();

                const password =
                    body.password;


                if (
                    !password ||
                    typeof password !== "string"
                ) {

                    return jsonResponse({
                        success: false,
                        error: "Password is required."
                    }, 400);
                }


                // Check password
                if (
                    password !==
                    env.ADMIN_PASSWORD
                ) {

                    await recordFailedAttempt(env, ip);

                    return jsonResponse({
                        success: false,
                        error: "Invalid password."
                    }, 401);
                }


                // Correct password — clear any prior failed attempts
                await clearRateLimit(env, ip);


                // Create temporary token
                const token =
                    await createToken(
                        env.ADMIN_PASSWORD
                    );


                return jsonResponse({
                    success: true,
                    message: "Login successful.",
                    token: token,
                    expires_in: SESSION_DURATION
                });

            } catch (error) {

                return jsonResponse({
                    success: false,
                    error: "Login failed."
                }, 500);
            }
        }


        // =====================================================
        // SEARCH MOVIES
        // GET /search?q=F1
        //
        // AUTHENTICATION REQUIRED
        // =====================================================

        if (
            url.pathname === "/search" &&
            request.method === "GET"
        ) {

            // -----------------------------------------------
            // Check authentication
            // -----------------------------------------------

            if (
                !(await isAuthenticated(
                    request,
                    env
                ))
            ) {

                return jsonResponse({
                    success: false,
                    error: "Authentication required."
                }, 401);
            }


            const query =
                url.searchParams.get("q");


            if (
                !query ||
                query.trim().length < 2
            ) {

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
                    "?query=" +
                    encodeURIComponent(
                        query.trim()
                    ) +
                    "&include_adult=false" +
                    "&language=en-US" +
                    "&page=1";


                const response =
                    await fetch(
                        tmdbUrl,
                        {
                            headers: {
                                "Authorization":
                                    `Bearer ${env.TMDB_API_TOKEN}`,

                                "Accept":
                                    "application/json"
                            }
                        }
                    );


                if (!response.ok) {

                    return jsonResponse({
                        success: false,
                        error: "TMDb request failed.",
                        status: response.status
                    }, 502);
                }


                const data =
                    await response.json();


                const results =
                    data.results
                        .slice(0, 10)
                        .map(movie => ({

                            tmdb_id:
                                movie.id,

                            title:
                                movie.title,

                            original_title:
                                movie.original_title,

                            year:
                                movie.release_date
                                    ? movie.release_date.substring(0, 4)
                                    : null,

                            overview:
                                movie.overview,

                            poster:
                                movie.poster_path
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


        // =====================================================
        // ADD MOVIE
        // POST /add
        //
        // AUTHENTICATION REQUIRED
        //
        // Body:
        //
        // {
        //     "tmdb_id": 911430
        // }
        // =====================================================

        if (
            url.pathname === "/add" &&
            request.method === "POST"
        ) {

            // -----------------------------------------------
            // Check authentication
            // -----------------------------------------------

            if (
                !(await isAuthenticated(
                    request,
                    env
                ))
            ) {

                return jsonResponse({
                    success: false,
                    error: "Authentication required."
                }, 401);
            }


            try {

                // ---------------------------------------------
                // Read request body
                // ---------------------------------------------

                const body =
                    await request.json();

                const tmdbId =
                    body.tmdb_id;


                if (!tmdbId) {

                    return jsonResponse({
                        success: false,
                        error: "TMDb movie ID is required."
                    }, 400);
                }


                const tmdbIdString =
                    String(tmdbId);


                // ---------------------------------------------
                // GitHub repository
                // ---------------------------------------------

                const owner =
                    "shajithjosephsebastian";

                const repo =
                    "CineVerse";

                const filePath =
                    "imdb_list.json";


                const githubUrl =
                    `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;


                // ---------------------------------------------
                // GitHub token
                // ---------------------------------------------

                if (!env.GITHUB_TOKEN) {

                    return jsonResponse({
                        success: false,
                        error: "GitHub token is not configured."
                    }, 500);
                }


                // ---------------------------------------------
                // Get current imdb_list.json
                // ---------------------------------------------

                const githubResponse =
                    await fetch(
                        githubUrl,
                        {
                            headers: {

                                "Authorization":
                                    `Bearer ${env.GITHUB_TOKEN}`,

                                "Accept":
                                    "application/vnd.github+json",

                                "X-GitHub-Api-Version":
                                    "2022-11-28",

                                "User-Agent":
                                    "CineVerse-Admin"

                            }
                        }
                    );


                if (!githubResponse.ok) {

                    const errorText =
                        await githubResponse.text();

                    return jsonResponse({
                        success: false,
                        error:
                            "Could not read imdb_list.json from GitHub.",
                        status:
                            githubResponse.status,
                        details:
                            errorText
                    }, 500);
                }


                const githubData =
                    await githubResponse.json();


                // ---------------------------------------------
                // Decode existing file
                // ---------------------------------------------

                const encodedContent =
                    githubData.content.replace(
                        /\n/g,
                        ""
                    );


                const decodedContent =
                    atob(encodedContent);


                let movies;


                try {

                    movies =
                        JSON.parse(
                            decodedContent
                        );

                } catch {

                    return jsonResponse({
                        success: false,
                        error:
                            "imdb_list.json contains invalid JSON."
                    }, 500);
                }


                // ---------------------------------------------
                // Make sure array
                // ---------------------------------------------

                if (!Array.isArray(movies)) {

                    return jsonResponse({
                        success: false,
                        error:
                            "imdb_list.json must contain an array."
                    }, 500);
                }


                // ---------------------------------------------
                // Check duplicate TMDb ID
                // ---------------------------------------------

                const alreadyExists =
                    movies.some(
                        movie =>
                            String(movie.tmdb) ===
                            tmdbIdString
                    );


                if (alreadyExists) {

                    return jsonResponse({
                        success: false,
                        error:
                            "Movie already exists.",
                        tmdb_id:
                            tmdbIdString
                    }, 409);
                }


                // ---------------------------------------------
                // Add movie
                // ---------------------------------------------

                movies.push({
                    tmdb:
                        tmdbIdString
                });


                // ---------------------------------------------
                // Convert to Base64
                // ---------------------------------------------

                const updatedJson =
                    JSON.stringify(
                        movies,
                        null,
                        2
                    ) + "\n";


                const updatedContent =
                    btoa(updatedJson);


                // ---------------------------------------------
                // Update GitHub
                // ---------------------------------------------

                const updateResponse =
                    await fetch(
                        githubUrl,
                        {
                            method: "PUT",

                            headers: {

                                "Authorization":
                                    `Bearer ${env.GITHUB_TOKEN}`,

                                "Accept":
                                    "application/vnd.github+json",

                                "Content-Type":
                                    "application/json",

                                "X-GitHub-Api-Version":
                                    "2022-11-28",

                                "User-Agent":
                                    "CineVerse-Admin"

                            },

                            body: JSON.stringify({

                                message:
                                    `Add movie ${tmdbIdString}`,

                                content:
                                    updatedContent,

                                sha:
                                    githubData.sha

                            })
                        }
                    );


                if (!updateResponse.ok) {

                    const errorText =
                        await updateResponse.text();

                    return jsonResponse({
                        success: false,
                        error:
                            "Failed to update GitHub.",
                        status:
                            updateResponse.status,
                        details:
                            errorText
                    }, 500);
                }


                // ---------------------------------------------
                // Success
                // ---------------------------------------------

                return jsonResponse({

                    success:
                        true,

                    message:
                        "Movie added successfully.",

                    tmdb_id:
                        tmdbIdString

                });


            } catch (error) {

                return jsonResponse({

                    success:
                        false,

                    error:
                        "Failed to add movie.",

                    details:
                        error.message

                }, 500);
            }
        }


        // =====================================================
        // UNKNOWN ENDPOINT
        // =====================================================

        return jsonResponse({

            success:
                false,

            error:
                "Endpoint not found."

        }, 404);
    }
};
