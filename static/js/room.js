import { getRoomById, getRoomsOnMap, getMapCategories, getAllRooms, getAllTags } from './data.js';
import { navigate } from './router.js';
import { announceToScreenReader, escapeHtml, getUpdatedAt } from './utils.js';

const COMPASS_ORDER = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'up', 'down', 'out'];
const COMPASS_ALIASES = { n: 'north', ne: 'northeast', e: 'east', se: 'southeast', s: 'south', sw: 'southwest', w: 'west', nw: 'northwest' };

// Zoom steps as a fraction of the image's natural size; 'fit' is the responsive default
const MAP_ZOOM_STEPS = [0.2, 0.35, 0.5, 0.75, 1, 1.5, 2, 3];

let currentRoom = null;
let sameImageRooms = [];
let mapResizeObserver = null;
let mapZoom = 'fit';

// escapeHtml() leaves double quotes alone, so attribute values need this extra step
function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Destination title for an exit or StringProc; empty string if the room or title is missing
function getRoomTitle(roomId) {
    const title = getRoomById(roomId)?.title?.[0];
    return typeof title === 'string' ? title.trim() : '';
}

// Compass directions first (N, NE, E, SE, S, SW, W, NW, up, down, out), then other
// commands such as "go ...", then StringProcs. Array.sort is stable, so ties keep their order.
function getExitSortRank(command) {
    if (typeof command !== 'string') return COMPASS_ORDER.length + 1;
    if (command.startsWith(';e')) return COMPASS_ORDER.length + 1;
    const normalized = command.trim().toLowerCase();
    const index = COMPASS_ORDER.indexOf(COMPASS_ALIASES[normalized] || normalized);
    return index === -1 ? COMPASS_ORDER.length : index;
}

function getScrollBehavior() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

function getStringProcs(obj) {
    if (!obj) return [];
    return Object.entries(obj)
        .filter(([_, val]) => typeof val === 'string' && val.startsWith(';e'))
        .map(([roomId, code]) => ({ roomId, code }));
}

function formatStringProc(code) {
    return code
        .replace(/^;e\s*/, '')  // Strip prefix
        .replace(/;/g, '\n');   // Semicolons to newlines
}

export function renderRoom(roomIdOrUid, queryParams = {}) {
    const room = getRoomById(roomIdOrUid);
    if (!room) {
        return renderNotFound(roomIdOrUid);
    }
    
    currentRoom = room;
    sameImageRooms = room.image ? getRoomsOnMap(room.image) : [];
    
    const app = document.getElementById('app');
    app.innerHTML = buildRoomHTML(room, queryParams);
    
    requestAnimationFrame(() => {
        initRoomInteractions(room, queryParams);
    });
    
    document.title = `${room.title[0]} - Lich: ${room.id} - UID: u${room.uid?.[0] || 'N/A'}`;
    announceToScreenReader(`Loaded room: ${room.title[0]}`);
}

function renderNotFound(roomIdOrUid) {
    const app = document.getElementById('app');
    const mapCategories = getMapCategories();
    
    app.innerHTML = `
        <a href="#main-content" class="skip-link">Skip to main content</a>
        
        <nav id="navigation" role="navigation" aria-label="Map navigation">
            <div id="navigation_header">
                <div id="map_navigation">
                    ${buildMapDropdown(mapCategories)}
                </div>
            </div>
        </nav>
        
        <main id="main-content" role="main" style="padding: 20px;">
            <h1>Room Not Found</h1>
            <p>Could not find room with ID or UID: <strong>${escapeHtml(String(roomIdOrUid))}</strong></p>
            <p>The room may have been removed from the database, or the ID may be incorrect.</p>
            <p style="margin-top: 15px;">
                <a href="#/search" style="font-weight: bold;">← Return to search</a>
            </p>
            <footer id="updated_at" role="contentinfo" style="margin-top: 30px;">
                <small><i>MapDB last updated: ${escapeHtml(getUpdatedAt())}</i></small>
            </footer>
        </main>
    `;
    
    const mapDropdown = document.getElementById('map_dropdown');
    if (mapDropdown) {
        mapDropdown.addEventListener('change', () => {
            const selectedRoomId = mapDropdown.value;
            if (selectedRoomId) {
                navigate(`/room/${selectedRoomId}`);
            }
        });
    }
    
    document.title = 'Room Not Found - Lich Map Room Database';
    announceToScreenReader('Room not found');
}

function buildRoomHTML(room, queryParams) {
    const mapCategories = getMapCategories();
    const adjacentMaps = findAdjacentMaps(room);
    const imageTags = collectImageTags(sameImageRooms);
    const imageLocations = collectImageLocations(sameImageRooms);
    
    return `
        <a href="#main-content" class="skip-link">Skip to main content</a>
        <a href="#navigation" class="skip-link">Skip to navigation</a>
        <a href="#search_section" class="skip-link">Skip to search</a>
        
        <div id="sticky-header">
            <nav id="navigation" role="navigation" aria-label="Map navigation">
                <div id="navigation_header">
                    <div id="map_navigation">
                        ${buildMapDropdown(mapCategories)}
                        ${adjacentMaps.length ? buildAdjacentMapDropdown(adjacentMaps) : ''}
                    <button type="button" id="search_link" title="Search for another room" aria-label="Search for another room">&#128269;</button>
                    <button type="button" id="scroll_top_btn" title="Scroll to top" aria-label="Scroll to top of page">&#128285;</button>
                    <button type="button" id="copy_link_btn" title="Copy link for this room" aria-label="Copy link for this room">&#128279;</button>
                    </div>
                </div>
            </nav>
            
            <header id="header" role="banner">
                <div id="title_row">
                    <div id="room-header">
                        <h1>${escapeHtml(room.title[0])}</h1>
                        <p class="room-info">${room.id} | u${room.uid?.[0] || 'N/A'}${room.location ? ` | ${escapeHtml(room.location)}` : ''}</p>
                    </div>
                    ${room.image ? `
                    <div id="opacity_toggle">
                        <input type="checkbox" id="opacity_checkbox">
                        <label for="opacity_checkbox">Toggle opacity</label>
                    </div>
                    ` : ''}
                </div>
                ${room.image && imageTags.length ? buildTagSelector(imageTags, imageLocations) : ''}
            </header>
        </div>
        
        <div id="copy_link_popup" role="alert" aria-live="polite">Link copied to clipboard!</div>
        
        ${room.image ? buildHelpPopup() : ''}
        ${room.image ? buildMapToolbar() : ''}
        ${room.image ? buildMapSection(room) : ''}
        
        <main id="main-content" role="main">
            <div id="after_image">
                ${buildRoomInfoSection(room)}
                ${buildFullInfoSection(room)}
                ${room.image && sameImageRooms.length > 1 ? buildNearbyRoomsSection(room) : ''}
                <section id="search_section" class="inline-search-section" aria-labelledby="search-heading">
                    <h2 id="search-heading" class="sr-only">Search Rooms</h2>
                    ${buildInlineSearchForms()}
                </section>
                <footer id="updated_at" role="contentinfo">
                    <small><i>MapDB last updated: ${escapeHtml(getUpdatedAt())}</i></small>
                </footer>
            </div>
        </main>
    `;
}

function buildMapDropdown(mapCategories) {
    let options = '<option value="">Navigate to map...</option>';
    for (const [category, maps] of mapCategories) {
        options += `<optgroup label="${escapeAttr(category)}">`;
        for (const [mapName, roomId] of maps) {
            options += `<option value="${roomId}">${escapeHtml(mapName)}</option>`;
        }
        options += '</optgroup>';
    }
    return `<select id="map_dropdown" aria-label="Select a map to navigate to">${options}</select>`;
}

function buildAdjacentMapDropdown(adjacentMaps) {
    let options = '<option value="">Adjacent maps...</option>';
    for (const [mapImage, mapData] of adjacentMaps) {
        options += `<option value="${mapData.roomId}">${escapeHtml(mapData.displayName)}</option>`;
    }
    return `<select id="adjacent_map_dropdown" aria-label="Select an adjacent map">${options}</select>`;
}

function buildTagSelector(imageTags, imageLocations) {
    const tagOptions = buildTagOptions(imageTags, false);
    
    let locationOptions = '<option value="">Select a location...</option>';
    for (const location of imageLocations) {
        locationOptions += `<option value="${escapeAttr(location)}">${escapeHtml(location)}</option>`;
    }
    
    return `
        <div id="tag_selector">
            <label for="tag_dropdown">Highlight tag:</label>
            <select id="tag_dropdown" aria-describedby="tag-dropdown-help">${tagOptions}</select>
            <span id="meta_tags_toggle">
                <input type="checkbox" id="show_meta_tags_checkbox">
                <label for="show_meta_tags_checkbox">Show meta tags</label>
            </span>
            <label for="location_dropdown">Highlight location:</label>
            <select id="location_dropdown" aria-describedby="location-dropdown-help">${locationOptions}</select>
            <button id="help_icon" type="button" aria-label="Show help for room highlighting" tabindex="0">?</button>
            <div id="tag-dropdown-help" class="sr-only">Select a tag to highlight all rooms on this map that have that tag</div>
            <div id="location-dropdown-help" class="sr-only">Select a location to highlight all rooms in that specific area of the map</div>
        </div>
    `;
}

function buildTagOptions(tags, showMeta) {
    let options = '<option value="">Select a tag...</option>';
    for (const tag of tags) {
        if (!showMeta && tag.startsWith('meta:')) continue;
        options += `<option value="${escapeAttr(tag)}">${escapeHtml(tag)}</option>`;
    }
    return options;
}

function buildHelpPopup() {
    return `
        <div id="help_popup" style="display: none;" role="dialog" aria-labelledby="help-title" aria-modal="true">
            <div id="help_popup_content">
                <span id="help_close" role="button" tabindex="0" aria-label="Close help dialog">&times;</span>
                <h2 id="help-title">Room Highlight Examples</h2>
                <div class="help_example">
                    <div class="help_highlight highlight_box_example"></div>
                    <span>Current room</span>
                </div>
                <div class="help_example">
                    <div class="help_highlight tag_highlight_box_example"></div>
                    <span>Tag highlight</span>
                </div>
                <div class="help_example">
                    <div class="help_highlight location_highlight_box_example"></div>
                    <span>Location highlight</span>
                </div>
                <div class="help_example">
                    <div class="help_highlight both_highlight_box_example"></div>
                    <span>Tag + location highlight</span>
                </div>
            </div>
        </div>
    `;
}

// Legend (left) and zoom controls (right) in one compact row above the map.
// Screen readers get the legend's information from the highlight announcements,
// so the legend stays a visual aid.
function buildMapToolbar() {
    return `
        <div class="map-toolbar">
            ${buildMapLegend()}
            ${buildMapZoomControls()}
        </div>
    `;
}

function buildMapZoomControls() {
    return `
        <div class="map-zoom-controls" role="group" aria-label="Map zoom">
            <button type="button" id="map_zoom_out" class="map-zoom-button" aria-label="Zoom out" title="Zoom out (minus key)">&minus;</button>
            <span id="map_zoom_level" class="map-zoom-level">Fit</span>
            <button type="button" id="map_zoom_in" class="map-zoom-button" aria-label="Zoom in" title="Zoom in (plus key)">+</button>
            <button type="button" id="map_zoom_fit" class="map-zoom-button" aria-pressed="true" aria-label="Fit map to width" title="Fit map to width (0 key)">Fit</button>
            <button type="button" id="map_zoom_actual" class="map-zoom-button" aria-pressed="false" aria-label="Show map at 100% size" title="Show map at 100% size">100%</button>
            <button type="button" id="map_zoom_center" class="map-zoom-button" aria-disabled="true" aria-label="Center on current room" title="Center on current room">Center</button>
        </div>
    `;
}

function buildMapLegend() {
    return `
        <ul id="map_legend" class="map-legend" aria-label="Map highlight legend">
            <li class="map-legend-item">
                <span class="map-legend-swatch highlight_box_example" aria-hidden="true"></span>
                <span>Current room</span>
            </li>
            <li class="map-legend-item" id="legend_tag" hidden>
                <span class="map-legend-swatch tag_highlight_box_example" aria-hidden="true"></span>
                <span id="legend_tag_label">Tag</span>
                <span id="legend_tag_count" class="map-legend-count"></span>
            </li>
            <li class="map-legend-item" id="legend_location" hidden>
                <span class="map-legend-swatch location_highlight_box_example" aria-hidden="true"></span>
                <span id="legend_location_label">Location</span>
                <span id="legend_location_count" class="map-legend-count"></span>
            </li>
            <li class="map-legend-item" id="legend_both" hidden>
                <span class="map-legend-swatch both_highlight_box_example" aria-hidden="true"></span>
                <span>Tag + location</span>
                <span id="legend_both_count" class="map-legend-count"></span>
            </li>
            <li class="map-legend-item map-legend-total" id="legend_total" hidden></li>
        </ul>
    `;
}

function buildMapSection(room) {
    const mapAlt = room.image.replace(/_/g, ' ').replace(/\.(png|jpg|gif)$/i, '');
    return `
        <section id="map-section" aria-labelledby="map-description">
            <div id="image_wrapper">
                <div id="highlight_box" class="highlight_box"></div>
                <img id="mapimage" src="static/maps/${room.image}" alt="Map of ${escapeAttr(mapAlt)} showing room ${escapeAttr(room.title[0])}. Click on rooms to navigate or use the nearby rooms list below for accessible navigation." role="img" tabindex="0">
                <div id="map-description" class="sr-only">
                    Interactive map showing ${escapeHtml(room.title[0])} and connected rooms. Use tab to navigate to room connections below or use the text-based navigation.
                </div>
            </div>
        </section>
    `;
}

function buildRoomInfoSection(room) {
    const description = room.description?.[0] || 'None';
    const paths = room.paths?.[0] || 'Obvious paths: none';
    const pathsWithLinks = buildPathsWithLinks(paths, room.wayto);
    
    const waytoProcs = getStringProcs(room.wayto);
    const timetoProcs = getStringProcs(room.timeto);
    const hasStringProcs = waytoProcs.length > 0 || timetoProcs.length > 0;
    
    window._currentRoomWaytoProcs = waytoProcs;
    window._currentRoomTimetoProcs = timetoProcs;
    
    let exitsHTML = '';
    if (room.wayto) {
        const sortedExits = Object.entries(room.wayto)
            .sort((a, b) => getExitSortRank(a[1]) - getExitSortRank(b[1]));
        
        for (const [exitRoomId, exitCommand] of sortedExits) {
            const displayCommand = exitCommand.startsWith(';e') ? 'StringProc' : exitCommand;
            const destinationTitle = getRoomTitle(exitRoomId);
            const exitLabel = `${displayCommand} to ${destinationTitle ? destinationTitle + ', ' : ''}room ${exitRoomId}`;
            const destinationHTML = destinationTitle
                ? `<span class="exit-destination" title="${escapeAttr(destinationTitle)}">${escapeHtml(destinationTitle)}</span>`
                : '';
            exitsHTML += `
                <a href="#/room/${escapeAttr(exitRoomId)}" class="exit-item exit-item-compact" aria-label="${escapeAttr(exitLabel)}">
                    <span class="exit-row">
                        <span class="exit-command">${escapeHtml(displayCommand)}</span>
                        <span class="exit-arrow" aria-hidden="true">&rarr;</span>
                        <span class="exit-id">${escapeHtml(exitRoomId)}</span>
                    </span>
                    ${destinationHTML}
                </a>
            `;
        }
    }
    
    return `
        <section aria-labelledby="room-info-heading">
            <h2 id="room-info-heading" class="sr-only">Room Information</h2>
            <div class="room-card">
                <p class="room-description">${escapeHtml(description)}</p>
                <div class="room-paths">
                    ${pathsWithLinks}
                </div>
                ${room.tags ? `
                <div class="room-tags-list" aria-label="Room tags">
                    ${room.tags.map(tag => `<span class="tag-badge">${escapeHtml(tag)}</span>`).join('')}
                </div>
                ` : ''}
            </div>
            
            <div class="exits-section">
                ${hasStringProcs ? `
                    <div class="exits-tabs" role="tablist" aria-label="Exits and StringProc viewers">
                        <span role="tab" class="exits-tab" data-type="exits" aria-selected="true" tabindex="0">EXITS</span>
                        ${waytoProcs.length ? `<span role="tab" class="exits-tab" data-type="wayto" aria-selected="false" tabindex="-1">WayTo</span>` : ''}
                        ${timetoProcs.length ? `<span role="tab" class="exits-tab" data-type="timeto" aria-selected="false" tabindex="-1">TimeTo</span>` : ''}
                    </div>
                ` : `
                    <h3 class="exits-heading">EXITS</h3>
                `}
                <div class="exits-grid">
                    ${exitsHTML}
                </div>
                ${hasStringProcs ? buildStringProcPanel() : ''}
            </div>
        </section>
    `;
}

function buildStringProcPanel() {
    return `
        <div class="stringproc-panel" role="region" aria-label="StringProc code viewer" hidden>
            <div class="stringproc-subtabs" role="tablist" aria-label="Destination rooms">
            </div>
            <div class="stringproc-code-container">
                <pre><code class="language-ruby" id="stringproc-code"></code></pre>
            </div>
        </div>
    `;
}

function buildPathsWithLinks(paths, wayto) {
    if (!wayto) return escapeHtml(paths);
    
    const cardinalMap = {
        'northeast': ['northeast', 'ne'],
        'northwest': ['northwest', 'nw'],
        'southeast': ['southeast', 'se'],
        'southwest': ['southwest', 'sw'],
        'north': ['north', 'n'],
        'south': ['south', 's'],
        'east': ['east', 'e'],
        'west': ['west', 'w'],
        'down': ['down'],
        'out': ['out'],
        'up': ['up']
    };
    
    const exitToRoom = {};
    for (const [roomId, exitCmd] of Object.entries(wayto)) {
        const cmd = exitCmd.toLowerCase();
        for (const [cardinal, variants] of Object.entries(cardinalMap)) {
            if (variants.includes(cmd)) {
                exitToRoom[cardinal] = roomId;
                break;
            }
        }
    }
    
    let result = escapeHtml(paths);
    
    const cardinalsLongFirst = ['northeast', 'northwest', 'southeast', 'southwest', 'north', 'south', 'east', 'west', 'down', 'out', 'up'];
    
    for (const cardinal of cardinalsLongFirst) {
        if (exitToRoom[cardinal]) {
            const regex = new RegExp(`\\b(${cardinal})\\b`, 'gi');
            result = result.replace(regex, `<a href="#/room/${exitToRoom[cardinal]}" class="path-link">$1</a>`);
        }
    }
    
    return result;
}

function buildInlineSearchForms() {
    return `
        <div class="inline-search-container">
            <form id="inlineBasicSearchForm" class="inline-search" role="search" aria-label="Basic room search">
                <input type="text" id="inlineSearch" placeholder="Room ID, UID, tag, or text..." aria-label="Search for room">
                <button type="submit">Search</button>
            </form>
            
            <div class="inline-search-divider">or search by tag:</div>
            
            <form id="inlineTagSearchForm" class="inline-tag-search" role="search" aria-label="Tag and map search">
                <div class="inline-tag-row">
                    <div class="inline-tag-input-wrapper">
                        <input type="text" id="inlineTagInput" placeholder="Start typing a tag..." autocomplete="off"
                               aria-expanded="false" aria-autocomplete="both" role="combobox" aria-controls="inlineTagSuggestions">
                        <ul id="inlineTagSuggestions" tabindex="0" role="listbox" aria-label="Tag suggestions"></ul>
                    </div>
                    <select id="inlineImageSelect" disabled aria-label="Select a map">
                        <option value="">Select map...</option>
                    </select>
                    <select id="inlineLocationSelect" disabled aria-label="Select a location">
                        <option value="">Location (optional)...</option>
                    </select>
                    <button type="submit" id="inlineTagSearchButton" disabled>Go</button>
                </div>
            </form>
        </div>
    `;
}

function buildFullInfoSection(room) {
    const jsonPretty = JSON.stringify(room, null, 2);
    return `
        <section aria-labelledby="full-info-heading">
            <h2 id="full-info-heading" class="sr-only">Full Room Data</h2>
            <div id="full_info_div">
                <details id="full_info_details">
                    <summary>Full Room Info (JSON Data)</summary>
                    <article id="full_info_article">
                        <code id="full_info_code" class="language-json" role="text" aria-label="Room data in JSON format">${escapeHtml(jsonPretty)}</code>
                    </article>
                </details>
            </div>
        </section>
    `;
}

function buildNearbyRoomsSection(room) {
    let roomsHTML = '';
    for (const nearbyRoom of sameImageRooms) {
        if (nearbyRoom.id !== room.id) {
            const locationInfo = nearbyRoom.location ? `<span class="nearby-location"> - Location: ${escapeHtml(nearbyRoom.location)}</span>` : '';
            roomsHTML += `
                <li>
                    <a href="#/room/${nearbyRoom.id}" aria-label="Navigate to ${escapeAttr(nearbyRoom.title[0])}, room ID ${nearbyRoom.id}">
                        ${escapeHtml(nearbyRoom.title[0])} (ID: ${nearbyRoom.id})
                    </a>
                    ${locationInfo}
                </li>
            `;
        }
    }
    
    return `
        <section aria-labelledby="nearby-rooms-heading">
            <h2 id="nearby-rooms-heading" class="sr-only">Nearby Rooms Data</h2>
            <div id="nearby_rooms_div">
                <details id="nearby_rooms_details">
                    <summary>Nearby Rooms on This Map</summary>
                    <article id="nearby_rooms_article" class="nearby-rooms-content">
                        <ul role="list" aria-label="List of nearby rooms" class="nearby-rooms-list">
                            ${roomsHTML}
                        </ul>
                    </article>
                </details>
            </div>
        </section>
    `;
}

function findAdjacentMaps(room) {
    if (!room.image) return [];
    
    const adjacentMaps = {};
    const allRooms = getAllRooms();
    const roomById = {};
    for (const r of allRooms) {
        roomById[r.id] = r;
    }
    
    for (const currentRoom of sameImageRooms) {
        if (currentRoom.wayto) {
            for (const exitRoomId of Object.keys(currentRoom.wayto)) {
                const exitRoom = roomById[parseInt(exitRoomId)];
                if (exitRoom && exitRoom.image && exitRoom.image !== room.image) {
                    if (!adjacentMaps[exitRoom.image]) {
                        let displayName = exitRoom.image;
                        if (exitRoom.tags) {
                            for (const tag of exitRoom.tags) {
                                if (tag.startsWith('meta:mapname:')) {
                                    displayName = tag.replace('meta:mapname:', '');
                                    break;
                                }
                            }
                        }
                        adjacentMaps[exitRoom.image] = {
                            roomId: exitRoom.id,
                            displayName: displayName
                        };
                    }
                }
            }
        }
    }
    
    return Object.entries(adjacentMaps).sort((a, b) => a[1].displayName.localeCompare(b[1].displayName));
}

function collectImageTags(rooms) {
    const tags = new Set();
    for (const room of rooms) {
        if (room.tags) {
            for (const tag of room.tags) {
                tags.add(tag);
            }
        }
    }
    return Array.from(tags).sort();
}

function collectImageLocations(rooms) {
    const locations = new Set();
    for (const room of rooms) {
        if (room.location) {
            locations.add(room.location);
        }
    }
    return Array.from(locations).sort();
}

function initRoomInteractions(room, queryParams) {
    const opacityCheckbox = document.getElementById('opacity_checkbox');
    if (opacityCheckbox) {
        opacityCheckbox.addEventListener('change', toggleOpacity);
    }
    
    const fullInfoCode = document.getElementById('full_info_code');
    if (fullInfoCode && typeof Prism !== 'undefined') {
        Prism.highlightElement(fullInfoCode);
    }
    
    const mapDropdown = document.getElementById('map_dropdown');
    if (mapDropdown) {
        mapDropdown.addEventListener('change', navigateToMap);
    }
    
    const adjacentDropdown = document.getElementById('adjacent_map_dropdown');
    if (adjacentDropdown) {
        adjacentDropdown.addEventListener('change', navigateToAdjacentMap);
    }
    
    const tagDropdown = document.getElementById('tag_dropdown');
    const locationDropdown = document.getElementById('location_dropdown');
    if (tagDropdown) tagDropdown.addEventListener('change', highlightRooms);
    
    const metaCheckbox = document.getElementById('show_meta_tags_checkbox');
    const allTags = collectImageTags(sameImageRooms);
    const refreshTagOptions = () => {
        const selected = tagDropdown.value;
        tagDropdown.innerHTML = buildTagOptions(allTags, metaCheckbox.checked);
        tagDropdown.value = selected;
        if (tagDropdown.value !== selected) highlightRooms();
    };
    if (metaCheckbox && tagDropdown) {
        metaCheckbox.addEventListener('change', refreshTagOptions);
        if (queryParams.highlight_tag?.startsWith('meta:')) {
            metaCheckbox.checked = true;
            tagDropdown.innerHTML = buildTagOptions(allTags, true);
        }
    }
    if (locationDropdown) locationDropdown.addEventListener('change', highlightRooms);
    
    if (queryParams.highlight_tag && tagDropdown) {
        tagDropdown.value = queryParams.highlight_tag;
    }
    if (queryParams.highlight_location && locationDropdown) {
        locationDropdown.value = queryParams.highlight_location;
    }
    
    const mapImage = document.getElementById('mapimage');
    const hasHighlightParams = queryParams.highlight_tag || queryParams.highlight_location;
    
    if (mapImage) {
        mapImage.addEventListener('load', () => {
            fixHighlightBox(room);
            if (hasHighlightParams) highlightRooms();
        });
        mapImage.addEventListener('click', handleMapClick);
        if (mapImage.complete) {
            fixHighlightBox(room);
            if (hasHighlightParams) highlightRooms();
        }
        watchMapResize(room);
        initMapZoom(room);
    }
    
    const helpIcon = document.getElementById('help_icon');
    if (helpIcon) {
        helpIcon.addEventListener('click', showHelpPopup);
    }
    
    const helpClose = document.getElementById('help_close');
    if (helpClose) {
        helpClose.addEventListener('click', hideHelpPopup);
        helpClose.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                hideHelpPopup();
            }
        });
    }

    initInlineSearch();
    initStringProcTabs();
    
    const searchLink = document.getElementById('search_link');
    if (searchLink) {
        searchLink.addEventListener('click', (e) => {
            e.preventDefault();
            const searchSection = document.getElementById('search_section');
            if (searchSection) {
                searchSection.scrollIntoView({ behavior: getScrollBehavior() });
                const searchInput = searchSection.querySelector('input');
                if (searchInput) searchInput.focus();
            }
        });
    }

    const scrollTopBtn = document.getElementById('scroll_top_btn');
    if (scrollTopBtn) {
        scrollTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: getScrollBehavior() });
        });
    }
    
    const copyLinkBtn = document.getElementById('copy_link_btn');
    if (copyLinkBtn) {
        copyLinkBtn.addEventListener('click', () => copyRoomLink(room));
    }
    
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleKeydown);
}

function initStringProcTabs() {
    const tablist = document.querySelector('.exits-tabs');
    if (!tablist) return;
    
    const tabs = tablist.querySelectorAll('.exits-tab');
    const panel = document.querySelector('.stringproc-panel');
    const exitsGrid = document.querySelector('.exits-grid');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => selectMainTab(tab, tabs, panel, exitsGrid));
    });
    
    tablist.addEventListener('keydown', (e) => handleTabKeydown(e, tabs));
    
    // Registered once per render: the subtab container persists while its tabs are rebuilt
    const subtabContainer = document.querySelector('.stringproc-subtabs');
    if (subtabContainer) {
        subtabContainer.addEventListener('keydown', (e) => {
            handleTabKeydown(e, subtabContainer.querySelectorAll('.stringproc-subtab'));
        });
    }
}

function selectMainTab(selectedTab, allTabs, panel, exitsGrid) {
    const type = selectedTab.dataset.type;
    
    allTabs.forEach(tab => {
        const isSelected = tab === selectedTab;
        tab.setAttribute('aria-selected', isSelected);
        tab.setAttribute('tabindex', isSelected ? '0' : '-1');
        tab.classList.toggle('selected', isSelected);
    });
    
    if (type === 'exits') {
        exitsGrid.hidden = false;
        panel.hidden = true;
        announceToScreenReader('Showing exits');
    } else {
        exitsGrid.hidden = true;
        panel.hidden = false;
        const firstProc = populateSubtabs(type);
        const typeLabel = type === 'wayto' ? 'WayTo' : 'TimeTo';
        announceToScreenReader(firstProc
            ? `Showing ${typeLabel} StringProcs. Code for room ${firstProc.roomId} shown.`
            : `Showing ${typeLabel} StringProcs`);
    }
}

function populateSubtabs(type) {
    const container = document.querySelector('.stringproc-subtabs');
    const procs = type === 'wayto' 
        ? window._currentRoomWaytoProcs 
        : window._currentRoomTimetoProcs;
    
    container.innerHTML = procs.map((proc, index) => {
        const destinationTitle = getRoomTitle(proc.roomId);
        const titleHTML = destinationTitle
            ? ` <span class="stringproc-subtab-title">${escapeHtml(destinationTitle)}</span>`
            : '';
        const tooltip = destinationTitle ? ` title="${escapeAttr(`Room ${proc.roomId}: ${destinationTitle}`)}"` : '';
        return `
        <span role="tab" 
              class="stringproc-subtab" 
              data-index="${index}"
              data-type="${type}"
              aria-selected="false"
              tabindex="-1"${tooltip}>${escapeHtml(String(proc.roomId))}${titleHTML}</span>
    `;
    }).join('');
    
    const subtabs = container.querySelectorAll('.stringproc-subtab');
    subtabs.forEach(subtab => {
        subtab.addEventListener('click', () => selectSubtab(subtab, procs));
    });
    
    // Clear code display when switching main tabs
    document.getElementById('stringproc-code').textContent = '';
    
    // Open with the first destination selected so the tablist is reachable
    // by keyboard (roving tabindex) and the panel is never empty
    if (subtabs.length === 0) return null;
    selectSubtab(subtabs[0], procs, false);
    return procs[0];
}

function selectSubtab(selectedSubtab, procs, announce = true) {
    const allSubtabs = document.querySelectorAll('.stringproc-subtab');
    const index = parseInt(selectedSubtab.dataset.index);
    const proc = procs[index];
    
    allSubtabs.forEach(tab => {
        const isSelected = tab === selectedSubtab;
        tab.setAttribute('aria-selected', isSelected);
        tab.setAttribute('tabindex', isSelected ? '0' : '-1');
        tab.classList.toggle('selected', isSelected);
    });
    
    const codeEl = document.getElementById('stringproc-code');
    codeEl.textContent = formatStringProc(proc.code);
    if (typeof Prism !== 'undefined') {
        Prism.highlightElement(codeEl);
    }
    
    if (announce) {
        announceToScreenReader(`Showing code for room ${proc.roomId}`);
    }
}

function handleTabKeydown(e, tabs) {
    const tabArray = Array.from(tabs);
    const currentIndex = tabArray.findIndex(t => t.getAttribute('aria-selected') === 'true');
    
    let newIndex = currentIndex;
    
    switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
            e.preventDefault();
            newIndex = currentIndex <= 0 ? tabArray.length - 1 : currentIndex - 1;
            break;
        case 'ArrowRight':
        case 'ArrowDown':
            e.preventDefault();
            newIndex = currentIndex >= tabArray.length - 1 ? 0 : currentIndex + 1;
            break;
        case 'Home':
            e.preventDefault();
            newIndex = 0;
            break;
        case 'End':
            e.preventDefault();
            newIndex = tabArray.length - 1;
            break;
        default:
            return;
    }
    
    tabArray[newIndex].focus();
    tabArray[newIndex].click();
}

function toggleOpacity() {
    const mapImage = document.getElementById('mapimage');
    const checkbox = document.getElementById('opacity_checkbox');
    if (checkbox.checked) {
        mapImage.classList.add('opacity_active');
    } else {
        mapImage.classList.remove('opacity_active');
    }
}

function navigateToMap() {
    const dropdown = document.getElementById('map_dropdown');
    const selectedRoomId = dropdown.value;
    if (selectedRoomId) {
        const selectedText = dropdown.options[dropdown.selectedIndex].text;
        announceToScreenReader(`Navigating to map: ${selectedText}`);
        navigate(`/room/${selectedRoomId}`);
    }
}

function navigateToAdjacentMap() {
    const dropdown = document.getElementById('adjacent_map_dropdown');
    const selectedRoomId = dropdown.value;
    if (selectedRoomId) {
        const selectedText = dropdown.options[dropdown.selectedIndex].text;
        announceToScreenReader(`Navigating to adjacent map: ${selectedText}`);
        navigate(`/room/${selectedRoomId}`);
    }
}

function copyRoomLink(room) {
    const currentTag = document.getElementById('tag_dropdown')?.value || '';
    const currentLocation = document.getElementById('location_dropdown')?.value || '';
    
    let url = `${window.location.origin}${window.location.pathname}#/room/${room.id}`;
    const params = new URLSearchParams();
    if (currentTag) params.append('highlight_tag', currentTag);
    if (currentLocation) params.append('highlight_location', currentLocation);
    if (params.toString()) url += '?' + params.toString();
    
    navigator.clipboard.writeText(url).then(() => {
        const popup = document.getElementById('copy_link_popup');
        popup.classList.add('visible');
        announceToScreenReader('Link copied to clipboard');
        setTimeout(() => {
            popup.classList.remove('visible');
        }, 2000);
    }).catch(() => {
        announceToScreenReader('Failed to copy link');
    });
}

function showHelpPopup() {
    const popup = document.getElementById('help_popup');
    popup.style.display = 'flex';
    const closeButton = document.getElementById('help_close');
    closeButton.focus();
}

function hideHelpPopup() {
    const popup = document.getElementById('help_popup');
    popup.style.display = 'none';
    const helpIcon = document.getElementById('help_icon');
    if (helpIcon) helpIcon.focus();
}

function handleDocumentClick(event) {
    const popup = document.getElementById('help_popup');
    const popupContent = document.getElementById('help_popup_content');
    const helpIcon = document.getElementById('help_icon');
    
    if (popup && popup.style.display === 'flex' &&
        popupContent && !popupContent.contains(event.target) &&
        event.target !== helpIcon) {
        hideHelpPopup();
    }
}

function handleKeydown(event) {
    const popup = document.getElementById('help_popup');
    if (popup && popup.style.display === 'flex') {
        if (event.key === 'Escape') {
            event.preventDefault();
            hideHelpPopup();
            return;
        }
        
        const focusableElements = popup.querySelectorAll('[tabindex="0"], button, [href]');
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        
        if (event.key === 'Tab') {
            if (event.shiftKey && document.activeElement === firstElement) {
                event.preventDefault();
                lastElement.focus();
            } else if (!event.shiftKey && document.activeElement === lastElement) {
                event.preventDefault();
                firstElement.focus();
            }
        }
    }
    
    const mapImage = document.getElementById('mapimage');
    
    if (event.altKey) {
        switch (event.key) {
            case 's':
                event.preventDefault();
                const searchInput = document.querySelector('#search, #tagInput');
                if (searchInput) {
                    searchInput.focus();
                    announceToScreenReader('Focused on search input');
                }
                break;
            case 'n':
                event.preventDefault();
                const mapDropdown = document.getElementById('map_dropdown');
                if (mapDropdown) {
                    mapDropdown.focus();
                    announceToScreenReader('Focused on map navigation');
                }
                break;
            case 'r':
                event.preventDefault();
                const roomTable = document.getElementById('desc_table');
                if (roomTable) {
                    roomTable.focus();
                    announceToScreenReader('Focused on room information table');
                }
                break;
        }
    }
    
    if (document.activeElement === mapImage) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            announceToScreenReader('Interactive map: Use the room connections table below, nearby rooms list, or search to navigate. Map clicks require mouse interaction.', true);
        }
    }
}

function fixHighlightBox(room) {
    const imgElement = document.getElementById('mapimage');
    if (!imgElement || !room.image_coords) return;
    
    const origWidth = imgElement.naturalWidth;
    const origHeight = imgElement.naturalHeight;
    const renderedWidth = imgElement.clientWidth;
    const renderedHeight = imgElement.clientHeight;
    
    const widthRatio = renderedWidth / origWidth;
    const heightRatio = renderedHeight / origHeight;
    
    const jsCalculatedX = Math.floor(widthRatio * room.image_coords[0]);
    const jsCalculatedY = Math.floor(heightRatio * room.image_coords[1]);
    const jsOriginalWidth = Math.floor(widthRatio * room.image_coords[2]) - jsCalculatedX;
    const jsOriginalHeight = Math.floor(heightRatio * room.image_coords[3]) - jsCalculatedY;
    
    const minSize = 10;
    const jsFinalWidth = Math.max(jsOriginalWidth, minSize);
    const jsFinalHeight = Math.max(jsOriginalHeight, minSize);
    const jsWidthAdjustment = (jsFinalWidth - jsOriginalWidth) / 2;
    const jsHeightAdjustment = (jsFinalHeight - jsOriginalHeight) / 2;
    
    const jsFinalX = jsCalculatedX - jsWidthAdjustment;
    const jsFinalY = jsCalculatedY - jsHeightAdjustment;
    
    const mainRoomBox = document.getElementById('highlight_box');
    if (mainRoomBox) {
        mainRoomBox.style.marginLeft = jsFinalX + 'px';
        mainRoomBox.style.marginTop = jsFinalY + 'px';
        mainRoomBox.style.width = jsFinalWidth + 'px';
        mainRoomBox.style.height = jsFinalHeight + 'px';
    }
}

function highlightRooms() {
    const selectedTag = document.getElementById('tag_dropdown')?.value || '';
    const selectedLocation = document.getElementById('location_dropdown')?.value || '';
    
    const counts = renderHighlightBoxes(selectedTag, selectedLocation);
    
    if (!selectedTag && !selectedLocation) {
        announceToScreenReader('Room highlights cleared');
        return;
    }
    
    const total = counts.tag + counts.location + counts.both;
    const roomsText = `${total} ${total === 1 ? 'room' : 'rooms'}`;
    let announcement = '';
    if (selectedTag && selectedLocation) {
        announcement = `Highlighted ${roomsText} with tag "${selectedTag}" or location "${selectedLocation}", ${counts.both} matching both`;
    } else if (selectedTag) {
        announcement = `Highlighted ${roomsText} with tag "${selectedTag}"`;
    } else if (selectedLocation) {
        announcement = `Highlighted ${roomsText} in location "${selectedLocation}"`;
    }
    announceToScreenReader(announcement);
}

// Draws (or redraws) the tag/location boxes for the current image size and
// returns how many boxes of each kind were drawn. Separate from highlightRooms()
// so a resize can reposition boxes silently.
function renderHighlightBoxes(selectedTag, selectedLocation) {
    const existingHighlights = document.querySelectorAll('.tag_highlight_box, .location_highlight_box, .both_highlight_box');
    existingHighlights.forEach(box => box.remove());
    
    const counts = { tag: 0, location: 0, both: 0 };
    
    if (!selectedTag && !selectedLocation) {
        updateMapLegend(selectedTag, selectedLocation, counts);
        return counts;
    }
    
    const imgElement = document.getElementById('mapimage');
    const origWidth = imgElement.naturalWidth;
    const origHeight = imgElement.naturalHeight;
    const renderedWidth = imgElement.clientWidth;
    const renderedHeight = imgElement.clientHeight;
    
    const widthRatio = renderedWidth / origWidth;
    const heightRatio = renderedHeight / origHeight;
    
    sameImageRooms.forEach(room => {
        if (room.image_coords) {
            const hasTag = selectedTag && room.tags && room.tags.includes(selectedTag);
            const hasLocation = selectedLocation && room.location === selectedLocation;
            
            if (hasTag || hasLocation) {
                const highlightBox = document.createElement('div');
                highlightBox.style.position = 'absolute';
                highlightBox.style.zIndex = '8';
                
                const imageWrapper = document.getElementById('image_wrapper');
                const wrapperStyle = window.getComputedStyle(imageWrapper);
                
                if (hasTag && hasLocation) {
                    highlightBox.className = 'both_highlight_box';
                    counts.both++;
                } else if (hasTag) {
                    highlightBox.className = 'tag_highlight_box';
                    counts.tag++;
                } else {
                    highlightBox.className = 'location_highlight_box';
                    counts.location++;
                }
                
                const originalWidth = Math.floor(widthRatio * room.image_coords[2]) - Math.floor(widthRatio * room.image_coords[0]);
                const originalHeight = Math.floor(heightRatio * room.image_coords[3]) - Math.floor(heightRatio * room.image_coords[1]);
                
                const minSize = 10;
                const finalWidth = Math.max(originalWidth, minSize);
                const finalHeight = Math.max(originalHeight, minSize);
                
                const widthAdjustment = (finalWidth - originalWidth) / 2;
                const heightAdjustment = (finalHeight - originalHeight) / 2;
                
                const paddingLeft = parseFloat(wrapperStyle.paddingLeft);
                const paddingTop = parseFloat(wrapperStyle.paddingTop);
                
                const calcLeft = Math.floor(widthRatio * room.image_coords[0]) - widthAdjustment + paddingLeft;
                const calcTop = Math.floor(heightRatio * room.image_coords[1]) - heightAdjustment + paddingTop;
                
                highlightBox.style.left = calcLeft + 'px';
                highlightBox.style.top = calcTop + 'px';
                highlightBox.style.width = finalWidth + 'px';
                highlightBox.style.height = finalHeight + 'px';
                highlightBox.title = `Room ${room.id}: ${room.title[0]}`;
                
                document.getElementById('image_wrapper').appendChild(highlightBox);
            }
        }
    });
    
    updateMapLegend(selectedTag, selectedLocation, counts);
    return counts;
}

// Shows only the legend entries that apply to the current selection, with counts.
// Text is set with textContent, so tag and location names never touch innerHTML.
function updateMapLegend(selectedTag, selectedLocation, counts) {
    const legend = document.getElementById('map_legend');
    if (!legend) return;
    
    const hasBoth = Boolean(selectedTag && selectedLocation);
    const entries = [
        { id: 'legend_tag', visible: Boolean(selectedTag), count: counts.tag, label: hasBoth ? 'Tag only' : 'Tag' },
        { id: 'legend_location', visible: Boolean(selectedLocation), count: counts.location, label: hasBoth ? 'Location only' : 'Location' },
        { id: 'legend_both', visible: hasBoth, count: counts.both, label: null }
    ];
    
    for (const entry of entries) {
        const item = document.getElementById(entry.id);
        const countEl = document.getElementById(`${entry.id}_count`);
        const labelEl = document.getElementById(`${entry.id}_label`);
        if (!item || !countEl) continue;
        item.hidden = !entry.visible;
        countEl.textContent = `(${entry.count})`;
        if (labelEl && entry.label) labelEl.textContent = entry.label;
    }
    
    const totalEl = document.getElementById('legend_total');
    if (totalEl) {
        const total = counts.tag + counts.location + counts.both;
        totalEl.hidden = !(selectedTag || selectedLocation);
        totalEl.textContent = `${total} ${total === 1 ? 'room' : 'rooms'} highlighted`;
    }
}

// The map image is now fluid, so boxes must follow it when the viewport changes
// (rotation, window resize, breakpoint padding change).
function watchMapResize(room) {
    if (mapResizeObserver) {
        mapResizeObserver.disconnect();
        mapResizeObserver = null;
    }
    
    const imgElement = document.getElementById('mapimage');
    if (!imgElement || typeof ResizeObserver === 'undefined') return;
    
    let frame = 0;
    mapResizeObserver = new ResizeObserver(() => {
        if (frame) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
            frame = 0;
            if (!imgElement.naturalWidth) return;
            syncMapOverlays(room);
            updateZoomControls();
        });
    });
    mapResizeObserver.observe(imgElement);
}

// Redraws every overlay (current-room box, tag/location boxes, legend counts) for the
// image's current rendered size. Called after resizes and after every zoom change.
function syncMapOverlays(room) {
    fixHighlightBox(room);
    renderHighlightBoxes(
        document.getElementById('tag_dropdown')?.value || '',
        document.getElementById('location_dropdown')?.value || ''
    );
}

// ----- Map zoom -----
// Fit: the image keeps its responsive max-width and the page scrolls normally.
// Zoomed: #image_wrapper becomes a scrollable viewport and the image is shown at
// natural size x zoom (the width comes from the --map-width variable).

function getEffectiveMapScale(imgElement) {
    return imgElement.naturalWidth ? imgElement.clientWidth / imgElement.naturalWidth : 1;
}

// Next zoom step above (direction 1) or below (direction -1) the current scale.
// The 10% margin keeps a tiny step, like 47% to 50%, from feeling like nothing happened.
function findZoomStep(scale, direction) {
    if (direction > 0) {
        return MAP_ZOOM_STEPS.find(step => step > scale * 1.1) || null;
    }
    return [...MAP_ZOOM_STEPS].reverse().find(step => step < scale / 1.1) || null;
}

function initMapZoom(room) {
    const imgElement = document.getElementById('mapimage');
    const wrapper = document.getElementById('image_wrapper');
    if (!imgElement || !wrapper || !document.getElementById('map_zoom_in')) return;
    
    // aria-disabled (not disabled) keeps keyboard focus on the button when a limit is reached
    const bind = (id, handler) => {
        document.getElementById(id).addEventListener('click', (e) => {
            if (e.currentTarget.getAttribute('aria-disabled') === 'true') return;
            handler();
        });
    };
    
    bind('map_zoom_in', () => stepMapZoom(1));
    bind('map_zoom_out', () => stepMapZoom(-1));
    bind('map_zoom_fit', () => applyMapZoom('fit', { announce: true }));
    bind('map_zoom_actual', () => applyMapZoom(1, { announce: true }));
    bind('map_zoom_center', () => centerMapOnRoom(room, getScrollBehavior()));
    
    wrapper.addEventListener('keydown', handleMapZoomKeydown);
    
    // Restore the zoom level from the previous room, then center on this room's box
    const restoreZoom = () => applyMapZoom(mapZoom, { focus: 'room' });
    if (imgElement.complete && imgElement.naturalWidth) {
        restoreZoom();
    } else {
        imgElement.addEventListener('load', restoreZoom, { once: true });
    }
    updateZoomControls();
}

function stepMapZoom(direction) {
    const imgElement = document.getElementById('mapimage');
    if (!imgElement || !imgElement.naturalWidth) return;
    
    const next = findZoomStep(getEffectiveMapScale(imgElement), direction);
    if (next === null) {
        announceToScreenReader(direction > 0 ? 'Maximum zoom reached' : 'Minimum zoom reached');
        return;
    }
    applyMapZoom(next, { announce: true });
}

function handleMapZoomKeydown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    
    switch (event.key) {
        case '+':
        case '=':
            event.preventDefault();
            stepMapZoom(1);
            break;
        case '-':
        case '_':
            event.preventDefault();
            stepMapZoom(-1);
            break;
        case '0':
            event.preventDefault();
            applyMapZoom('fit', { announce: true });
            break;
    }
}

// zoom: 'fit' or a number (fraction of natural size).
// focus: 'room' centers the current room; 'keep' holds the middle of the view steady.
// Leaving Fit always centers the room, since there was no scroll position to keep.
function applyMapZoom(zoom, { focus = 'keep', announce = false } = {}) {
    const wrapper = document.getElementById('image_wrapper');
    const imgElement = document.getElementById('mapimage');
    if (!wrapper || !imgElement || !imgElement.naturalWidth) return;
    
    const wasZoomed = wrapper.classList.contains('map-zoomed');
    
    // Where the middle of the viewport sits on the image, as a fraction, before resizing
    let focusX = 0.5;
    let focusY = 0.5;
    if (wasZoomed && imgElement.clientWidth && imgElement.clientHeight) {
        const style = window.getComputedStyle(wrapper);
        focusX = (wrapper.scrollLeft + wrapper.clientWidth / 2 - parseFloat(style.paddingLeft)) / imgElement.clientWidth;
        focusY = (wrapper.scrollTop + wrapper.clientHeight / 2 - parseFloat(style.paddingTop)) / imgElement.clientHeight;
    }
    
    mapZoom = zoom;
    
    if (zoom === 'fit') {
        wrapper.classList.remove('map-zoomed');
        wrapper.style.removeProperty('--map-width');
        wrapper.removeAttribute('tabindex');
        wrapper.removeAttribute('role');
        wrapper.removeAttribute('aria-label');
        wrapper.scrollLeft = 0;
        wrapper.scrollTop = 0;
    } else {
        wrapper.classList.add('map-zoomed');
        wrapper.style.setProperty('--map-width', `${Math.round(imgElement.naturalWidth * zoom)}px`);
        // A scrollable region must be focusable so keyboard users can pan it with the arrow keys
        wrapper.setAttribute('tabindex', '0');
        wrapper.setAttribute('role', 'group');
        wrapper.setAttribute('aria-label', 'Zoomed map. Scroll with the arrow keys. Press plus or minus to zoom, 0 to fit.');
    }
    
    // Layout is up to date by now, so overlays can be placed against the new size right away
    // (the ResizeObserver repeats this on the next frame, which is harmless)
    syncMapOverlays(currentRoom);
    
    if (zoom !== 'fit') {
        if (focus === 'room' || !wasZoomed) {
            centerMapOnRoom(currentRoom, 'auto');
        } else {
            const style = window.getComputedStyle(wrapper);
            wrapper.scrollTo({
                left: focusX * imgElement.clientWidth + parseFloat(style.paddingLeft) - wrapper.clientWidth / 2,
                top: focusY * imgElement.clientHeight + parseFloat(style.paddingTop) - wrapper.clientHeight / 2,
                behavior: 'auto'
            });
        }
    }
    
    updateZoomControls();
    
    if (announce) {
        const percent = Math.round(getEffectiveMapScale(imgElement) * 100);
        announceToScreenReader(zoom === 'fit' ? `Map fitted to width, ${percent}%` : `Map zoom ${percent}%`);
    }
}

// Scrolls the zoomed viewport so the current room's box is in the middle.
// Page-load and room-switch calls pass 'auto' (an instant jump); the Center button
// passes getScrollBehavior() so it animates unless reduced motion is requested.
function centerMapOnRoom(room, behavior) {
    const wrapper = document.getElementById('image_wrapper');
    const imgElement = document.getElementById('mapimage');
    if (!wrapper || !imgElement || !room?.image_coords) return;
    if (!wrapper.classList.contains('map-zoomed') || !imgElement.naturalWidth) return;
    
    const style = window.getComputedStyle(wrapper);
    const widthRatio = imgElement.clientWidth / imgElement.naturalWidth;
    const heightRatio = imgElement.clientHeight / imgElement.naturalHeight;
    const [x1, y1, x2, y2] = room.image_coords;
    
    const centerX = parseFloat(style.paddingLeft) + ((x1 + x2) / 2) * widthRatio;
    const centerY = parseFloat(style.paddingTop) + ((y1 + y2) / 2) * heightRatio;
    
    wrapper.scrollTo({
        left: Math.max(0, centerX - wrapper.clientWidth / 2),
        top: Math.max(0, centerY - wrapper.clientHeight / 2),
        behavior
    });
}

function updateZoomControls() {
    const imgElement = document.getElementById('mapimage');
    const level = document.getElementById('map_zoom_level');
    if (!imgElement || !level || !imgElement.naturalWidth) return;
    
    const scale = getEffectiveMapScale(imgElement);
    const percent = Math.round(scale * 100);
    const isFit = mapZoom === 'fit';
    
    level.textContent = isFit ? `Fit ${percent}%` : `${percent}%`;
    
    document.getElementById('map_zoom_in').setAttribute('aria-disabled', String(findZoomStep(scale, 1) === null));
    document.getElementById('map_zoom_out').setAttribute('aria-disabled', String(findZoomStep(scale, -1) === null));
    document.getElementById('map_zoom_fit').setAttribute('aria-pressed', String(isFit));
    document.getElementById('map_zoom_actual').setAttribute('aria-pressed', String(!isFit && Math.abs(mapZoom - 1) < 0.001));
    document.getElementById('map_zoom_center').setAttribute('aria-disabled', String(isFit));
}

// Click-to-navigate. The click is measured against the image's own on-screen box, so it is
// correct at any zoom level and any scroll position of the zoomed viewport.
function handleMapClick(event) {
    const imgElement = document.getElementById('mapimage');
    const imageRect = imgElement.getBoundingClientRect();
    const clickX = event.clientX - imageRect.left;
    const clickY = event.clientY - imageRect.top;
    
    const widthRatio = imgElement.clientWidth / imgElement.naturalWidth;
    const heightRatio = imgElement.clientHeight / imgElement.naturalHeight;
    
    let clickedRoom = null;
    sameImageRooms.forEach(room => {
        if (room.image_coords) {
            const originalX = Math.floor(widthRatio * room.image_coords[0]);
            const originalY = Math.floor(heightRatio * room.image_coords[1]);
            const originalWidth = Math.floor(widthRatio * room.image_coords[2]) - Math.floor(widthRatio * room.image_coords[0]);
            const originalHeight = Math.floor(heightRatio * room.image_coords[3]) - Math.floor(heightRatio * room.image_coords[1]);
            
            const minSize = 10;
            const finalWidth = Math.max(originalWidth, minSize);
            const finalHeight = Math.max(originalHeight, minSize);
            
            const widthAdjustment = (finalWidth - originalWidth) / 2;
            const heightAdjustment = (finalHeight - originalHeight) / 2;
            
            const roomLeft = originalX - widthAdjustment;
            const roomTop = originalY - heightAdjustment;
            const roomRight = roomLeft + finalWidth;
            const roomBottom = roomTop + finalHeight;
            
            if (clickX >= roomLeft && clickX <= roomRight &&
                clickY >= roomTop && clickY <= roomBottom) {
                clickedRoom = room;
            }
        }
    });
    
    if (clickedRoom) {
        navigateToRoom(clickedRoom.id);
    }
}

function navigateToRoom(roomId) {
    const currentTag = document.getElementById('tag_dropdown')?.value || '';
    const currentLocation = document.getElementById('location_dropdown')?.value || '';
    
    let path = `/room/${roomId}`;
    const params = new URLSearchParams();
    if (currentTag) params.append('highlight_tag', currentTag);
    if (currentLocation) params.append('highlight_location', currentLocation);
    if (params.toString()) path += '?' + params.toString();
    
    navigate(path);
}

let inlineTagsCache = [];

function initInlineSearch() {
    const basicForm = document.getElementById('inlineBasicSearchForm');
    if (basicForm) {
        basicForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('inlineSearch');
            if (input.value.trim()) {
                navigate(`/search?q=${encodeURIComponent(input.value.trim())}`);
            }
        });
    }
    
    inlineTagsCache = getAllTags();
    initInlineTagAutocomplete();
    initInlineCascadingDropdowns();
}

function initInlineTagAutocomplete() {
    const tagInput = document.getElementById('inlineTagInput');
    const tagSuggestions = document.getElementById('inlineTagSuggestions');
    let selectedIndex = -1;
    
    if (!tagInput || !tagSuggestions) return;
    
    tagInput.addEventListener('input', function() {
        const inputValue = this.value.toLowerCase();
        resetInlineDropdowns();
        
        if (inputValue.length > 0) {
            const filteredTags = inlineTagsCache.filter(tag =>
                tag.toLowerCase().includes(inputValue)
            );
            
            if (filteredTags.length > 0) {
                showInlineSuggestions(filteredTags, tagSuggestions, tagInput);
                selectedIndex = -1;
            } else {
                hideInlineSuggestions(tagSuggestions, tagInput);
            }
        } else {
            hideInlineSuggestions(tagSuggestions, tagInput);
        }
    });
    
    tagInput.addEventListener('keydown', function(e) {
        const isVisible = tagSuggestions.style.display === 'block';
        if (!isVisible) return;
        
        const items = tagSuggestions.querySelectorAll('.inline-suggestion-item');
        
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
                updateInlineHighlight(items, selectedIndex);
                break;
            case 'ArrowUp':
                e.preventDefault();
                selectedIndex = Math.max(selectedIndex - 1, -1);
                updateInlineHighlight(items, selectedIndex);
                break;
            case 'Enter':
                e.preventDefault();
                if (selectedIndex >= 0 && selectedIndex < items.length) {
                    selectInlineTag(items[selectedIndex].textContent);
                }
                break;
            case 'Escape':
                e.preventDefault();
                hideInlineSuggestions(tagSuggestions, tagInput);
                break;
        }
    });
    
    tagInput.addEventListener('blur', function() {
        setTimeout(() => {
            if (document.activeElement !== tagInput && document.activeElement !== tagSuggestions) {
                hideInlineSuggestions(tagSuggestions, tagInput);
            }
        }, 150);
    });
}

function showInlineSuggestions(tags, container, input) {
    container.innerHTML = '';
    
    tags.slice(0, 30).forEach((tag, index) => {
        const li = document.createElement('li');
        li.textContent = tag;
        li.className = 'inline-suggestion-item';
        li.setAttribute('role', 'option');
        li.setAttribute('id', `inline-tag-option-${index}`);
        li.setAttribute('aria-selected', 'false');
        
        li.addEventListener('click', (e) => {
            e.preventDefault();
            selectInlineTag(tag);
        });
        
        container.appendChild(li);
    });
    
    container.style.display = 'block';
    input.setAttribute('aria-expanded', 'true');
}

function hideInlineSuggestions(container, input) {
    container.style.display = 'none';
    input.setAttribute('aria-expanded', 'false');
}

function updateInlineHighlight(items, selectedIndex) {
    items.forEach((item, index) => {
        if (index === selectedIndex) {
            item.classList.add('selected');
            item.setAttribute('aria-selected', 'true');
        } else {
            item.classList.remove('selected');
            item.setAttribute('aria-selected', 'false');
        }
    });
}

function selectInlineTag(tag) {
    const tagInput = document.getElementById('inlineTagInput');
    const tagSuggestions = document.getElementById('inlineTagSuggestions');
    
    tagInput.value = tag;
    hideInlineSuggestions(tagSuggestions, tagInput);
    loadInlineImagesForTag(tag);
}

function resetInlineDropdowns() {
    const imageSelect = document.getElementById('inlineImageSelect');
    const locationSelect = document.getElementById('inlineLocationSelect');
    const tagSearchButton = document.getElementById('inlineTagSearchButton');
    
    imageSelect.innerHTML = '<option value="">Select map...</option>';
    imageSelect.disabled = true;
    locationSelect.innerHTML = '<option value="">Location (optional)...</option>';
    locationSelect.disabled = true;
    tagSearchButton.disabled = true;
}

function initInlineCascadingDropdowns() {
    const imageSelect = document.getElementById('inlineImageSelect');
    const locationSelect = document.getElementById('inlineLocationSelect');
    const tagSearchButton = document.getElementById('inlineTagSearchButton');
    const tagSearchForm = document.getElementById('inlineTagSearchForm');
    
    if (!imageSelect) return;
    
    imageSelect.addEventListener('change', function() {
        const selectedImage = this.value;
        const tagInput = document.getElementById('inlineTagInput');
        
        locationSelect.innerHTML = '<option value="">Location (optional)...</option>';
        locationSelect.disabled = true;
        
        if (selectedImage) {
            loadInlineLocationsForTagAndImage(tagInput.value, selectedImage);
            tagSearchButton.disabled = false;
        } else {
            tagSearchButton.disabled = true;
        }
    });
    
    if (tagSearchForm) {
        tagSearchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const tagInput = document.getElementById('inlineTagInput');
            const tag = tagInput.value;
            const image = imageSelect.value;
            const location = locationSelect.value;
            
            if (tag && image) {
                navigateToInlineTaggedRoom(tag, image, location);
            }
        });
    }
}

function loadInlineImagesForTag(tag) {
    const imageSelect = document.getElementById('inlineImageSelect');
    const allRooms = getAllRooms();
    
    const imagesWithTag = {};
    
    for (const room of allRooms) {
        if (room.tags?.includes(tag) && room.image) {
            if (!imagesWithTag[room.image]) {
                let displayName = room.image;
                if (room.tags) {
                    for (const t of room.tags) {
                        if (t.startsWith('meta:mapname:')) {
                            displayName = t.replace('meta:mapname:', '');
                            break;
                        }
                    }
                }
                imagesWithTag[room.image] = { filename: room.image, display_name: displayName };
            }
        }
    }
    
    const images = Object.values(imagesWithTag).sort((a, b) => 
        a.display_name.localeCompare(b.display_name)
    );
    
    imageSelect.innerHTML = '<option value="">Select map...</option>';
    images.forEach(imageData => {
        const option = document.createElement('option');
        option.value = imageData.filename;
        option.textContent = imageData.display_name;
        imageSelect.appendChild(option);
    });
    imageSelect.disabled = false;
}

function loadInlineLocationsForTagAndImage(tag, image) {
    const locationSelect = document.getElementById('inlineLocationSelect');
    const allRooms = getAllRooms();
    
    const locations = new Set();
    
    for (const room of allRooms) {
        const imageMatch = room.image === image;
        const tagMatch = !tag || room.tags?.includes(tag);
        
        if (imageMatch && tagMatch && room.location) {
            locations.add(room.location);
        }
    }
    
    const sortedLocations = Array.from(locations).sort();
    
    locationSelect.innerHTML = '<option value="">Location (optional)...</option>';
    sortedLocations.forEach(location => {
        const option = document.createElement('option');
        option.value = location;
        option.textContent = location;
        locationSelect.appendChild(option);
    });
    locationSelect.disabled = false;
}

function navigateToInlineTaggedRoom(tag, image, location) {
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
    
    announceToScreenReader('No matching room found');
}
