// Shared API Client Module for Where Is Al
// Provides common fetch functionality with error handling, backoff, and visibility management
(function() {
    'use strict';

    // Shared state
    let isPageVisible = true;
    let pendingRequests = new Map(); // For request deduplication
    let pendingCallbacks = new Map(); // Store multiple callbacks per URL

    /**
     * Handle page visibility changes
     */
    function handleVisibilityChange() {
        isPageVisible = !document.hidden;
    }

    // Register visibility change handler with VisibilityManager if available
    // This avoids duplicate event listeners (VisibilityManager already has one)
    if (typeof Utils !== 'undefined' && Utils.VisibilityManager) {
        Utils.VisibilityManager.register(handleVisibilityChange);
    } else {
        // Fallback: register directly only if VisibilityManager not available
        document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    /**
     * Shared API Client
     */
    const ApiClient = {
        /**
         * Fetch data from API with authentication, error handling, and backoff
         * @param {string} url - API endpoint URL
         * @param {Object} options - Fetch options
         * @param {Object} callbacks - Callback functions
         * @param {Function} callbacks.onSuccess - Called on successful fetch
         * @param {Function} callbacks.onError - Called on error
         * @param {Object} state - Module-specific state object
         * @returns {Promise} - Fetch promise
         */
        fetch: async function(url, options, callbacks, state) {
            // Atomic check-and-set for request deduplication
            // Check for pending request first - if exists, add callbacks and return existing promise
            if (pendingRequests.has(url)) {
                const existingCallbacks = pendingCallbacks.get(url) || [];
                existingCallbacks.push(callbacks);
                pendingCallbacks.set(url, existingCallbacks);
                return pendingRequests.get(url);
            }

            // Prevent concurrent requests from same module
            if (state.isLoading) {
                return Promise.resolve();
            }

            // Don't fetch if page is hidden
            if (!isPageVisible) {
                // Still call error callback if provided
                if (callbacks && callbacks.onError) {
                    callbacks.onError(new Error('[ApiClient] Page is hidden, request skipped'));
                }
                return Promise.resolve();
            }
            
            // Create promise immediately and store it atomically to prevent race conditions
            // This ensures that concurrent requests will see the pending request
            let resolvePromise, rejectPromise;
            const fetchPromise = new Promise((resolve, reject) => {
                resolvePromise = resolve;
                rejectPromise = reject;
            });
            
            // Store promise and callbacks atomically before any async operations
            pendingRequests.set(url, fetchPromise);
            pendingCallbacks.set(url, [callbacks]);

            // Execute fetch logic asynchronously
            (async () => {
                try {
                    // Apply exponential backoff if there were recent errors
                    if (state.backoffDelay > 0) {
                        await new Promise(resolve => setTimeout(resolve, state.backoffDelay));
                    }

                    state.isLoading = true;

                    // Get auth token
                    const token = sessionStorage.getItem('auth_token');
                    if (!token) {
                        const error = new Error('[ApiClient] Not authenticated - no token found');
                        state.isLoading = false;
                        // Clean up callbacks and pending request
                        const allCallbacks = pendingCallbacks.get(url) || [callbacks];
                        pendingCallbacks.delete(url);
                        pendingRequests.delete(url);
                        // Call all error callbacks
                        allCallbacks.forEach((cb) => {
                            if (cb && cb.onError) {
                                try {
                                    cb.onError(error);
                                } catch (callbackError) {
                                    console.error('Error in onError callback:', callbackError);
                                }
                            }
                        });
                        rejectPromise(error);
                        return;
                    }
                    
                    // Check token expiry
                    const expires = sessionStorage.getItem('auth_expires');
                    if (expires && Date.now() >= parseInt(expires)) {
                        console.warn('[ApiClient] Token expired, clearing sessionStorage');
                        sessionStorage.removeItem('auth_token');
                        sessionStorage.removeItem('auth_expires');
                        const error = new Error('[ApiClient] Token expired - please re-authenticate');
                        state.isLoading = false;
                        // Clean up callbacks and pending request
                        const allCallbacks = pendingCallbacks.get(url) || [callbacks];
                        pendingCallbacks.delete(url);
                        pendingRequests.delete(url);
                        // Call all error callbacks
                        allCallbacks.forEach((cb) => {
                            if (cb && cb.onError) {
                                try {
                                    cb.onError(error);
                                } catch (callbackError) {
                                    console.error('Error in onError callback:', callbackError);
                                }
                            }
                        });
                        rejectPromise(error);
                        return;
                    }

                    // Create fetch promise with timeout
                    const timeoutMs = window.Config ? window.Config.requestTimeout : 30000;
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
                    
                    try {
                        const response = await fetch(url, {
                            ...options,
                            signal: controller.signal,
                            headers: {
                                'Accept': 'application/json',
                                'Authorization': `Bearer ${token}`,
                                ...(options.headers || {})
                            }
                        });
                        
                        clearTimeout(timeoutId);

                        if (!response.ok) {
                            throw new Error(`[ApiClient] HTTP ${response.status}: ${response.statusText}`);
                        }

                        const data = await response.json();

                        // Check for error in response
                        if (data.error) {
                            throw new Error(`[ApiClient] Server error: ${data.error}`);
                        }

                        // Success - reset error count and backoff
                        state.errorCount = 0;
                        state.backoffDelay = 0;

                        // Get all callbacks for this URL (may be multiple if requests were deduplicated)
                        const allCallbacks = pendingCallbacks.get(url) || [callbacks];
                        
                        // Call all success callbacks
                        allCallbacks.forEach((cb) => {
                            if (cb && cb.onSuccess) {
                                try {
                                    cb.onSuccess(data);
                                } catch (callbackError) {
                                    console.error('Error in onSuccess callback:', callbackError);
                                    // Don't throw - continue with other callbacks
                                }
                            }
                        });

                        resolvePromise(data);
                    } catch (error) {
                        clearTimeout(timeoutId);
                        state.errorCount++;
                        // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, 64s, 128s, 256s (max 5 min)
                        const maxDelay = window.Config ? window.Config.backoff.maxDelay : 300000;
                        const initialDelay = window.Config ? window.Config.backoff.initialDelay : 1000;
                        state.backoffDelay = Math.min(Math.pow(2, state.errorCount - 1) * initialDelay, maxDelay);
                        
                        const errorMessage = error.name === 'AbortError' 
                            ? `Request timeout after ${timeoutMs}ms`
                            : error.message;
                        console.warn(`[ApiClient] API fetch failed (attempt ${state.errorCount}), retrying in ${state.backoffDelay}ms:`, errorMessage);
                        
                        // Get all callbacks for this URL (may be multiple if requests were deduplicated)
                        const allCallbacks = pendingCallbacks.get(url) || [callbacks];
                        
                        // Call all error callbacks
                        allCallbacks.forEach((cb) => {
                            if (cb && cb.onError) {
                                try {
                                    cb.onError(error);
                                } catch (callbackError) {
                                    console.error('Error in onError callback:', callbackError);
                                }
                            }
                        });
                        
                        rejectPromise(error);
                    } finally {
                        state.isLoading = false;
                        // Clean up callbacks and pending request in finally to ensure cleanup
                        pendingCallbacks.delete(url);
                        pendingRequests.delete(url);
                    }
                } catch (error) {
                    // Handle any errors in the outer async function
                    state.isLoading = false;
                    pendingCallbacks.delete(url);
                    pendingRequests.delete(url);
                    rejectPromise(error);
                }
            })();

            return fetchPromise;
        },

        /**
         * Setup automatic refresh
         * @param {Function} fetchFn - Function to call on refresh
         * @param {number} interval - Refresh interval in milliseconds
         * @param {Object} state - Module-specific state object
         * @returns {number|null} - Interval ID or null
         */
        setupAutoRefresh: function(fetchFn, interval, state) {
            if (state.refreshIntervalId) {
                clearInterval(state.refreshIntervalId);
            }

            // Only set up interval if page is visible
            if (isPageVisible && interval > 0) {
                state.refreshIntervalId = setInterval(fetchFn, interval);
                return state.refreshIntervalId;
            }

            return null;
        },

        /**
         * Handle page visibility changes for auto-refresh
         * @param {Function} fetchFn - Function to call when page becomes visible
         * @param {Function} setupRefreshFn - Function to setup refresh interval
         * @param {Object} state - Module-specific state object
         */
        handleVisibilityChange: function(fetchFn, setupRefreshFn, state) {
            if (isPageVisible) {
                // Page became visible - resume polling
                if (setupRefreshFn) {
                    setupRefreshFn();
                }
                // Reset error count and backoff when page becomes visible
                state.errorCount = 0;
                state.backoffDelay = 0;
                // Fetch immediately when page becomes visible
                if (fetchFn) {
                    fetchFn();
                }
            } else {
                // Page became hidden - pause polling
                if (state.refreshIntervalId) {
                    clearInterval(state.refreshIntervalId);
                    state.refreshIntervalId = null;
                }
            }
        },

        /**
         * Cleanup resources
         * @param {Object} state - Module-specific state object
         */
        cleanup: function(state) {
            if (state.refreshIntervalId) {
                clearInterval(state.refreshIntervalId);
                state.refreshIntervalId = null;
            }
        }
    };

    // Export to global scope
    window.ApiClient = ApiClient;
})();

