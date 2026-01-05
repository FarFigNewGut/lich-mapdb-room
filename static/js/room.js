import { getRoomById, getRoomsOnMap, getMapCategories, getAllRooms, getAllTags } from './data.js';
import { navigate } from './router.js';
import { announceToScreenReader, escapeHtml, getUpdatedAt } from './utils.js';

let currentRoom = null;
let sameImageRooms = [];

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
                    <span id="search_link" title="Search for another room" role="button" tabindex="0">&#128269;</span>
                    <span id="copy_link_btn" title="Copy link for this room" role="button" tabindex="0" aria-label="Copy link for this room">&#128279;</span>
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
        ${room.image ? buildMapSection(room) : ''}
        
        <main id="main-content" role="main">
            <div id="after_image">
                ${buildRoomInfoSection(room)}
                <div class="collapsibles-row">
                    ${buildFullInfoSection(room)}
                    ${room.image && sameImageRooms.length > 1 ? buildNearbyRoomsSection(room) : ''}
                </div>
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
        options += `<optgroup label="${escapeHtml(category)}">`;
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
    let tagOptions = '<option value="">Select a tag...</option>';
    for (const tag of imageTags) {
        tagOptions += `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`;
    }
    
    let locationOptions = '<option value="">Select a location...</option>';
    for (const location of imageLocations) {
        locationOptions += `<option value="${escapeHtml(location)}">${escapeHtml(location)}</option>`;
    }
    
    return `
        <div id="tag_selector">
            <label for="tag_dropdown">Highlight tag:</label>
            <select id="tag_dropdown" aria-describedby="tag-dropdown-help">${tagOptions}</select>
            <label for="location_dropdown">Highlight location:</label>
            <select id="location_dropdown" aria-describedby="location-dropdown-help">${locationOptions}</select>
            <button id="help_icon" type="button" aria-label="Show help for room highlighting" tabindex="0">?</button>
            <div id="tag-dropdown-help" class="sr-only">Select a tag to highlight all rooms on this map that have that tag</div>
            <div id="location-dropdown-help" class="sr-only">Select a location to highlight all rooms in that specific area of the map</div>
        </div>
    `;
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

function buildMapSection(room) {
    const mapAlt = room.image.replace(/_/g, ' ').replace(/\.(png|jpg|gif)$/i, '');
    return `
        <section id="map-section" role="img" aria-labelledby="map-description">
            <div id="image_wrapper">
                <div id="highlight_box" class="highlight_box"></div>
                <img id="mapimage" src="static/maps/${room.image}" alt="Map of ${escapeHtml(mapAlt)} showing room ${escapeHtml(room.title[0])}. Click on rooms to navigate or use the nearby rooms list below for accessible navigation." role="img" tabindex="0">
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
    
    let exitsHTML = '';
    if (room.wayto) {
        for (const [exitRoomId, exitCommand] of Object.entries(room.wayto)) {
            const displayCommand = exitCommand.startsWith(';e') ? 'StringProc' : exitCommand;
            exitsHTML += `
                <a href="#/room/${exitRoomId}" class="exit-item exit-item-compact">
                    <span class="exit-command">${escapeHtml(displayCommand)}</span>
                    <span class="exit-arrow">&rarr;</span>
                    <span class="exit-id">${exitRoomId}</span>
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
                    <strong>Obvious paths:</strong> ${escapeHtml(paths)}
                </div>
                ${room.tags ? `
                <div class="room-tags-list" aria-label="Room tags">
                    ${room.tags.map(tag => `<span class="tag-badge">${escapeHtml(tag)}</span>`).join('')}
                </div>
                ` : ''}
            </div>
            
            <div class="exits-section">
                <h3 class="exits-heading">EXITS</h3>
                <div class="exits-grid">
                    ${exitsHTML}
                </div>
            </div>
        </section>
    `;
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
                    <a href="#/room/${nearbyRoom.id}" aria-label="Navigate to ${escapeHtml(nearbyRoom.title[0])}, room ID ${nearbyRoom.id}">
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
                if (!tag.startsWith('meta:')) {
                    tags.add(tag);
                }
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
    
    const searchLink = document.getElementById('search_link');
    if (searchLink) {
        searchLink.addEventListener('click', (e) => {
            e.preventDefault();
            const searchSection = document.getElementById('search_section');
            if (searchSection) {
                searchSection.scrollIntoView({ behavior: 'smooth' });
                const searchInput = searchSection.querySelector('input');
                if (searchInput) searchInput.focus();
            }
        });
    }
    
    const copyLinkBtn = document.getElementById('copy_link_btn');
    if (copyLinkBtn) {
        copyLinkBtn.addEventListener('click', () => copyRoomLink(room));
    }
    
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleKeydown);
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
    
    const existingHighlights = document.querySelectorAll('.tag_highlight_box, .location_highlight_box, .both_highlight_box');
    existingHighlights.forEach(box => box.remove());
    
    if (!selectedTag && !selectedLocation) {
        announceToScreenReader('Room highlights cleared');
        return;
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
                } else if (hasTag) {
                    highlightBox.className = 'tag_highlight_box';
                } else {
                    highlightBox.className = 'location_highlight_box';
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
    
    let announcement = '';
    if (selectedTag && selectedLocation) {
        announcement = `Highlighted rooms with tag "${selectedTag}" in location "${selectedLocation}"`;
    } else if (selectedTag) {
        announcement = `Highlighted rooms with tag "${selectedTag}"`;
    } else if (selectedLocation) {
        announcement = `Highlighted rooms in location "${selectedLocation}"`;
    }
    announceToScreenReader(announcement);
}

function handleMapClick(event) {
    const wrapper = document.getElementById('image_wrapper');
    const rect = wrapper.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;
    
    const imgElement = document.getElementById('mapimage');
    const origWidth = imgElement.naturalWidth;
    const origHeight = imgElement.naturalHeight;
    const renderedWidth = imgElement.clientWidth;
    const renderedHeight = imgElement.clientHeight;
    
    const widthRatio = renderedWidth / origWidth;
    const heightRatio = renderedHeight / origHeight;
    
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
            
            const imageWrapper = document.getElementById('image_wrapper');
            const wrapperStyle = window.getComputedStyle(imageWrapper);
            const paddingLeft = parseFloat(wrapperStyle.paddingLeft);
            const paddingTop = parseFloat(wrapperStyle.paddingTop);
            
            const roomLeft = originalX - widthAdjustment + paddingLeft;
            const roomTop = originalY - heightAdjustment + paddingTop;
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
