// =====================================================
// SHARED HELPERS
// Used by app.js, movie.js and player.js so this logic
// only lives in one place. Load this file before them.
// =====================================================

// Splits a "Action, Adventure" genre string into ["Action","Adventure"]
function splitGenres(genreField) {
    return (genreField || "").split(",").map(g => g.trim()).filter(Boolean);
}

// TMDb reports 0.0 when a movie has no votes yet (usually unreleased),
// not as an actual rating — treat 0/blank as "no rating yet".
function isUnreleasedRating(rating) {
    return !rating || rating <= 0;
}

// Icon + text only (used where the wrapping <span class="rating-badge"> already exists)
function ratingBadgeContent(rating) {
    return isUnreleasedRating(rating)
        ? `<i class="fa-regular fa-clock"></i> Unreleased`
        : `<i class="fa-solid fa-star"></i> ${rating}`;
}

// Full badge including the wrapping span (used in card grid templates)
function ratingBadgeHTML(rating) {
    const cls = isUnreleasedRating(rating) ? "rating-badge rating-badge-unreleased" : "rating-badge";
    return `<span class="${cls}">${ratingBadgeContent(rating)}</span>`;
}
