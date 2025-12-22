// Shared utilities for Where Is Al
(function() {
    'use strict';

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
     * Create a debounced function that delays execution until after wait time has passed
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds (default: 200)
     * @returns {Function} Debounced function
     */
    function debounce(func, wait = 200) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
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
        ready: ready,
        getConfig: getConfig,
        VisibilityManager: VisibilityManager,
        isMobile: isMobile,
        debounce: debounce
    };
})();
