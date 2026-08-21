// =====================================================
// WATCHLIST
// Shared by index.html and movie.html. Stores a plain
// array of movie IDs in localStorage — no backend needed.
// =====================================================

const WATCHLIST_KEY = "cineverse_watchlist";

function getWatchlist() {
    try {
        const parsed = JSON.parse(localStorage.getItem(WATCHLIST_KEY) || "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error("Could not read watchlist", error);
        return [];
    }
}

function saveWatchlist(list) {
    try {
        localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
    } catch (error) {
        console.error("Could not save watchlist", error);
    }
}

function isInWatchlist(id) {
    return getWatchlist().includes(String(id));
}

// Adds or removes the id, returns the new state (true = now in watchlist)
function toggleWatchlist(id) {
    id = String(id);
    const list = getWatchlist();
    const index = list.indexOf(id);
    const inList = index === -1;

    if (inList) list.push(id);
    else list.splice(index, 1);

    saveWatchlist(list);
    return inList;
}
