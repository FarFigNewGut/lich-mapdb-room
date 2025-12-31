import { getAllRooms, getRoomById, getAllTags, getMapCategories } from './data.js';
import { navigate } from './router.js';
import { escapeHtml, announceToScreenReader, getUpdatedAt } from './utils.js';

let allTagsCache = [];

export function renderSearch(queryParams = {}) {
    const app = document.getElementById('app');
    app.innerHTML = buildSearchHTML(queryParams);
    
    requestAnimationFrame(() => {
        initSearchInteractions(queryParams);
    });
    
    document.title = 'Search - Lich Map Room Database';
    
    if (queryParams.q) {
        executeSearch(queryParams.q, queryParams.map);
    }
}

function buildSearchHTML(queryParams) {
    const mapCategories = getMapCategories();
    
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
        
        <main id="main-content" role="main" style="padding: 15px; margin-top: 0;">
            <h1 style="margin-top: 0;">Lich Map Room Database</h1>
            <p style="margin-bottom: 15px; color: #666; font-size: 14px;">
                Search by room ID, UID (u12345), tag name, or text. 
                Use advanced search for map-specific filtering.
            </p>
            
            ${buildSearchForms(queryParams)}
            
            <div id="search-results"></div>
            
            <footer id="updated_at" role="contentinfo" style="margin-top: 20px;">
                <small><i>MapDB last updated: ${escapeHtml(getUpdatedAt())}</i></small>
            </footer>
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

function buildSearchForms(queryParams) {
    const searchValue = queryParams.q || '';
    
    return `
        <div style="max-width: 600px; padding: 10px; box-sizing: border-box;">
            <form id="basicSearchForm" style="margin-bottom: 8px;" role="search" aria-label="Basic room search">
                <label for="search" style="font-size: 14px; margin-bottom: 3px; display: block; font-weight: bold;">
                    Search by: Room ID, UID (u12345), tag name, or text in room titles/descriptions
                </label>
                <input type="text" id="search" name="search" 
                       style="width: 100%; padding: 6px; margin-bottom: 4px; font-size: 14px; box-sizing: border-box;"
                       placeholder="Room Lich ID, Simu ID, or any search criteria"
                       value="${escapeHtml(searchValue)}"
                       aria-describedby="search-help">
                <div id="search-help" class="sr-only">Enter a room ID number, UID starting with u, tag name, or any text to search in room titles and descriptions</div>
                <button type="submit" style="padding: 6px 12px; font-size: 14px;" aria-label="Search rooms">Search</button>
            </form>

            <hr style="margin: 8px 0;">

            <form id="tagSearchForm" role="search" aria-label="Advanced tag and map search">
                <fieldset style="border: none; padding: 0; margin: 0;">
                    <legend style="font-size: 14px; margin-bottom: 3px; display: block; font-weight: bold;">Advanced Search by Tag and Map:</legend>

                    <div style="margin-bottom: 4px; padding-left: 0; position: relative;">
                        <label for="tagInput" class="sr-only">Tag name</label>
                        <input type="text" id="tagInput" placeholder="Start typing a tag..." autocomplete="off"
                               style="width: 100%; padding: 6px; font-size: 14px; box-sizing: border-box;"
                               aria-describedby="tag-help" aria-expanded="false" aria-autocomplete="both" role="combobox" aria-controls="tagSuggestions">
                        <div id="tag-help" class="sr-only">Start typing to see available tags. Use arrow keys to navigate suggestions, Enter to select.</div>
                        <ul id="tagSuggestions" tabindex="0" 
                            style="display: none; border: 1px solid #ccc; background: white; max-height: 150px; overflow-y: auto; position: absolute; top: calc(100% - 2px); left: 0; right: 0; z-index: 1000; font-size: 14px; margin-top: 0; list-style: none; padding: 0; margin: 0;" 
                            role="listbox" aria-label="Tag suggestions"></ul>
                    </div>

                    <div style="margin-bottom: 4px; padding-left: 0;">
                        <label for="imageSelect" class="sr-only">Map image</label>
                        <select id="imageSelect" disabled style="width: 100%; padding: 6px; font-size: 14px; box-sizing: border-box;" aria-describedby="image-help">
                            <option value="">Select a map...</option>
                        </select>
                        <div id="image-help" class="sr-only">Choose a map image that contains the selected tag</div>
                    </div>

                    <div style="margin-bottom: 4px; padding-left: 0;">
                        <label for="locationSelect" class="sr-only">Location within map</label>
                        <select id="locationSelect" disabled style="width: 100%; padding: 6px; font-size: 14px; box-sizing: border-box;" aria-describedby="location-help">
                            <option value="">Select a location (optional)...</option>
                        </select>
                        <div id="location-help" class="sr-only">Optionally narrow down to a specific location within the selected map</div>
                    </div>

                    <button type="submit" id="tagSearchButton" disabled style="padding: 6px 12px; font-size: 14px;" aria-label="Go to selected map location">Go to Map</button>
                </fieldset>
            </form>
        </div>
    `;
}

function initSearchInteractions(queryParams) {
    allTagsCache = getAllTags();
    
    const mapDropdown = document.getElementById('map_dropdown');
    if (mapDropdown) {
        mapDropdown.addEventListener('change', () => {
            const selectedRoomId = mapDropdown.value;
            if (selectedRoomId) {
                navigate(`/room/${selectedRoomId}`);
            }
        });
    }
    
    const basicSearchForm = document.getElementById('basicSearchForm');
    if (basicSearchForm) {
        basicSearchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const searchInput = document.getElementById('search');
            const searchTerm = searchInput.value.trim();
            if (searchTerm) {
                executeSearch(searchTerm, null);
            }
        });
    }
    
    initTagAutocomplete();
    initCascadingDropdowns();
}

function initTagAutocomplete() {
    const tagInput = document.getElementById('tagInput');
    const tagSuggestions = document.getElementById('tagSuggestions');
    let selectedIndex = -1;
    
    if (!tagInput || !tagSuggestions) return;
    
    tagInput.addEventListener('input', function() {
        const inputValue = this.value.toLowerCase();
        
        resetDropdowns();
        
        if (inputValue.length > 0) {
            const filteredTags = allTagsCache.filter(tag =>
                tag.toLowerCase().includes(inputValue)
            );
            
            if (filteredTags.length > 0) {
                showSuggestions(filteredTags, tagSuggestions, tagInput);
                selectedIndex = -1;
            } else {
                hideSuggestions(tagSuggestions, tagInput);
            }
        } else {
            hideSuggestions(tagSuggestions, tagInput);
        }
    });
    
    tagInput.addEventListener('keydown', function(e) {
        const isVisible = tagSuggestions.style.display === 'block';
        if (!isVisible) return;
        
        const items = tagSuggestions.querySelectorAll('.suggestion-item');
        
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
                updateHighlight(items, selectedIndex, tagInput);
                break;
            case 'ArrowUp':
                e.preventDefault();
                selectedIndex = Math.max(selectedIndex - 1, -1);
                updateHighlight(items, selectedIndex, tagInput);
                break;
            case 'Enter':
                e.preventDefault();
                if (selectedIndex >= 0 && selectedIndex < items.length) {
                    selectTag(items[selectedIndex].textContent);
                }
                break;
            case 'Escape':
                e.preventDefault();
                hideSuggestions(tagSuggestions, tagInput);
                break;
        }
    });
    
    tagInput.addEventListener('blur', function() {
        setTimeout(() => {
            if (document.activeElement !== tagInput && document.activeElement !== tagSuggestions) {
                hideSuggestions(tagSuggestions, tagInput);
            }
        }, 150);
    });
}

function showSuggestions(tags, container, input) {
    container.innerHTML = '';
    
    tags.slice(0, 50).forEach((tag, index) => {
        const li = document.createElement('li');
        li.textContent = tag;
        li.style.padding = '6px 8px';
        li.style.cursor = 'pointer';
        li.style.borderBottom = '1px solid #eee';
        li.style.color = '#333';
        li.style.backgroundColor = 'white';
        li.className = 'suggestion-item';
        li.setAttribute('role', 'option');
        li.setAttribute('id', `tag-option-${index}`);
        li.setAttribute('aria-selected', 'false');
        
        li.addEventListener('click', (e) => {
            e.preventDefault();
            selectTag(tag);
        });
        
        container.appendChild(li);
    });
    
    container.style.display = 'block';
    input.setAttribute('aria-expanded', 'true');
    announceToScreenReader(`${tags.length} suggestions available`);
}

function hideSuggestions(container, input) {
    container.style.display = 'none';
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
}

function updateHighlight(items, selectedIndex, input) {
    items.forEach((item, index) => {
        if (index === selectedIndex) {
            item.style.backgroundColor = '#0066cc';
            item.style.color = 'white';
            item.setAttribute('aria-selected', 'true');
            input.setAttribute('aria-activedescendant', item.id);
        } else {
            item.style.backgroundColor = 'white';
            item.style.color = '#333';
            item.setAttribute('aria-selected', 'false');
        }
    });
    
    if (selectedIndex === -1) {
        input.removeAttribute('aria-activedescendant');
    }
}

function selectTag(tag) {
    const tagInput = document.getElementById('tagInput');
    const tagSuggestions = document.getElementById('tagSuggestions');
    
    tagInput.value = tag;
    hideSuggestions(tagSuggestions, tagInput);
    tagInput.focus();
    announceToScreenReader(`Selected tag: ${tag}. Loading available maps.`);
    loadImagesForTag(tag);
}

function resetDropdowns() {
    const imageSelect = document.getElementById('imageSelect');
    const locationSelect = document.getElementById('locationSelect');
    const tagSearchButton = document.getElementById('tagSearchButton');
    
    imageSelect.innerHTML = '<option value="">Select a map...</option>';
    imageSelect.disabled = true;
    locationSelect.innerHTML = '<option value="">Select a location (optional)...</option>';
    locationSelect.disabled = true;
    tagSearchButton.disabled = true;
}

function initCascadingDropdowns() {
    const imageSelect = document.getElementById('imageSelect');
    const locationSelect = document.getElementById('locationSelect');
    const tagSearchButton = document.getElementById('tagSearchButton');
    const tagSearchForm = document.getElementById('tagSearchForm');
    
    if (!imageSelect) return;
    
    imageSelect.addEventListener('change', function() {
        const selectedImage = this.value;
        const tagInput = document.getElementById('tagInput');
        
        locationSelect.innerHTML = '<option value="">Select a location (optional)...</option>';
        locationSelect.disabled = true;
        
        if (selectedImage) {
            loadLocationsForTagAndImage(tagInput.value, selectedImage);
            tagSearchButton.disabled = false;
        } else {
            tagSearchButton.disabled = true;
        }
    });
    
    if (tagSearchForm) {
        tagSearchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const tagInput = document.getElementById('tagInput');
            const tag = tagInput.value;
            const image = imageSelect.value;
            const location = locationSelect.value;
            
            if (tag && image) {
                navigateToTaggedRoom(tag, image, location);
            }
        });
    }
}

function loadImagesForTag(tag) {
    const imageSelect = document.getElementById('imageSelect');
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
    
    imageSelect.innerHTML = '<option value="">Select a map...</option>';
    images.forEach(imageData => {
        const option = document.createElement('option');
        option.value = imageData.filename;
        option.textContent = imageData.display_name;
        imageSelect.appendChild(option);
    });
    imageSelect.disabled = false;
    
    if (images.length > 0) {
        announceToScreenReader(`Found ${images.length} map${images.length === 1 ? '' : 's'} containing tag "${tag}"`);
    } else {
        announceToScreenReader(`No maps found containing tag "${tag}"`);
    }
}

function loadLocationsForTagAndImage(tag, image) {
    const locationSelect = document.getElementById('locationSelect');
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
    
    locationSelect.innerHTML = '<option value="">Select a location (optional)...</option>';
    sortedLocations.forEach(location => {
        const option = document.createElement('option');
        option.value = location;
        option.textContent = location;
        locationSelect.appendChild(option);
    });
    locationSelect.disabled = false;
    
    if (sortedLocations.length > 0) {
        announceToScreenReader(`Found ${sortedLocations.length} location${sortedLocations.length === 1 ? '' : 's'} in selected map`);
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

function executeSearch(searchTerm, mapFilter) {
    const search = searchTerm.trim().toLowerCase();
    const resultsContainer = document.getElementById('search-results');
    
    const asInt = parseInt(search);
    if (!isNaN(asInt)) {
        const room = getRoomById(asInt);
        if (room) {
            navigate(`/room/${asInt}`);
            return;
        }
    }
    
    if (search.startsWith('u')) {
        const room = getRoomById(search);
        if (room) {
            navigate(`/room/${search}`);
            return;
        }
    }
    
    const allRooms = getAllRooms();
    let results = {};
    
    for (const room of allRooms) {
        if (room.tags?.includes(search)) {
            if (applyMapFilter(room, mapFilter)) {
                results[room.id] = room;
            }
        }
    }
    
    if (Object.keys(results).length === 0) {
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
        navigate(`/room/${resultIds[0]}`);
        return;
    }
    
    if (resultIds.length > 100 && !mapFilter) {
        renderMapGroups(results, search, resultsContainer);
        return;
    }
    
    renderResults(results, search, resultsContainer, mapFilter);
}

function applyMapFilter(room, mapFilter) {
    if (!mapFilter) return true;
    if (mapFilter === 'UNMAPPED') return !room.image;
    return room.image === mapFilter;
}

function renderMapGroups(results, searchTerm, container) {
    const mapGroups = {};
    let unmappedCount = 0;
    
    for (const [rid, room] of Object.entries(results)) {
        const image = room.image;
        if (image) {
            if (!mapGroups[image]) {
                mapGroups[image] = { count: 0, display_name: image, sample_room: rid };
            }
            mapGroups[image].count++;
        } else {
            unmappedCount++;
        }
    }
    
    const allRooms = getAllRooms();
    for (const room of allRooms) {
        if (room.tags && room.image && mapGroups[room.image]) {
            for (const tag of room.tags) {
                if (tag.startsWith('meta:mapname:')) {
                    mapGroups[room.image].display_name = tag.replace('meta:mapname:', '');
                    break;
                }
            }
        }
    }
    
    const sortedGroups = Object.entries(mapGroups).sort((a, b) => 
        a[1].display_name.localeCompare(b[1].display_name)
    );
    
    let html = `
        <section aria-labelledby="map-groups-heading">
            <h3 id="map-groups-heading">Too many results (${Object.keys(results).length} found) - Select a map to refine search</h3>
            <p>Your search for "<strong>${escapeHtml(searchTerm)}</strong>" returned too many results to display individually. Please select a map below to see results from that specific area:</p>
            <div class="map-groups-container" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px;">
    `;
    
    for (const [mapImage, mapData] of sortedGroups) {
        html += `
            <button type="button" class="map-group-button" 
                    data-map="${escapeHtml(mapImage)}" 
                    data-search="${escapeHtml(searchTerm)}"
                    aria-label="Search for ${escapeHtml(searchTerm)} on map ${escapeHtml(mapData.display_name)}, ${mapData.count} results"
                    style="padding: 8px 12px; cursor: pointer; border: 1px solid #ccc; background: #f5f5f5; border-radius: 4px;">
                <span class="map-name">${escapeHtml(mapData.display_name)}</span>
                <span class="map-count" style="color: #666;">(${mapData.count})</span>
            </button>
        `;
    }
    
    if (unmappedCount > 0) {
        html += `
            <button type="button" class="map-group-button unmapped-button" 
                    data-map="UNMAPPED" 
                    data-search="${escapeHtml(searchTerm)}"
                    aria-label="Search for ${escapeHtml(searchTerm)} in unmapped rooms, ${unmappedCount} results"
                    style="padding: 8px 12px; cursor: pointer; border: 1px solid #ccc; background: #f5f5f5; border-radius: 4px;">
                <span class="map-name">Unmapped Rooms</span>
                <span class="map-count" style="color: #666;">(${unmappedCount})</span>
            </button>
        `;
    }
    
    html += `
            </div>
        </section>
    `;
    
    container.innerHTML = html;
    
    container.querySelectorAll('.map-group-button').forEach(button => {
        button.addEventListener('click', () => {
            const map = button.dataset.map;
            const search = button.dataset.search;
            executeSearch(search, map);
        });
    });
    
    announceToScreenReader(`Found ${Object.keys(results).length} results across ${sortedGroups.length} maps. Select a map to refine.`);
}

function renderResults(results, searchTerm, container, mapFilter) {
    const resultIds = Object.keys(results);
    
    if (resultIds.length === 0) {
        container.innerHTML = `
            <div role="alert" aria-live="assertive">
                <h3>No rooms found</h3>
                <p>Check your search terms and try again. You can search by room ID, UID, tag name, or text in room titles and descriptions.</p>
            </div>
        `;
        announceToScreenReader('No rooms found');
        return;
    }
    
    const displayResults = resultIds.length > 100 ? resultIds.slice(0, 100) : resultIds;
    const overflow = resultIds.length > 100;
    
    let html = '';
    
    if (overflow) {
        html += `
            <div role="status" aria-live="polite">
                <h3>Large number of results</h3>
                <p>You matched ${resultIds.length} results. Only the first 100 are shown. Try narrowing your search for more specific results.</p>
            </div>
        `;
    }
    
    html += `
        <section aria-labelledby="search-results-heading">
            <h3 id="search-results-heading">Search Results (${displayResults.length}${overflow ? ' of ' + resultIds.length : ''} found)</h3>
            <ul role="list" class="search-results-list" style="list-style: none; padding: 0;">
    `;
    
    for (const rid of displayResults) {
        const room = results[rid];
        const title = room.title?.[0] || 'Unknown';
        const uid = room.uid?.[0] || 'N/A';
        const location = room.location || '';
        const mapName = room.image ? room.image.replace(/_/g, ' ').replace(/\.(png|jpg|gif)$/i, '') : '';
        
        html += `
            <li class="search-result-item" style="margin-bottom: 8px; padding: 8px; border: 1px solid #eee; border-radius: 4px;">
                <a href="#/room/${rid}" class="result-link" style="text-decoration: none; color: inherit; display: block;"
                   aria-label="Navigate to ${escapeHtml(title)}, room ID ${rid}${uid !== 'N/A' ? ', UID u' + uid : ''}${location ? ', in ' + location : ''}${mapName ? ', on map ' + mapName : ''}">
                    <span class="result-title" style="font-weight: bold; color: #0066cc;">${escapeHtml(title)}</span>
                    <span class="result-meta" style="display: block; font-size: 12px; color: #666;">
                        ID: ${rid} | UID: u${uid}${location ? ' | ' + escapeHtml(location) : ''}${mapName ? ' | ' + escapeHtml(mapName) : ''}
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
    announceToScreenReader(`Found ${resultIds.length} results`);
}
