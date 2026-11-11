import { getAllRooms, getAllTags, getRoomsByImage, getMapDisplayName } from './data.js';
import { announceToScreenReader } from './utils.js';

const MAX_TAG_SUGGESTIONS = 50;
const DEFAULT_OPTION_ID_PREFIX = 'tag-option';

// Number of rooms carrying each tag, built once on first use (and rebuilt if the data is reloaded)
let tagRoomCounts = null;
let tagRoomCountsSource = null;

function getTagRoomCounts() {
    const rooms = getAllRooms();
    if (!tagRoomCounts || tagRoomCountsSource !== rooms) {
        tagRoomCountsSource = rooms;
        tagRoomCounts = new Map();
        for (const room of rooms) {
            if (!room.tags) continue;
            for (const tag of room.tags) {
                tagRoomCounts.set(tag, (tagRoomCounts.get(tag) || 0) + 1);
            }
        }
    }
    return tagRoomCounts;
}

// Appends text to a node with the first occurrence of the query wrapped in <strong>.
// Built from DOM nodes (textContent), so tag text is never parsed as HTML.
function appendHighlightedText(parent, text, query) {
    const q = query.trim().toLowerCase();
    const start = q ? text.toLowerCase().indexOf(q) : -1;
    
    if (start === -1) {
        parent.appendChild(document.createTextNode(text));
        return;
    }
    
    const end = start + q.length;
    const strong = document.createElement('strong');
    strong.className = 'suggestion-match';
    strong.textContent = text.slice(start, end);
    
    parent.appendChild(document.createTextNode(text.slice(0, start)));
    parent.appendChild(strong);
    parent.appendChild(document.createTextNode(text.slice(end)));
}

/**
 * Wires a tag autocomplete + cascading map/location search onto existing markup.
 * The markup (inputs, list, selects, button, form) is owned by the caller; this module
 * only finds the elements by the ids in `config` and attaches behavior.
 *
 * @param {object} config
 * @param {string} config.tagInputId - Tag text input (role="combobox")
 * @param {string} config.suggestionsId - Suggestions <ul role="listbox">
 * @param {string} config.imageSelectId - Map <select>
 * @param {string} config.locationSelectId - Location <select>
 * @param {string} config.submitButtonId - Submit button (enabled once a map is chosen)
 * @param {string} config.formId - The form element
 * @param {string} [config.optionIdPrefix] - Prefix for suggestion option ids (must be unique per page)
 * @param {(tag: string, image: string, location: string) => void} config.onSubmit
 *        Called when the form is submitted with a tag and a map; location may be ''.
 * @returns {boolean} true if the elements were found and wired up
 */
export function initTagSearch(config) {
    const {
        tagInputId,
        suggestionsId,
        imageSelectId,
        locationSelectId,
        submitButtonId,
        formId,
        optionIdPrefix = DEFAULT_OPTION_ID_PREFIX,
        onSubmit
    } = config;
    
    const tagInput = document.getElementById(tagInputId);
    const tagSuggestions = document.getElementById(suggestionsId);
    const imageSelect = document.getElementById(imageSelectId);
    const locationSelect = document.getElementById(locationSelectId);
    const submitButton = document.getElementById(submitButtonId);
    const form = document.getElementById(formId);
    
    if (!tagInput || !tagSuggestions || !imageSelect || !locationSelect || !submitButton) return false;
    
    // Placeholder wording differs per page, so take it from the markup rather than hardcoding it
    const imagePlaceholder = imageSelect.options[0]?.textContent || 'Map...';
    const locationPlaceholder = locationSelect.options[0]?.textContent || 'Location (optional)...';
    
    const allTags = getAllTags();
    let selectedIndex = -1;
    let resolvedTag = '';
    
    // Build the per-tag room counts while the browser is idle, not on the first keystroke
    setTimeout(getTagRoomCounts, 0);
    
    // Exact matches first, then prefix matches, then substring matches.
    // meta: tags are internal bookkeeping, so they only appear when the user types "meta".
    function rankTagSuggestions(query) {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        
        const includeMeta = q.startsWith('meta');
        const exact = [];
        const prefix = [];
        const substring = [];
        
        for (const tag of allTags) {
            if (!includeMeta && tag.startsWith('meta:')) continue;
            const lower = tag.toLowerCase();
            if (lower === q) {
                exact.push(tag);
            } else if (lower.startsWith(q)) {
                prefix.push(tag);
            } else if (lower.includes(q)) {
                substring.push(tag);
            }
        }
        
        return [...exact, ...prefix, ...substring];
    }
    
    function showSuggestions(tags, query) {
        tagSuggestions.innerHTML = '';
        tagInput.removeAttribute('aria-activedescendant');
        
        const counts = getTagRoomCounts();
        
        tags.slice(0, MAX_TAG_SUGGESTIONS).forEach((tag, index) => {
            const li = document.createElement('li');
            li.className = 'suggestion-item';
            li.dataset.tag = tag;
            li.setAttribute('role', 'option');
            li.setAttribute('id', `${optionIdPrefix}-${index}`);
            li.setAttribute('aria-selected', 'false');
            
            const text = document.createElement('span');
            text.className = 'suggestion-text';
            appendHighlightedText(text, tag, query);
            
            const roomCount = counts.get(tag) || 0;
            const count = document.createElement('span');
            count.className = 'suggestion-count';
            count.textContent = `${roomCount.toLocaleString()} ${roomCount === 1 ? 'room' : 'rooms'}`;
            
            li.appendChild(text);
            li.appendChild(count);
            
            // Keep focus in the input while clicking, so the blur handler doesn't race the click
            li.addEventListener('mousedown', (e) => {
                e.preventDefault();
            });
            li.addEventListener('click', (e) => {
                e.preventDefault();
                selectTag(tag);
            });
            
            tagSuggestions.appendChild(li);
        });
        
        tagSuggestions.classList.add('visible');
        tagInput.setAttribute('aria-expanded', 'true');
        announceToScreenReader(tags.length > MAX_TAG_SUGGESTIONS
            ? `${tags.length} suggestions available, showing the first ${MAX_TAG_SUGGESTIONS}`
            : `${tags.length} suggestions available`);
    }
    
    function hideSuggestions() {
        tagSuggestions.classList.remove('visible');
        tagInput.setAttribute('aria-expanded', 'false');
        tagInput.removeAttribute('aria-activedescendant');
    }
    
    function updateHighlight(items) {
        items.forEach((item, index) => {
            if (index === selectedIndex) {
                item.classList.add('selected');
                item.setAttribute('aria-selected', 'true');
                tagInput.setAttribute('aria-activedescendant', item.id);
            } else {
                item.classList.remove('selected');
                item.setAttribute('aria-selected', 'false');
            }
        });
        
        if (selectedIndex === -1) {
            tagInput.removeAttribute('aria-activedescendant');
        }
    }
    
    // Commits a tag: fills the input, closes the list and loads the dependent selects
    function applyTag(tag) {
        tagInput.value = tag;
        resolvedTag = tag;
        hideSuggestions();
        announceToScreenReader(`Selected tag: ${tag}. Loading available maps.`);
        loadImagesForTag(tag);
    }
    
    function selectTag(tag) {
        applyTag(tag);
        tagInput.focus();
    }
    
    // If the typed text is exactly a known tag (ignoring case), commit it without
    // needing a click on a suggestion. Returns true when a tag is committed.
    function resolveExactTag() {
        const typed = tagInput.value.trim().toLowerCase();
        if (!typed) return false;
        
        const match = allTags.find(tag => tag.toLowerCase() === typed);
        if (!match) return false;
        if (match === resolvedTag) return true;
        
        applyTag(match);
        return true;
    }
    
    function resetLocationSelect() {
        locationSelect.innerHTML = '';
        const option = document.createElement('option');
        option.value = '';
        option.textContent = locationPlaceholder;
        locationSelect.appendChild(option);
        locationSelect.disabled = true;
    }
    
    function resetDropdowns() {
        imageSelect.innerHTML = '';
        const option = document.createElement('option');
        option.value = '';
        option.textContent = imagePlaceholder;
        imageSelect.appendChild(option);
        imageSelect.disabled = true;
        resetLocationSelect();
        submitButton.disabled = true;
    }
    
    function loadImagesForTag(tag) {
        const imagesWithTag = {};
        
        for (const room of getAllRooms()) {
            if (room.tags?.includes(tag) && room.image) {
                if (!imagesWithTag[room.image]) {
                    imagesWithTag[room.image] = { filename: room.image, display_name: getMapDisplayName(room.image) };
                }
            }
        }
        
        const images = Object.values(imagesWithTag).sort((a, b) =>
            a.display_name.localeCompare(b.display_name)
        );
        
        imageSelect.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = imagePlaceholder;
        imageSelect.appendChild(placeholder);
        images.forEach(imageData => {
            const option = document.createElement('option');
            option.value = imageData.filename;
            option.textContent = imageData.display_name;
            imageSelect.appendChild(option);
        });
        imageSelect.disabled = false;
        
        if (images.length === 1) {
            // Only one choice, so make it for the user; the change handler loads the locations
            imageSelect.value = images[0].filename;
            imageSelect.dispatchEvent(new Event('change'));
            announceToScreenReader(`Tag "${tag}" is only on ${images[0].display_name}. That map is selected.`);
        } else if (images.length > 0) {
            announceToScreenReader(`Found ${images.length} maps containing tag "${tag}"`);
        } else {
            announceToScreenReader(`No maps found containing tag "${tag}"`);
        }
    }
    
    function loadLocationsForTagAndImage(tag, image) {
        const locations = new Set();
        
        for (const room of getRoomsByImage(image)) {
            const tagMatch = !tag || room.tags?.includes(tag);
            
            if (tagMatch && room.location) {
                locations.add(room.location);
            }
        }
        
        const sortedLocations = Array.from(locations).sort();
        
        resetLocationSelect();
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
    
    tagInput.addEventListener('input', function() {
        resolvedTag = '';
        resetDropdowns();
        
        const matches = rankTagSuggestions(this.value);
        if (matches.length > 0) {
            showSuggestions(matches, this.value);
            selectedIndex = -1;
        } else {
            hideSuggestions();
        }
    });
    
    tagInput.addEventListener('keydown', function(e) {
        // Tabbing away with a full tag typed: load the maps first so the (now enabled)
        // map select is the next stop instead of being skipped while disabled
        if (e.key === 'Tab' && !e.shiftKey) {
            resolveExactTag();
        }
        
        const isVisible = tagSuggestions.classList.contains('visible');
        if (!isVisible) return;
        
        const items = tagSuggestions.querySelectorAll('.suggestion-item');
        
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
                updateHighlight(items);
                break;
            case 'ArrowUp':
                e.preventDefault();
                selectedIndex = Math.max(selectedIndex - 1, -1);
                updateHighlight(items);
                break;
            case 'Enter':
                e.preventDefault();
                // Nothing highlighted: take the first suggestion (an exact match is ranked first)
                if (items.length > 0) {
                    const target = selectedIndex >= 0 && selectedIndex < items.length
                        ? items[selectedIndex]
                        : items[0];
                    selectTag(target.dataset.tag);
                }
                break;
            case 'Escape':
                e.preventDefault();
                hideSuggestions();
                break;
        }
    });
    
    tagInput.addEventListener('blur', function() {
        setTimeout(() => {
            if (document.activeElement !== tagInput && document.activeElement !== tagSuggestions) {
                hideSuggestions();
                resolveExactTag();
            }
        }, 150);
    });
    
    imageSelect.addEventListener('change', function() {
        const selectedImage = this.value;
        
        resetLocationSelect();
        
        if (selectedImage) {
            loadLocationsForTagAndImage(tagInput.value, selectedImage);
            submitButton.disabled = false;
        } else {
            submitButton.disabled = true;
        }
    });
    
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const tag = tagInput.value;
            
            // Full tag typed but never committed: commit it now (this may auto-select the map)
            if (tag && !imageSelect.value) {
                resolveExactTag();
            }
            
            const image = imageSelect.value;
            const location = locationSelect.value;
            
            if (tag && image) {
                onSubmit(tagInput.value, image, location);
            } else if (tag && !imageSelect.disabled) {
                announceToScreenReader('Select a map to continue');
                imageSelect.focus();
            } else if (tag) {
                announceToScreenReader('Pick a tag from the suggestions first');
            }
        });
    }
    
    return true;
}
