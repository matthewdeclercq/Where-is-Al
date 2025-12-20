// Trail Stats Module - Fetches stats from Cloudflare Worker
(function() {
    'use strict';

    // Configuration
    const StatsConfig = {
        workerUrl: 'https://where-is-al.matthew-declercq.workers.dev/',
        
        // Refresh interval in milliseconds (default: 1 hour)
        refreshInterval: 3600000,
        
        // Enable/disable automatic stats refresh
        enableAutoRefresh: true
    };

    let refreshIntervalId = null;
    let isLoading = false;

    // Stat element IDs mapping
    const statElements = {
        'totalMilesCompleted': 'total-miles',
        'milesRemaining': 'miles-remaining',
        'dailyDistance': 'daily-distance',
        'averageSpeed': 'avg-speed',
        'currentDayOnTrail': 'current-day',
        'estimatedFinishDate': 'est-finish',
        'startDate': 'start-date'
    };

    /**
     * Update a single stat value in the DOM
     */
    function updateStatElement(key, value) {
        const elementId = statElements[key];
        if (!elementId) return;

        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
            
            // Hide placeholder text in the same stat card
            const statCard = element.closest('.stat-card');
            if (statCard) {
                const placeholder = statCard.querySelector('.stat-placeholder');
                if (placeholder) {
                    placeholder.style.display = 'none';
                }
            }
        }
    }

    /**
     * Update all stat values from the stats object
     */
    function updateStatsDisplay(stats) {
        if (!stats || typeof stats !== 'object') {
            console.error('Invalid stats data received');
            return;
        }

        // Update each stat element
        Object.keys(statElements).forEach(key => {
            if (stats[key] !== undefined) {
                updateStatElement(key, stats[key]);
            }
        });
    }

    /**
     * Show error message in stat cards
     */
    function showStatsError(message) {
        console.error('Stats error:', message);
        
        // Show error in first stat card as example
        const firstStatCard = document.querySelector('.stat-card');
        if (firstStatCard) {
            const placeholder = firstStatCard.querySelector('.stat-placeholder');
            if (placeholder) {
                placeholder.textContent = 'Unable to load stats. Please try again later.';
                placeholder.style.display = 'block';
            }
        }
    }

    /**
     * Fetch stats from Cloudflare Worker
     */
    async function fetchStats() {
        if (isLoading) {
            return; // Prevent concurrent requests
        }

        if (!StatsConfig.workerUrl || StatsConfig.workerUrl.includes('your-worker')) {
            console.warn('Cloudflare Worker URL not configured. Update StatsConfig.workerUrl in js/stats.js');
            return;
        }

        isLoading = true;

        try {
            const response = await fetch(StatsConfig.workerUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const stats = await response.json();

            // Check for error in response
            if (stats.error) {
                throw new Error(stats.error);
            }

            // Update the display
            updateStatsDisplay(stats);
            
        } catch (error) {
            showStatsError(error.message);
        } finally {
            isLoading = false;
        }
    }

    /**
     * Setup automatic refresh
     */
    function setupAutoRefresh() {
        if (refreshIntervalId) {
            clearInterval(refreshIntervalId);
        }

        if (StatsConfig.enableAutoRefresh && StatsConfig.refreshInterval > 0) {
            refreshIntervalId = setInterval(fetchStats, StatsConfig.refreshInterval);
        }
    }

    /**
     * Initialize stats module
     */
    function initializeStats() {
        // Fetch stats immediately on page load
        fetchStats();

        // Setup automatic refresh
        if (StatsConfig.enableAutoRefresh) {
            setupAutoRefresh();
        }
    }

    /**
     * Cleanup on page unload
     */
    function cleanup() {
        if (refreshIntervalId) {
            clearInterval(refreshIntervalId);
            refreshIntervalId = null;
        }
    }

    // Initialize when DOM is ready
    Utils.ready(initializeStats);

    // Cleanup on page unload
    window.addEventListener('beforeunload', cleanup);

    // Export for manual use if needed
    window.StatsManager = {
        refresh: fetchStats,
        initialize: initializeStats,
        config: StatsConfig
    };
})();
