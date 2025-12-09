// Main page functionality for Where Is Al
(function() {
    'use strict';

    // Map auto-refresh functionality (if needed)
    // This will be used when the Garmin map is embedded
    function refreshMap() {
        const mapIframe = document.querySelector('.map-container iframe');
        if (mapIframe) {
            // Reload iframe to refresh map data
            const src = mapIframe.src;
            mapIframe.src = '';
            setTimeout(() => {
                mapIframe.src = src;
            }, 100);
        }
    }

    // Auto-refresh map every 5 minutes (300000 ms)
    // Uncomment when Garmin map is embedded:
    // setInterval(refreshMap, 300000);

    // Future: Add functionality to populate stats and log entries
    // when data sources are connected
})();

