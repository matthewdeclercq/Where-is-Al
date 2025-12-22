// Map Management Module for Garmin InReach MapShare
(function() {
    'use strict';

    // Map configuration
    const MapConfig = {
        // Set this to your Garmin MapShare URL when available
        // Example: "https://share.garmin.com/AlTrail2024"
        // Leave as null to show placeholder until MapShare is set up
        mapShareUrl: null,
        
        // Auto-refresh interval in milliseconds (30 minutes - trail location changes slowly)
        // Utils is loaded before this script, so getConfig should always be available
        refreshInterval: (typeof Utils !== 'undefined' && Utils.getConfig) 
            ? Utils.getConfig('refreshIntervals.map', 1800000)
            : 1800000,
        
        // Enable/disable automatic map refresh
        enableAutoRefresh: true
    };

    let refreshIntervalId = null;
    let mapContainer = null;
    let isPageVisible = true;

    function initializeMap() {
        mapContainer = document.querySelector('.map-container');
        
        if (!mapContainer) {
            console.warn('[Map] Map container not found');
            return;
        }

        if (!MapConfig.mapShareUrl) {
            showPlaceholder();
            return;
        }

        renderMap();
        
        if (MapConfig.enableAutoRefresh && MapConfig.refreshInterval > 0) {
            setupAutoRefresh();
        }
    }

    function renderMap() {
        mapContainer.innerHTML = '';
        
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'map-loading';
        loadingDiv.innerHTML = '<p>Loading map...</p>';
        mapContainer.appendChild(loadingDiv);

        const iframe = document.createElement('iframe');
        iframe.className = 'map-iframe';
        iframe.src = MapConfig.mapShareUrl;
        iframe.setAttribute('frameborder', '0');
        iframe.setAttribute('marginwidth', '0');
        iframe.setAttribute('marginheight', '0');
        iframe.setAttribute('allowfullscreen', '');
        iframe.setAttribute('loading', 'lazy');
        iframe.setAttribute('title', 'Garmin InReach MapShare');
        
        let iframeAppended = false;
        
        function appendIframe() {
            if (!iframeAppended) {
                iframeAppended = true;
                if (loadingDiv.parentNode) {
                    loadingDiv.remove();
                }
                if (!mapContainer.querySelector('.map-iframe')) {
                    mapContainer.appendChild(iframe);
                }
            }
        }
        
        iframe.addEventListener('load', appendIframe);

        iframe.addEventListener('error', function() {
            handleMapError('Failed to load map. Please check your MapShare URL.');
        });

        setTimeout(function() {
            appendIframe();
        }, 3000);
    }

    function showPlaceholder() {
        mapContainer.innerHTML = `
            <div class="map-placeholder">
                <p>Map will appear here once Al's Garmin inReach MapShare link is connected!</p>
                <p class="map-placeholder-subtitle">Check back soon for real-time trail updates.</p>
            </div>
        `;
    }

    function handleMapError(message) {
        mapContainer.innerHTML = `
            <div class="map-error">
                <p>${message || 'Unable to load map at this time.'}</p>
                <button class="base-button map-retry-button" onclick="window.location.reload()">Retry</button>
            </div>
        `;
    }

    function refreshMap() {
        const iframe = mapContainer ? mapContainer.querySelector('.map-iframe') : null;
        if (iframe && MapConfig.mapShareUrl) {
            const currentSrc = iframe.src;
            iframe.src = '';
            setTimeout(function() {
                iframe.src = currentSrc;
            }, 100);
        }
    }

    function setupAutoRefresh() {
        if (refreshIntervalId) {
            clearInterval(refreshIntervalId);
        }
        
        // Only set up interval if page is visible
        if (isPageVisible && MapConfig.enableAutoRefresh && MapConfig.refreshInterval > 0) {
            refreshIntervalId = setInterval(refreshMap, MapConfig.refreshInterval);
        }
    }

    function handleVisibilityChange() {
        isPageVisible = !document.hidden;
        
        if (isPageVisible) {
            // Page became visible - resume polling
            setupAutoRefresh();
            // Refresh immediately when page becomes visible
            if (mapContainer && MapConfig.mapShareUrl) {
                refreshMap();
            }
        } else {
            // Page became hidden - pause polling
            if (refreshIntervalId) {
                clearInterval(refreshIntervalId);
                refreshIntervalId = null;
            }
        }
    }

    function cleanup() {
        if (refreshIntervalId) {
            clearInterval(refreshIntervalId);
            refreshIntervalId = null;
        }
        // Unregister visibility handler if Utils is available
        if (typeof Utils !== 'undefined' && Utils.VisibilityManager) {
            Utils.VisibilityManager.unregister(handleVisibilityChange);
        }
    }

    // Initialize when DOM is ready
    (function init() {
        if (typeof Utils !== 'undefined' && Utils.ready) {
            Utils.ready(initializeMap);
        } else if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeMap);
        } else {
            initializeMap();
        }
    })();

    // Register visibility change handler with shared manager
    if (typeof Utils !== 'undefined' && Utils.VisibilityManager) {
        Utils.VisibilityManager.register(handleVisibilityChange);
    }

    // Cleanup on page unload
    window.addEventListener('beforeunload', cleanup);
})();
