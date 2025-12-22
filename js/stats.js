// Trail Stats Module - Fetches stats from Cloudflare Worker
(function() {
    'use strict';

    // Configuration
    const StatsConfig = {
        workerUrl: (typeof Utils !== 'undefined' && Utils.getConfig) 
            ? Utils.getConfig('workerUrl', 'https://where-is-al.matthew-declercq.workers.dev/')
            : 'https://where-is-al.matthew-declercq.workers.dev/',
        refreshInterval: (typeof Utils !== 'undefined' && Utils.getConfig) 
            ? Utils.getConfig('refreshIntervals.stats', 3600000)
            : 3600000,
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
        'longestDayMiles': 'longest-day-miles'
    };

    // Store stats globally for use in updateStatElement
    let currentStats = null;

    /**
     * Update a single stat value in the DOM
     */
    function updateStatElement(key, value) {
        const elementId = statElements[key];
        if (!elementId) return;

        const element = document.getElementById(elementId);
        if (element) {
            // Special formatting for longest day (show miles and date)
            if (key === 'longestDayMiles' && currentStats && currentStats.longestDayDate) {
                element.textContent = `${value} mi (${currentStats.longestDayDate})`;
            } else {
                element.textContent = value;
            }
            
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
        // Unregister visibility handler if Utils is available
        if (typeof Utils !== 'undefined' && Utils.VisibilityManager) {
            Utils.VisibilityManager.unregister(handleVisibilityChange);
        }
    }

    // Initialize when DOM is ready
    (function init() {
        if (typeof Utils !== 'undefined' && Utils.ready) {
            Utils.ready(initializeStats);
        } else if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeStats);
        } else {
            initializeStats();
        }
    })();

    // Register visibility change handler with shared manager if available
    if (typeof Utils !== 'undefined' && Utils.VisibilityManager) {
        Utils.VisibilityManager.register(handleVisibilityChange);
    } else {
        // Fallback to direct listener only if Utils is not available
        document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    // Cleanup on page unload
    window.addEventListener('beforeunload', cleanup);

    // Export for manual use if needed
    window.StatsManager = {
        refresh: fetchStats,
        initialize: initializeStats,
        config: StatsConfig
    };
})();
