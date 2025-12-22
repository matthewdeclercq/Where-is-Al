// Centralized Configuration for Where Is Al
(function() {
    'use strict';

    // Worker API Configuration
    const Config = {
        // Cloudflare Worker URL
        workerUrl: 'https://where-is-al.matthew-declercq.workers.dev/',
        
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

