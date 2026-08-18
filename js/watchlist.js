// =====================================================
// WATCHLIST
//
// Small shared module used by both index.html and
// movie.html. Stores a plain array of movie IDs in
// localStorage — no backend needed.
// =====================================================

const WATCHLIST_KEY = "cineverse_watchlist";

function getWatchlist(){
    try {
        const raw = localStorage.getItem(WATCHLIST_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error("Could not read watchlist", error);
        return [];
    }
}

function saveWatchlist(list){
    try {
        localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
    } catch (error) {
        console.error("Could not save watchlist", error);
    }
}

function isInWatchlist(id){
    return getWatchlist().includes(String(id));
}

// Adds or removes the id, returns the new state (true = now in watchlist)
function toggleWatchlist(id){
    id = String(id);
    const list = getWatchlist();
    const index = list.indexOf(id);
    let inList;

    if (index === -1) {
        list.push(id);
        inList = true;
    } else {
        list.splice(index, 1);
        inList = false;
    }

    saveWatchlist(list);
    return inList;
}
