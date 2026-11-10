import { initData, getUpdatedAt, checkForUpdates, getMapCategories } from './data.js';
import { init as initRouter, addRoute, setNotFound, handleRoute, navigate } from './router.js';
import { renderRoom } from './room.js';
import { renderSearch } from './search.js';
import { setUpdatedAt, escapeHtml, announceToScreenReader } from './utils.js';

// Last 25% step announced to screen readers during a download
let lastAnnouncedStep = 0;

function formatBytes(bytes) {
    if (bytes >= 1048576) {
        return `${(bytes / 1048576).toFixed(1)} MB`;
    }
    return `${Math.round(bytes / 1024)} KB`;
}

// Puts the loading screen back to its plain "loading" look (first run and every retry)
function resetLoadingUI() {
    lastAnnouncedStep = 0;
    
    const progress = document.getElementById('loading-progress');
    progress.hidden = false;
    progress.textContent = 'Loading room data...';
    document.getElementById('loading-spinner').hidden = false;
    
    const bar = document.getElementById('loading-bar');
    bar.hidden = true;
    bar.classList.remove('loading-bar-indeterminate');
    document.getElementById('loading-bar-fill').style.removeProperty('--progress');
    document.getElementById('loading-detail').hidden = true;
    document.getElementById('loading-note').hidden = true;
    document.getElementById('loading-error').hidden = true;
}

// Receives status messages from initData. Plain messages update the (polite) status text.
// Download details drive the visual bar; screen readers hear only coarse 25% steps.
function handleLoadProgress(message, detail) {
    const progress = document.getElementById('loading-progress');
    
    if (!detail) {
        progress.textContent = message;
        return;
    }
    
    const bar = document.getElementById('loading-bar');
    const fill = document.getElementById('loading-bar-fill');
    const detailText = document.getElementById('loading-detail');
    const note = document.getElementById('loading-note');
    
    bar.hidden = false;
    detailText.hidden = false;
    note.hidden = false;
    note.textContent = detail.hadCache
        ? 'The map data was updated, so it is downloading again. It is cached afterward.'
        : 'First visit only: the data is cached in your browser afterward.';
    
    const isDeterminate = detail.total > 0 && detail.received <= detail.total;
    bar.classList.toggle('loading-bar-indeterminate', !isDeterminate);
    
    if (isDeterminate) {
        const percent = Math.min(100, Math.floor((detail.received / detail.total) * 100));
        fill.style.setProperty('--progress', String(percent));
        detailText.textContent = `${formatBytes(detail.received)} of ${formatBytes(detail.total)} (${percent}%)`;
        
        const step = Math.floor(percent / 25) * 25;
        if (step > lastAnnouncedStep) {
            lastAnnouncedStep = step;
            progress.textContent = `${message} ${step}%`;
        }
    } else {
        fill.style.removeProperty('--progress');
        detailText.textContent = `${formatBytes(detail.received)} downloaded`;
    }
}

// Replaces the spinner with a message and a Retry button
function showLoadingError(error) {
    // Make sure the loader is visible even if the failure happened after it was dismissed
    document.getElementById('loading-screen').classList.remove('hidden');
    document.getElementById('loading-spinner').hidden = true;
    document.getElementById('loading-progress').hidden = true;
    document.getElementById('loading-bar').hidden = true;
    document.getElementById('loading-detail').hidden = true;
    document.getElementById('loading-note').hidden = true;
    
    const friendly = navigator.onLine === false
        ? 'You appear to be offline. Reconnect and try again.'
        : 'The room data could not be loaded. Check your connection and try again.';
    
    // textContent, so error text is never parsed as HTML
    document.getElementById('loading-error-message').textContent = friendly;
    document.getElementById('loading-error-detail').textContent = error?.message ? `Details: ${error.message}` : '';
    document.getElementById('loading-error').hidden = false;
    
    announceToScreenReader(friendly, true);
    document.getElementById('loading-retry').focus();
}

async function main() {
    const loadingScreen = document.getElementById('loading-screen');
    const app = document.getElementById('app');
    
    resetLoadingUI();
    
    try {
        const result = await initData(handleLoadProgress);
        
        setUpdatedAt(getUpdatedAt());
        console.log(`Loaded ${result.roomCount} rooms`);
        
        initRouter();
        
        addRoute('/room/:id', (params) => {
            renderRoom(params.id, params.query || {});
        });
        
        addRoute('/search', (params) => {
            renderSearch(params.query || {});
        });
        
        setNotFound((path) => {
            console.log('404:', path);
            const mapCategories = getMapCategories();
            let mapOptions = '<option value="">Navigate to map...</option>';
            for (const [category, maps] of mapCategories) {
                mapOptions += `<optgroup label="${escapeHtml(category)}">`;
                for (const [mapName, roomId] of maps) {
                    mapOptions += `<option value="${roomId}">${escapeHtml(mapName)}</option>`;
                }
                mapOptions += '</optgroup>';
            }
            
            app.innerHTML = `
                <a href="#main-content" class="skip-link">Skip to main content</a>
                
                <nav id="navigation" role="navigation" aria-label="Map navigation">
                    <div id="navigation_header">
                        <div id="map_navigation">
                            <select id="map_dropdown" aria-label="Select a map to navigate to">${mapOptions}</select>
                        </div>
                    </div>
                </nav>
                
                <main id="main-content" role="main" style="padding: 20px;">
                    <h1>Page Not Found</h1>
                    <p>The page <strong>${escapeHtml(path)}</strong> does not exist.</p>
                    <p style="margin-top: 15px;">
                        <a href="#/search" style="font-weight: bold;">← Go to search</a>
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
            
            document.title = 'Page Not Found - Lich Map Room Database';
        });
        
        loadingScreen.classList.add('hidden');
        app.classList.remove('hidden');
        
        handleRoute();
        
        if (!window.location.hash) {
            navigate('/search', true);
        }
        
        setTimeout(async () => {
            const updateCheck = await checkForUpdates();
            if (updateCheck.hasUpdate) {
                showUpdateBanner();
            }
        }, 5000);
        
    } catch (error) {
        console.error('Failed to initialize:', error);
        showLoadingError(error);
    }
}

function showUpdateBanner() {
    if (document.getElementById('update-banner')) return;
    
    const banner = document.createElement('div');
    banner.id = 'update-banner';
    banner.className = 'update-banner';
    banner.setAttribute('role', 'alert');
    banner.innerHTML = `
        <span>Room data has been updated. Refresh to see the latest changes.</span>
        <div class="update-banner-actions">
            <button type="button" class="update-banner-refresh">Refresh</button>
            <button type="button" class="update-banner-dismiss">Dismiss</button>
        </div>
    `;
    
    banner.querySelector('.update-banner-refresh').addEventListener('click', () => {
        location.reload();
    });
    banner.querySelector('.update-banner-dismiss').addEventListener('click', () => {
        banner.remove();
    });
    
    document.body.prepend(banner);
}

document.getElementById('loading-retry').addEventListener('click', () => {
    main();
});

main();
