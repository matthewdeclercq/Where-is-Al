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

    /**
     * Get config value with fallback
     * @param {string} path - Dot-separated path to config value (e.g., 'refreshIntervals.weather')
     * @param {*} defaultValue - Default value if config doesn't exist
     * @returns {*} Config value or default
     */
    function getConfig(path, defaultValue) {
        if (!window.Config) {
            return defaultValue;
        }
        const parts = path.split('.');
        let value = window.Config;
        for (const part of parts) {
            if (value && typeof value === 'object' && part in value) {
                value = value[part];
            } else {
                return defaultValue;
            }
        }
        return value !== undefined ? value : defaultValue;
    }

    /**
     * Check if current device is mobile (viewport width <= 480px)
     * @returns {boolean} True if mobile device
     */
    function isMobile() {
        return window.innerWidth <= 480;
    }

    /**
     * Shared visibility change handler registry
     */
    const VisibilityManager = {
        handlers: [],
        
        /**
         * Register a visibility change handler
         * @param {Function} handler - Function to call on visibility change
         */
        register: function(handler) {
            if (typeof handler === 'function' && !this.handlers.includes(handler)) {
                this.handlers.push(handler);
            }
        },
        
        /**
         * Unregister a visibility change handler
         * @param {Function} handler - Function to remove
         */
        unregister: function(handler) {
            const index = this.handlers.indexOf(handler);
            if (index > -1) {
                this.handlers.splice(index, 1);
            }
        },
        
        /**
         * Handle visibility change event
         */
        handleChange: function() {
            this.handlers.forEach(handler => {
                try {
                    handler();
                } catch (error) {
                    console.error('[VisibilityManager] Error in handler:', error);
                }
            });
        }
    };

    // Initialize visibility change listener
    document.addEventListener('visibilitychange', () => {
        VisibilityManager.handleChange();
    });

    // Export utilities to global scope
    window.Utils = {
        Storage: Storage,
        ready: ready,
        getConfig: getConfig,
        VisibilityManager: VisibilityManager,
        isMobile: isMobile
    };
})();
