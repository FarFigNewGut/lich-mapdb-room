import { escapeHtml } from './utils.js';

// Wording that differs between the two not-found pages. Each message is built from
// the escaped subject (a route path or a room ID/UID).
const NOT_FOUND_VARIANTS = {
    page: {
        heading: 'Page Not Found',
        linkText: '← Go to search',
        documentTitle: 'Page Not Found - Lich Map Room Database',
        buildMessage: (subject) => `
            <p>The page <strong>${subject}</strong> does not exist.</p>`
    },
    room: {
        heading: 'Room Not Found',
        linkText: '← Return to search',
        documentTitle: 'Room Not Found - Lich Map Room Database',
        buildMessage: (subject) => `
            <p>Could not find room with ID or UID: <strong>${subject}</strong></p>
            <p>The room may have been removed from the database, or the ID may be incorrect.</p>`
    }
};

// The map-navigation <select> with its option groups. mapCategories is the
// [category, [[mapName, roomId], ...]] list from getMapCategories().
export function buildMapDropdown(mapCategories) {
    let options = '<option value="">Navigate to map...</option>';
    for (const [category, maps] of mapCategories) {
        options += `<optgroup label="${escapeHtml(category)}">`;
        for (const [mapName, roomId] of maps) {
            options += `<option value="${roomId}">${escapeHtml(mapName)}</option>`;
        }
        options += '</optgroup>';
    }
    return `<select id="map_dropdown" aria-label="Select a map to navigate to">${options}</select>`;
}

// Navigates to the chosen map's room. navigate is passed in so this module never imports the router.
export function wireMapDropdown(selectEl, navigate) {
    if (!selectEl) return;
    selectEl.addEventListener('change', () => {
        const selectedRoomId = selectEl.value;
        if (selectedRoomId) {
            navigate(`/room/${selectedRoomId}`);
        }
    });
}

// Renders the not-found page into app and sets document.title.
// kind is 'page' (unknown route, subject is the path) or 'room' (subject is the room ID or UID).
export function renderNotFound(subject, { kind, app, mapCategories, updatedAt, navigate }) {
    const variant = NOT_FOUND_VARIANTS[kind];
    
    app.innerHTML = `
        <a href="#main-content" class="skip-link">Skip to main content</a>
        
        <nav id="navigation" role="navigation" aria-label="Map navigation">
            <div id="navigation_header">
                <div id="map_navigation">
                    ${buildMapDropdown(mapCategories)}
                </div>
            </div>
        </nav>
        
        <main id="main-content" role="main" class="not-found-main">
            <h1>${variant.heading}</h1>${variant.buildMessage(escapeHtml(String(subject)))}
            <p class="not-found-actions">
                <a href="#/search" class="not-found-link">${variant.linkText}</a>
            </p>
            <footer id="updated_at" role="contentinfo" class="not-found-footer">
                <small><i>MapDB last updated: ${escapeHtml(updatedAt)}</i></small>
            </footer>
        </main>
    `;
    
    wireMapDropdown(document.getElementById('map_dropdown'), navigate);
    
    document.title = variant.documentTitle;
}
