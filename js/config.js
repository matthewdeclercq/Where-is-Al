// Centralized Configuration for Where Is Al
(function() {
    'use strict';

    // Auto-detect local development
    const isLocalDev = window.location.hostname === 'localhost'
                    || window.location.hostname === '127.0.0.1';

    // Worker API Configuration
    const Config = {
        // Cloudflare Worker URL (auto-switches to local wrangler dev server)
        workerUrl: isLocalDev
            ? 'http://localhost:8788/'
            : 'https://where-is-al.matthew-declercq.workers.dev/',
        
        // Refresh intervals (in milliseconds)
        refreshIntervals: {
            stats: 3600000,      // 1 hour
            weather: 3600000,    // 1 hour
            map: 1800000         // 30 minutes
        },
        
        // Backoff configuration
        backoff: {
            maxDelay: 300000,    // 5 minutes max backoff
            initialDelay: 1000   // 1 second initial delay
        },
        
        // Authentication
        auth: {
            maxAttempts: 5,
            lockoutTime: 15 * 60 * 1000  // 15 minutes
        },
        
        // Request timeout configuration
        requestTimeout: 30000   // 30 seconds timeout for API requests
    };

    // Export to global scope
    window.Config = Config;
})();

