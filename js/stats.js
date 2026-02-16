// Trail Stats Module - Fetches stats from Cloudflare Worker
(function() {
    'use strict';

    // Configuration
    const StatsConfig = {
        workerUrl: Utils.getConfig('workerUrl', 'https://where-is-al.matthew-declercq.workers.dev/'),
        refreshInterval: Utils.getConfig('refreshIntervals.stats', 3600000),
        enableAutoRefresh: true
    };

    // Module state
    const state = {
        refreshIntervalId: null,
        isLoading: false,
        errorCount: 0,
        backoffDelay: 0
    };

    // Stat element IDs mapping
    const statElements = {
        'totalMilesCompleted': 'total-miles',
        'milesRemaining': 'miles-remaining',
        'dailyDistance': 'daily-distance',
        'averageSpeed': 'avg-speed',
        'currentDayOnTrail': 'current-day',
        'estimatedFinishDate': 'est-finish',
        'startDate': 'start-date',
        'longestDayMiles': 'longest-day-miles',
        'mostElevationGainFeet': 'most-elevation-gain-feet'
    };

    // Store stats globally for use in updateStatElement
    let currentStats = null;

    /**
     * Format stat value with optional date suffix
     * @param {string} key - Stat key
     * @param {string} value - Stat value
     * @param {Object} stats - Stats object containing date fields
     * @returns {string} Formatted stat value
     */
    function formatStatWithDate(key, value, stats) {
        // Map of stat keys to their date field and unit
        const dateFormatMap = {
            'longestDayMiles': { dateField: 'longestDayDate', unit: 'mi' },
            'mostElevationGainFeet': { dateField: 'mostElevationGainDate', unit: 'ft' }
        };
        
        const format = dateFormatMap[key];
        if (format && stats && stats[format.dateField]) {
            return `${value} ${format.unit} (${stats[format.dateField]})`;
        }
        return value;
    }

    /**
     * Update a single stat value in the DOM
     */
    function updateStatElement(key, value) {
        const elementId = statElements[key];
        if (!elementId) return;

        const element = document.getElementById(elementId);
        if (element) {
            // Format value with date if applicable
            element.textContent = formatStatWithDate(key, value, currentStats);
            
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
    function updateStatsDisplay(statsData) {
        if (!statsData || typeof statsData !== 'object') {
            console.error('[Stats] Invalid stats data received:', statsData);
            return;
        }

        // Store stats globally for use in updateStatElement
        currentStats = statsData;

        // Update each stat element
        Object.keys(statElements).forEach(key => {
            if (statsData[key] !== undefined) {
                updateStatElement(key, statsData[key]);
            }
        });
    }

    /**
     * Show error message in stat cards
     */
    function showStatsError(message) {
        console.error('[Stats] Error:', message);
        
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
        if (!StatsConfig.workerUrl) {
            console.warn('[Stats] Cloudflare Worker URL not configured. Update StatsConfig.workerUrl in js/stats.js');
            return;
        }

        await window.ApiClient.fetch(
            StatsConfig.workerUrl,
            { method: 'GET' },
            {
                onSuccess: (stats) => {
                    updateStatsDisplay(stats);
                },
                onError: (error) => {
                    showStatsError(error.message);
                }
            },
            state
        );
    }

    /**
     * Setup automatic refresh
     */
    function setupAutoRefresh() {
        if (StatsConfig.enableAutoRefresh) {
            window.ApiClient.setupAutoRefresh(fetchStats, StatsConfig.refreshInterval, state);
        }
    }

    /**
     * Handle page visibility changes
     */
    function handleVisibilityChange() {
        window.ApiClient.handleVisibilityChange(fetchStats, setupAutoRefresh, state);
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
        window.ApiClient.cleanup(state);
        Utils.VisibilityManager.unregister(handleVisibilityChange);
    }

    // Initialize when DOM is ready
    Utils.ready(initializeStats);

    // Register visibility change handler
    Utils.VisibilityManager.register(handleVisibilityChange);

    // Cleanup on page unload
    window.addEventListener('beforeunload', cleanup);
})();
