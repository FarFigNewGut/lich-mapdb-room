import { getRoomById, getRoomsOnMap, getMapCategories, getAllRooms } from './data.js';
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
        
        <nav id="navigation" role="navigation" aria-label="Map navigation">
            <div id="navigation_header">
                <div id="map_navigation">
                    ${buildMapDropdown(mapCategories)}
                    ${adjacentMaps.length ? buildAdjacentMapDropdown(adjacentMaps) : ''}
                    <a href="#search_section" id="search_link">Search...</a>
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
        
        ${room.image ? buildHelpPopup() : ''}
        ${room.image ? buildMapSection(room) : ''}
        
        <main id="main-content" role="main">
            <div id="after_image">
                ${buildRoomInfoSection(room)}
                <div class="collapsibles-row">
                    ${room.image && sameImageRooms.length > 1 ? buildNearbyRoomsSection(room) : ''}
                    ${buildFullInfoSection(room)}
                </div>
                <section id="search_section" class="inline-search-section" aria-labelledby="search-heading">
                    <h2 id="search-heading" class="sr-only">Search Rooms</h2>
                    <form class="inline-search">
                        <input type="text" placeholder="Search for room..." aria-label="Search for room">
                        <button type="submit">Go</button>
                    </form>
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
                <img id="mapimage" src="app/static/maps/${room.image}" alt="Map of ${escapeHtml(mapAlt)} showing room ${escapeHtml(room.title[0])}. Click on rooms to navigate or use the nearby rooms list below for accessible navigation." role="img" tabindex="0">
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
            exitsHTML += `
                <a href="#/room/${exitRoomId}" class="exit-item">
                    <span class="exit-command">go ${escapeHtml(exitCommand)}</span>
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
            const locationInfo = nearbyRoom.location ? ` - Location: ${escapeHtml(nearbyRoom.location)}` : '';
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
                    <article id="nearby_rooms_article">
                        <p>The following rooms are also shown on this map and can be clicked or navigated to:</p>
                        <ul role="list" aria-label="List of nearby rooms">
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
    if (queryParams.highlight_tag || queryParams.highlight_location) {
        highlightRooms();
    }
    
    const mapImage = document.getElementById('mapimage');
    if (mapImage) {
        mapImage.addEventListener('load', () => fixHighlightBox(room));
        mapImage.addEventListener('click', handleMapClick);
        if (mapImage.complete) fixHighlightBox(room);
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

    const inlineSearchForm = document.querySelector('.inline-search');
    if (inlineSearchForm) {
        inlineSearchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const input = inlineSearchForm.querySelector('input');
            if (input.value.trim()) {
                navigate(`/search?q=${encodeURIComponent(input.value.trim())}`);
            }
        });
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
