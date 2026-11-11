import { getAllRooms, getRoomById, getMapCategories, getMapDisplayName } from './data.js';
import { navigate, getCurrentPath } from './router.js';
import { escapeHtml, announceToScreenReader, getUpdatedAt } from './utils.js';
import { buildMapDropdown, wireMapDropdown } from './shell.js';
import { initTagSearch } from './tag-search.js';

const RESULT_PAGE_LIMIT = 100;
const RESULT_SHOW_ALL_LIMIT = 2000;
const MAP_GROUP_VISIBLE_COUNT = 8;
// Categories with more maps than this start collapsed on the landing page
const MAP_CATEGORY_OPEN_LIMIT = 30;
// Real values from the current data: two tags, a room ID, a UID and a word
const EXAMPLE_SEARCHES = [
    { value: 'bank', kind: 'tag' },
    { value: 'herbalist', kind: 'tag' },
    { value: '228', kind: 'room ID', mono: true },
    { value: 'u7046', kind: 'UID', mono: true },
    { value: 'fountain', kind: 'text' }
];
const ROOM_ID_PATTERN = /^\d+$/;
const ROOM_UID_PATTERN = /^u\d+$/;

let currentSearch = null;

// escapeHtml() leaves double quotes alone, so attribute values need this extra step
function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function getScrollBehavior() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

// Pushes the search into the URL (#/search?q=...&map=...). The router re-renders the
// page from those params, which is what makes Back and bookmarks work.
function goToSearch(term, mapFilter) {
    const params = new URLSearchParams();
    params.set('q', term);
    if (mapFilter) params.set('map', mapFilter);
    const path = `/search?${params.toString()}`;
    // Re-submitting the same search shouldn't stack identical history entries
    navigate(path, getCurrentPath() === path);
}

export function renderSearch(queryParams = {}) {
    const app = document.getElementById('app');
    currentSearch = null;
    app.innerHTML = buildSearchHTML(queryParams);
    
    document.title = 'Search - Lich Map Room Database';
    
    const hasQuery = hasSearchQuery(queryParams);
    if (hasQuery) {
        const redirected = executeSearch(queryParams.q, queryParams.map);
        // A direct room match replaced this page, so there is nothing left to wire up
        if (redirected) return;
    }
    
    requestAnimationFrame(() => {
        initSearchInteractions(queryParams);
        if (!hasQuery) {
            document.getElementById('search')?.focus();
        }
    });
}

function hasSearchQuery(queryParams) {
    return Boolean(queryParams.q && queryParams.q.trim());
}

function buildSearchHTML(queryParams) {
    const mapCategories = getMapCategories();
    const hasQuery = hasSearchQuery(queryParams);
    
    return `
        <a href="#main-content" class="skip-link">Skip to main content</a>
        <a href="#navigation" class="skip-link">Skip to navigation</a>
        
        <nav id="navigation" role="navigation" aria-label="Map navigation">
            <div id="navigation_header">
                <div id="map_navigation">
                    ${buildMapDropdown(mapCategories)}
                </div>
            </div>
        </nav>
        
        <main id="main-content" role="main" class="search-main">
            ${hasQuery ? `
            ${buildSearchHero(queryParams, hasQuery)}
            
            <div id="search-results"></div>
            
            ${buildTagPanel()}
            ` : `
            <div class="search-deck">
                ${buildSearchHero(queryParams, hasQuery)}
                
                ${buildTagPanel()}
            </div>
            
            <div id="search-results"></div>
            
            ${buildMapBrowser(mapCategories)}
            `}
            
            <footer id="updated_at" role="contentinfo" class="search-footer">
                <small><i>MapDB last updated: ${escapeHtml(getUpdatedAt())}</i></small>
            </footer>
        </main>
    `;
}

// Title, the main search box and (on the landing state only) the intro and example chips.
// With a query the hero shrinks to the title and the box so the results stay close to the top.
function buildSearchHero(queryParams, hasQuery) {
    const searchValue = queryParams.q || '';
    
    const intro = hasQuery ? '' : `
            <p class="search-eyebrow">Gemstone IV cartography</p>`;
    const subtitle = hasQuery ? '' : `
            <p class="search-intro">Find a room by ID, UID (e.g. u12345), tag, or text.</p>`;
    const examples = hasQuery ? '' : `
            <div class="search-examples" role="group" aria-label="Example searches">
                <span class="search-examples-label">Try</span>
                ${EXAMPLE_SEARCHES.map(buildExampleChip).join('')}
            </div>`;
    
    return `
        <header class="search-hero${hasQuery ? ' search-hero-compact' : ''}">${intro}
            <h1 class="search-title">Lich Map Room Database</h1>${subtitle}
            
            <form id="basicSearchForm" class="search-hero-form" role="search" aria-label="Room search">
                <label for="search" class="search-hero-label">Search rooms</label>
                <div class="search-hero-row">
                    <input type="text" id="search" name="search"
                           class="search-input search-hero-input"
                           placeholder="Room ID, UID, tag, or text"
                           value="${escapeAttr(searchValue)}"
                           autocomplete="off"
                           aria-describedby="search-help">
                    <button type="submit" class="search-hero-button" aria-label="Search rooms">Search</button>
                </div>
                <div id="search-help" class="sr-only">Enter a room ID, a UID starting with u, a tag name, or text from a room title or description.</div>
            </form>${examples}
        </header>
    `;
}

function buildExampleChip(example) {
    const classes = `example-chip${example.mono ? ' example-chip-mono' : ''}`;
    return `
                <button type="button" class="${classes}" data-example="${escapeAttr(example.value)}"
                        aria-label="${escapeAttr(`Search for ${example.value} (example ${example.kind})`)}">
                    <span class="example-chip-value">${escapeHtml(example.value)}</span>
                    <span class="example-chip-kind">${escapeHtml(example.kind)}</span>
                </button>`;
}

// "Wehnimer's Landing - Town Map" under the "Wehnimer's Landing" heading reads better as "Town Map"
function getTileLabel(category, mapName) {
    const prefix = `${category} - `;
    return mapName.startsWith(prefix) && mapName.length > prefix.length
        ? mapName.slice(prefix.length)
        : mapName;
}

// Browsable grid of every map, grouped by category. Tiles are real links to the map's room,
// so keyboard, middle-click and "copy link" all work. Big categories start collapsed.
function buildMapBrowser(mapCategories) {
    if (!mapCategories.length) return '';
    
    // "Other" is a catch-all with hundreds of maps, so it goes last
    const ordered = [...mapCategories].sort((a, b) => (a[0] === 'Other') - (b[0] === 'Other'));
    const totalMaps = ordered.reduce((sum, [, maps]) => sum + maps.length, 0);
    
    let categoriesHTML = '';
    for (const [category, maps] of ordered) {
        const isOpen = maps.length <= MAP_CATEGORY_OPEN_LIMIT;
        const tiles = maps.map(([mapName, roomId]) => `
                        <li>
                            <a href="#/room/${escapeAttr(roomId)}" class="map-tile"
                               data-name="${escapeAttr(`${category} ${mapName}`.toLowerCase())}"
                               title="${escapeAttr(mapName)}">${escapeHtml(getTileLabel(category, mapName))}</a>
                        </li>`).join('');
        
        categoriesHTML += `
                <details class="map-category"${isOpen ? ' open' : ''} data-default-open="${isOpen}">
                    <summary>
                        <span class="map-category-name">${escapeHtml(category)}</span>
                        <span class="map-category-count">${maps.length} ${maps.length === 1 ? 'map' : 'maps'}</span>
                    </summary>
                    <ul class="map-tile-grid" role="list" aria-label="${escapeAttr(`${category} maps`)}">${tiles}
                    </ul>
                </details>`;
    }
    
    return `
            <section class="map-browser" aria-labelledby="map-browser-heading">
                <div class="map-browser-header">
                    <h2 id="map-browser-heading" class="search-section-heading">Browse maps</h2>
                    <div class="map-filter">
                        <label for="map-filter" class="sr-only">Filter maps</label>
                        <input type="text" id="map-filter" class="map-filter-input" placeholder="Filter ${totalMaps} maps"
                               autocomplete="off" aria-controls="map-browser-list">
                    </div>
                </div>
                <div id="map-browser-list">${categoriesHTML}
                </div>
                <p id="map-filter-empty" class="map-filter-empty" hidden></p>
            </section>
    `;
}

// Secondary search: tag, then map, then optional location. On the landing it sits directly
// under the hero inside .search-deck, so the two search modes read as one block; with results
// showing it moves below them. The ids below are what
// initTagSearch() (tag-search.js) looks up, so they must not change.
function buildTagPanel() {
    return `
            <section class="tag-panel" aria-labelledby="tag-panel-heading">
                <div class="tag-panel-header">
                    <h2 id="tag-panel-heading" class="search-section-heading tag-panel-heading">Find a tag on a map</h2>
                    <p class="tag-panel-hint">Pick a tag, then a map, to see where its rooms are highlighted.</p>
                </div>
                
                <form id="tagSearchForm" role="search" aria-label="Tag and map search">
                    <fieldset class="search-fieldset">
                        <legend class="sr-only">Tag, map and location</legend>
                        
                        <div class="tag-search-grid">
                            <div class="search-field search-field-tag">
                                <label for="tagInput" class="sr-only">Tag name</label>
                                <input type="text" id="tagInput" class="search-input" placeholder="Start typing a tag..." autocomplete="off"
                                       aria-describedby="tag-help" aria-expanded="false" aria-autocomplete="both" role="combobox" aria-controls="tagSuggestions">
                                <div id="tag-help" class="sr-only">Start typing to see available tags. Use arrow keys to navigate suggestions, Enter to select.</div>
                                <ul id="tagSuggestions" class="tag-suggestions" tabindex="0" 
                                    role="listbox" aria-label="Tag suggestions"></ul>
                            </div>
                            
                            <div class="search-field">
                                <label for="imageSelect" class="sr-only">Map image</label>
                                <select id="imageSelect" class="search-select" disabled aria-describedby="image-help">
                                    <option value="">Map...</option>
                                </select>
                                <div id="image-help" class="sr-only">Choose a map image that contains the selected tag</div>
                            </div>
                            
                            <div class="search-field">
                                <label for="locationSelect" class="sr-only">Location within map</label>
                                <select id="locationSelect" class="search-select" disabled aria-describedby="location-help">
                                    <option value="">Location (optional)...</option>
                                </select>
                                <div id="location-help" class="sr-only">Optionally narrow down to a specific location within the selected map</div>
                            </div>
                            
                            <button type="submit" id="tagSearchButton" class="search-button tag-panel-button" disabled>Show on map</button>
                        </div>
                    </fieldset>
                </form>
            </section>
    `;
}

function initSearchInteractions(queryParams) {
    wireMapDropdown(document.getElementById('map_dropdown'), navigate);
    
    const basicSearchForm = document.getElementById('basicSearchForm');
    if (basicSearchForm) {
        basicSearchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const searchInput = document.getElementById('search');
            const searchTerm = searchInput.value.trim();
            if (searchTerm) {
                goToSearch(searchTerm, null);
            }
        });
    }
    
    initExampleChips();
    initMapBrowser();
    initTagSearch({
        tagInputId: 'tagInput',
        suggestionsId: 'tagSuggestions',
        imageSelectId: 'imageSelect',
        locationSelectId: 'locationSelect',
        submitButtonId: 'tagSearchButton',
        formId: 'tagSearchForm',
        onSubmit: navigateToTaggedRoom
    });
}

// Example chips fill the box and run the search through the same URL path as the form,
// so Back and bookmarks work for them too.
function initExampleChips() {
    const searchInput = document.getElementById('search');
    document.querySelectorAll('.example-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const value = chip.dataset.example;
            if (!value) return;
            if (searchInput) searchInput.value = value;
            announceToScreenReader(`Searching for ${value}`);
            goToSearch(value, null);
        });
    });
}

// Live filter for the map tiles: hides non-matching tiles and empty categories, and opens
// every category that still has matches. Clearing the box restores the default open/closed state.
function initMapBrowser() {
    const filterInput = document.getElementById('map-filter');
    const list = document.getElementById('map-browser-list');
    const emptyMessage = document.getElementById('map-filter-empty');
    if (!filterInput || !list || !emptyMessage) return;
    
    let timer = 0;
    filterInput.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => filterMapTiles(filterInput.value, list, emptyMessage), 120);
    });
}

function filterMapTiles(rawQuery, list, emptyMessage) {
    const query = rawQuery.trim().toLowerCase();
    let totalMatches = 0;
    
    list.querySelectorAll('.map-category').forEach(category => {
        let matches = 0;
        category.querySelectorAll('li').forEach(item => {
            const tile = item.querySelector('.map-tile');
            const isMatch = !query || tile.dataset.name.includes(query);
            item.hidden = !isMatch;
            if (isMatch) matches++;
        });
        category.hidden = matches === 0;
        category.open = query ? matches > 0 : category.dataset.defaultOpen === 'true';
        totalMatches += matches;
    });
    
    emptyMessage.hidden = totalMatches > 0 || !query;
    // textContent, so the typed text is never parsed as HTML
    emptyMessage.textContent = query ? `No maps match "${rawQuery.trim()}". Try a shorter name.` : '';
    
    if (query) {
        announceToScreenReader(`${totalMatches} ${totalMatches === 1 ? 'map matches' : 'maps match'}`);
    }
}

function navigateToTaggedRoom(tag, image, location) {
    const allRooms = getAllRooms();
    
    for (const room of allRooms) {
        const tagMatch = room.tags?.includes(tag);
        const imageMatch = room.image === image;
        const locationMatch = !location || room.location === location;
        
        if (tagMatch && imageMatch && locationMatch) {
            let path = `/room/${room.id}?highlight_tag=${encodeURIComponent(tag)}`;
            if (location) {
                path += `&highlight_location=${encodeURIComponent(location)}`;
            }
            navigate(path);
            return;
        }
    }
    
    announceToScreenReader('No matching room found', true);
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Runs the search described by the URL. Returns true if it redirected to a room.
// Redirects replace the history entry, so Back never lands on a search that bounces forward again.
function executeSearch(rawTerm, mapFilter) {
    const term = rawTerm.trim();
    const search = term.toLowerCase();
    const resultsContainer = document.getElementById('search-results');
    
    // Direct navigation only when the WHOLE input is a room ID or a UID ("12 oak trees" is a text search)
    if (ROOM_ID_PATTERN.test(search)) {
        const roomId = parseInt(search, 10);
        if (getRoomById(roomId)) {
            navigate(`/room/${roomId}`, true);
            return true;
        }
    } else if (ROOM_UID_PATTERN.test(search)) {
        if (getRoomById(search)) {
            navigate(`/room/${search}`, true);
            return true;
        }
    }
    
    const allRooms = getAllRooms();
    const results = {};
    let matchKind = 'tag';
    
    for (const room of allRooms) {
        if (room.tags?.includes(search)) {
            if (applyMapFilter(room, mapFilter)) {
                results[room.id] = room;
            }
        }
    }
    
    if (Object.keys(results).length === 0) {
        matchKind = 'text';
        const searchRegex = new RegExp(escapeRegex(search), 'i');
        
        for (const room of allRooms) {
            if (!applyMapFilter(room, mapFilter)) continue;
            
            const titleMatch = room.title?.some(t => searchRegex.test(t));
            if (titleMatch) {
                results[room.id] = room;
                continue;
            }
            
            const descMatch = room.description?.some(d => searchRegex.test(d));
            if (descMatch) {
                results[room.id] = room;
            }
        }
    }
    
    const resultIds = Object.keys(results);
    if (resultIds.length === 1) {
        const room = results[resultIds[0]];
        announceToScreenReader(`1 match — opening room ${room.id}: ${room.title?.[0] || 'Unknown'}`);
        navigate(`/room/${room.id}`, true);
        return true;
    }
    
    currentSearch = { results, matchKind, term, search, mapFilter: mapFilter || null };
    
    if (resultIds.length > RESULT_PAGE_LIMIT && !mapFilter) {
        renderMapGroups(resultsContainer);
    } else {
        renderResults(resultsContainer, RESULT_PAGE_LIMIT);
    }
    return false;
}

function applyMapFilter(room, mapFilter) {
    if (!mapFilter) return true;
    if (mapFilter === 'UNMAPPED') return !room.image;
    return room.image === mapFilter;
}

// Moves keyboard/screen-reader focus to the results heading and scrolls it into view
function focusResultsHeading(container) {
    const heading = container.querySelector('.search-results-heading');
    if (!heading) return;
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ behavior: getScrollBehavior(), block: 'start' });
}

// Wires the [data-action] buttons rendered inside the results area
function bindResultActions(container) {
    container.querySelectorAll('[data-action]').forEach(button => {
        button.addEventListener('click', () => {
            switch (button.dataset.action) {
                case 'show-first':
                    renderResults(container, RESULT_PAGE_LIMIT);
                    break;
                case 'show-all':
                    renderResults(container, RESULT_SHOW_ALL_LIMIT);
                    break;
                case 'group-by-map':
                    renderMapGroups(container);
                    break;
                case 'all-maps':
                    goToSearch(currentSearch.term, null);
                    break;
            }
        });
    });
}

function renderMapGroups(container) {
    const { results, term } = currentSearch;
    const total = Object.keys(results).length;
    
    const imageCounts = new Map();
    let unmappedCount = 0;
    
    for (const room of Object.values(results)) {
        if (room.image) {
            imageCounts.set(room.image, (imageCounts.get(room.image) || 0) + 1);
        } else {
            unmappedCount++;
        }
    }
    
    const groups = Array.from(imageCounts, ([image, count]) => ({
        map: image,
        name: getMapDisplayName(image),
        count,
        unmapped: false
    }));
    if (unmappedCount > 0) {
        groups.push({ map: 'UNMAPPED', name: 'Unmapped Rooms', count: unmappedCount, unmapped: true });
    }
    
    // Biggest groups first; ties fall back to name so the order is stable
    groups.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const largest = groups[0].count;
    const extraCount = Math.max(0, groups.length - MAP_GROUP_VISIBLE_COUNT);
    
    let html = `
        <section aria-labelledby="map-groups-heading">
            <h2 id="map-groups-heading" class="search-results-heading" tabindex="-1">${total.toLocaleString()} rooms match "${escapeHtml(term)}"</h2>
            <p>That's too many to list. Pick a map to narrow it down, or show the first ${RESULT_PAGE_LIMIT} anyway.</p>
            <div id="map-groups-list" class="map-groups-container" role="group" aria-labelledby="map-groups-heading">
    `;
    
    groups.forEach((group, index) => {
        const share = Math.max(2, Math.round((group.count / largest) * 100));
        const hiddenAttr = index >= MAP_GROUP_VISIBLE_COUNT ? ' hidden data-extra="true"' : '';
        const label = group.unmapped
            ? `Search for ${term} in unmapped rooms, ${group.count} results`
            : `Search for ${term} on map ${group.name}, ${group.count} results`;
        
        html += `
            <button type="button" class="map-group-button${group.unmapped ? ' unmapped-button' : ''}"
                    data-map="${escapeAttr(group.map)}"
                    data-share="${share}"
                    aria-label="${escapeAttr(label)}"${hiddenAttr}>
                <span class="map-group-row">
                    <span class="map-name">${escapeHtml(group.name)}</span>
                    <span class="map-count">${group.count.toLocaleString()}</span>
                </span>
                <span class="map-group-bar" aria-hidden="true"><span class="map-group-bar-fill"></span></span>
            </button>
        `;
    });
    
    html += `
            </div>
            <div class="search-actions">
                ${extraCount > 0 ? `<button type="button" class="search-action-button" id="map-groups-toggle" aria-expanded="false" aria-controls="map-groups-list">Show all maps (${extraCount} more)</button>` : ''}
                <button type="button" class="search-action-button" data-action="show-first">Show first ${RESULT_PAGE_LIMIT} anyway</button>
            </div>
        </section>
    `;
    
    container.innerHTML = html;
    
    // Bar lengths are data-driven, so they are set through a CSS variable rather than markup styles
    container.querySelectorAll('.map-group-button').forEach(button => {
        button.querySelector('.map-group-bar-fill').style.setProperty('--share', button.dataset.share);
        button.addEventListener('click', () => {
            goToSearch(currentSearch.term, button.dataset.map);
        });
    });
    
    const toggle = container.querySelector('#map-groups-toggle');
    if (toggle) {
        toggle.addEventListener('click', () => {
            const expanding = toggle.getAttribute('aria-expanded') !== 'true';
            container.querySelectorAll('[data-extra]').forEach(button => {
                button.hidden = !expanding;
            });
            toggle.setAttribute('aria-expanded', String(expanding));
            toggle.textContent = expanding ? 'Show fewer maps' : `Show all maps (${extraCount} more)`;
            announceToScreenReader(expanding ? `Showing all ${groups.length} maps` : `Showing the top ${MAP_GROUP_VISIBLE_COUNT} maps`);
        });
    }
    
    bindResultActions(container);
    announceToScreenReader(`Found ${total} results across ${groups.length} maps. Select a map to refine.`);
    focusResultsHeading(container);
}

// Wraps matches of the pattern in <mark>. Every piece of text is escaped first and only
// the known markup is added, so feed text is never injected raw. The pattern must contain
// exactly one capture group (split() puts the captured matches at the odd indexes).
function highlightMatch(text, pattern) {
    return text.split(pattern)
        .map((part, index) => index % 2 === 1
            ? `<mark class="result-match">${escapeHtml(part)}</mark>`
            : escapeHtml(part))
        .join('');
}

// One-line snippet from the description: windowed around the first match when there is one,
// otherwise the start of the description. CSS clips it to a single line with an ellipsis.
function buildSnippetHTML(room, pattern, matchKind, search) {
    if (matchKind === 'tag') {
        return `<span class="result-snippet result-snippet-tag">Tag match: <mark class="result-match">${escapeHtml(search)}</mark></span>`;
    }
    
    const descriptions = [].concat(room.description || []).filter(d => typeof d === 'string');
    const withMatch = descriptions.find(d => pattern.test(d));
    const source = withMatch || descriptions[0];
    if (!source) return '';
    
    const clean = source.replace(/\s+/g, ' ').trim();
    const match = withMatch ? pattern.exec(clean) : null;
    
    let snippet;
    if (match) {
        const start = Math.max(0, match.index - 30);
        const end = Math.min(clean.length, match.index + match[0].length + 130);
        snippet = `${start > 0 ? '…' : ''}${clean.slice(start, end)}${end < clean.length ? '…' : ''}`;
    } else {
        snippet = clean.length > 160 ? `${clean.slice(0, 160)}…` : clean;
    }
    
    return `<span class="result-snippet">${highlightMatch(snippet, pattern)}</span>`;
}

function renderResults(container, limit) {
    const { results, term, search, matchKind, mapFilter } = currentSearch;
    const resultIds = Object.keys(results);
    const mapFilterName = mapFilter && mapFilter !== 'UNMAPPED' ? getMapDisplayName(mapFilter) : '';
    
    if (resultIds.length === 0) {
        container.innerHTML = `
            <section class="search-notice" aria-labelledby="search-results-heading">
                <h2 id="search-results-heading" class="search-results-heading" tabindex="-1">No rooms match "${escapeHtml(term)}"</h2>
                <p>Try a room ID (like 228), a UID (like u7046), a tag name, or a word from a room title or description. Shorter, simpler terms usually work best.</p>
                ${mapFilter ? `<div class="search-actions"><button type="button" class="search-action-button" data-action="all-maps">Search all maps instead</button></div>` : ''}
            </section>
        `;
        bindResultActions(container);
        announceToScreenReader('No rooms found');
        focusResultsHeading(container);
        return;
    }
    
    const displayIds = resultIds.slice(0, limit);
    const truncated = displayIds.length < resultIds.length;
    const canShowAll = truncated && displayIds.length < RESULT_SHOW_ALL_LIMIT;
    const pattern = new RegExp(`(${escapeRegex(search)})`, 'i');
    
    const scopeText = mapFilter === 'UNMAPPED' ? ' in unmapped rooms' : (mapFilterName ? ` on ${mapFilterName}` : '');
    const countText = truncated
        ? `showing ${displayIds.length.toLocaleString()} of ${resultIds.length.toLocaleString()}`
        : `${resultIds.length.toLocaleString()} found`;
    
    let html = `
        <section aria-labelledby="search-results-heading">
            <h2 id="search-results-heading" class="search-results-heading" tabindex="-1">Results for "${escapeHtml(term)}"${escapeHtml(scopeText)} (${countText})</h2>
    `;
    
    const actions = [];
    if (canShowAll) {
        const showAllLabel = resultIds.length > RESULT_SHOW_ALL_LIMIT
            ? `Show first ${RESULT_SHOW_ALL_LIMIT.toLocaleString()} results`
            : `Show all ${resultIds.length.toLocaleString()} results`;
        actions.push(`<button type="button" class="search-action-button" data-action="show-all">${showAllLabel}</button>`);
    }
    if (resultIds.length > RESULT_PAGE_LIMIT && !mapFilter) {
        actions.push('<button type="button" class="search-action-button" data-action="group-by-map">Group by map</button>');
    }
    if (mapFilter) {
        actions.push('<button type="button" class="search-action-button" data-action="all-maps">Search all maps</button>');
    }
    
    if (truncated) {
        html += `
            <div class="search-notice">
                <p>Showing the first ${displayIds.length.toLocaleString()} of ${resultIds.length.toLocaleString()} matches. Narrow your search for more specific results.</p>
            </div>
        `;
    }
    if (actions.length > 0) {
        html += `<div class="search-actions">${actions.join('')}</div>`;
    }
    
    html += '<ul role="list" class="search-results-list">';
    
    for (const rid of displayIds) {
        const room = results[rid];
        const title = room.title?.[0] || 'Unknown';
        const uid = room.uid?.[0];
        const location = room.location || '';
        const mapName = room.image ? getMapDisplayName(room.image) : '';
        const titleHTML = matchKind === 'text' ? highlightMatch(title, pattern) : escapeHtml(title);
        const label = `Navigate to ${title}, room ID ${rid}${uid ? `, UID u${uid}` : ''}${location ? `, in ${location}` : ''}${mapName ? `, on map ${mapName}` : ''}`;
        
        html += `
            <li class="search-result-item">
                <a href="#/room/${escapeAttr(rid)}" class="result-link" aria-label="${escapeAttr(label)}">
                    <span class="result-title">${titleHTML}</span>
                    ${buildSnippetHTML(room, pattern, matchKind, search)}
                    <span class="result-meta">
                        <span class="result-id">ID ${escapeHtml(String(rid))}</span>
                        ${uid ? `<span class="result-id">UID u${escapeHtml(String(uid))}</span>` : ''}
                        ${location ? `<span class="result-location">${escapeHtml(location)}</span>` : ''}
                        ${mapName ? `<span class="result-chip">${escapeHtml(mapName)}</span>` : ''}
                    </span>
                </a>
            </li>
        `;
    }
    
    html += `
            </ul>
        </section>
    `;
    
    container.innerHTML = html;
    bindResultActions(container);
    announceToScreenReader(`Found ${resultIds.length} results`);
    focusResultsHeading(container);
}
