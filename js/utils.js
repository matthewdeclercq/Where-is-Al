// Shared utilities for Where Is Al
(function() {
    'use strict';

    /**
     * Storage utilities with error handling
     */
    const Storage = {
        get: function(key, defaultValue = null) {
            try {
                const item = localStorage.getItem(key);
                return item !== null ? item : defaultValue;
            } catch {
                return defaultValue;
            }
        },

        set: function(key, value) {
            try {
                localStorage.setItem(key, value.toString());
                return true;
            } catch {
                return false;
            }
        }
    };

    /**
     * Execute callback when DOM is ready
     */
    function ready(callback) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback);
        } else {
            callback();
        }
    }

    // Export utilities to global scope
    window.Utils = {
        Storage: Storage,
        ready: ready
    };
})();
