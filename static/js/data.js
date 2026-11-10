const DB_NAME = 'lich-mapdb';
const DB_VERSION = 1;
const STORE_NAME = 'rooms';
const META_STORE = 'meta';

let db = null;
let roomData = [];
let roomById = {};
let roomByUid = {};
let allTags = [];
let mapCategories = [];
let updatedAtValue = '';

// onProgress(message, detail): message is always a short status string. While the room
// data downloads, detail is also passed as { received, total, hadCache }; total is 0 when
// the size is unknown. Cached loads never send a detail, so they show no download UI.
export async function initData(onProgress) {
    onProgress?.('Checking cache...');
    
    // A retry after a failed load starts from a fresh connection
    if (db) {
        db.close();
        db = null;
    }
    db = await openDatabase();
    
    const cachedMeta = await getMeta('updated_at');
    const serverUpdatedAt = await fetchUpdatedAt();
    
    if (cachedMeta && cachedMeta === serverUpdatedAt) {
        onProgress?.('Loading from cache...');
        roomData = await loadFromCache();
        updatedAtValue = cachedMeta;
    } else {
        onProgress?.('Downloading room data...');
        roomData = await fetchRoomData(onProgress, Boolean(cachedMeta));
        onProgress?.('Caching data...');
        try {
            await saveToCache(roomData, serverUpdatedAt);
        } catch (error) {
            if (error?.name === 'QuotaExceededError') {
                console.warn('IndexedDB quota exceeded, continuing without cache');
            } else {
                console.warn('Failed to cache data:', error);
            }
        }
        updatedAtValue = serverUpdatedAt || '';
    }
    
    onProgress?.('Building indices...');
    buildIndices();
    
    return { roomCount: roomData.length };
}

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains(META_STORE)) {
                database.createObjectStore(META_STORE, { keyPath: 'key' });
            }
        };
    });
}

async function fetchUpdatedAt() {
    try {
        const response = await fetch('data/updated_at', { cache: 'no-store' });
        return (await response.text()).trim();
    } catch {
        return null;
    }
}

// Downloads map.json, reporting progress as the bytes arrive. Parsing is unchanged: the
// chunks are handed to the same Response.json() path. Without streaming support it
// falls back to a plain response.json().
async function fetchRoomData(onProgress, hadCache) {
    const response = await fetch('data/map.json');
    if (!response.ok) {
        throw new Error(`Could not download room data (HTTP ${response.status})`);
    }
    
    let reader = null;
    try {
        reader = response.body?.getReader?.() ?? null;
    } catch {
        reader = null;
    }
    if (!reader) {
        return await response.json();
    }
    
    // Content-Length counts the compressed bytes, but the stream delivers decoded bytes,
    // so for compressed responses the length can't be used for a percentage
    const encoding = (response.headers.get('content-encoding') || '').toLowerCase();
    const isCompressed = encoding !== '' && encoding !== 'identity';
    const contentLength = Number(response.headers.get('content-length'));
    const total = !isCompressed && Number.isFinite(contentLength) && contentLength > 0 ? contentLength : 0;
    
    const chunks = [];
    let received = 0;
    let lastReport = 0;
    
    const report = (force) => {
        const now = performance.now();
        if (!force && now - lastReport < 100) return;
        lastReport = now;
        onProgress?.('Downloading room data...', { received, total, hadCache });
    };
    
    report(true);
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        report(false);
    }
    report(true);
    
    // Parsing 40+ MB of JSON blocks the page, so let the status text paint first
    onProgress?.('Processing room data...');
    await new Promise(resolve => setTimeout(resolve, 50));
    
    return await new Response(new Blob(chunks)).json();
}

async function getMeta(key) {
    return new Promise((resolve) => {
        const tx = db.transaction(META_STORE, 'readonly');
        const store = tx.objectStore(META_STORE);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result?.value);
        request.onerror = () => resolve(null);
    });
}

async function loadFromCache() {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveToCache(data, updatedAt) {
    const tx = db.transaction([STORE_NAME, META_STORE], 'readwrite');
    const roomStore = tx.objectStore(STORE_NAME);
    const metaStore = tx.objectStore(META_STORE);
    
    await new Promise((resolve) => {
        roomStore.clear().onsuccess = resolve;
    });
    
    for (const room of data) {
        roomStore.put(room);
    }
    
    metaStore.put({ key: 'updated_at', value: updatedAt });
    
    return new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

function buildIndices() {
    roomById = {};
    roomByUid = {};
    const tagsSet = new Set();
    const mapsData = {};
    
    for (const room of roomData) {
        roomById[room.id] = room;
        
        if (room.uid && Array.isArray(room.uid)) {
            for (const uid of room.uid) {
                roomByUid[`u${uid}`] = room;
            }
        }
        
        if (room.tags) {
            room.tags.forEach(tag => tagsSet.add(tag));
        }
        
        if (room.image && room.image_coords) {
            if (!mapsData[room.image]) {
                mapsData[room.image] = {
                    image: room.image,
                    roomId: room.id,
                    displayName: room.image,
                    category: 'Other'
                };
            }
            
            if (room.tags) {
                for (const tag of room.tags) {
                    if (tag.startsWith('meta:mapname:')) {
                        mapsData[room.image].displayName = tag.replace('meta:mapname:', '');
                        mapsData[room.image].roomId = room.id;
                    } else if (tag.startsWith('meta:mapcategory:')) {
                        mapsData[room.image].category = tag.replace('meta:mapcategory:', '');
                    }
                }
            }
        }
    }
    
    allTags = Array.from(tagsSet).sort();
    
    const categorized = {};
    for (const mapData of Object.values(mapsData)) {
        if (!categorized[mapData.category]) {
            categorized[mapData.category] = [];
        }
        categorized[mapData.category].push([mapData.displayName, mapData.roomId]);
    }
    
    mapCategories = Object.keys(categorized)
        .sort()
        .map(cat => [cat, categorized[cat].sort((a, b) => a[0].localeCompare(b[0]))]);
}

export function getRoomById(id) {
    const numericId = parseInt(id);
    if (!isNaN(numericId)) {
        return roomById[numericId] || null;
    }
    return roomByUid[id] || null;
}

export function getAllRooms() {
    return roomData;
}

export function getAllTags() {
    return allTags;
}

export function getMapCategories() {
    return mapCategories;
}

export function getRoomsOnMap(imageName) {
    return roomData.filter(r => r.image === imageName && r.image_coords);
}

export function getUpdatedAt() {
    return updatedAtValue;
}

export async function checkForUpdates() {
    try {
        const serverUpdatedAt = await fetchUpdatedAt();
        if (!serverUpdatedAt) {
            return { hasUpdate: false };
        }
        
        if (updatedAtValue !== serverUpdatedAt) {
            return {
                hasUpdate: true,
                cachedVersion: updatedAtValue,
                serverVersion: serverUpdatedAt
            };
        }
        return { hasUpdate: false };
    } catch {
        return { hasUpdate: false };
    }
}
