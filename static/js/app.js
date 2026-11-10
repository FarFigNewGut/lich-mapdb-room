import { initData, getUpdatedAt, checkForUpdates, getMapCategories } from './data.js';
import { init as initRouter, addRoute, setNotFound, handleRoute, navigate } from './router.js';
import { renderRoom } from './room.js';
import { renderSearch } from './search.js';
import { setUpdatedAt, escapeHtml } from './utils.js';

async function main() {
    const loadingScreen = document.getElementById('loading-screen');
    const loadingProgress = document.getElementById('loading-progress');
    const app = document.getElementById('app');
    
    try {
        const result = await initData((msg) => {
            loadingProgress.textContent = msg;
        });
        
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
        loadingProgress.textContent = `Error: ${error.message}`;
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

main();
