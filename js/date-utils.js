// Shared Date Utilities for Where Is Al
// Provides consistent date formatting and manipulation functions
(function() {
    'use strict';

    /**
     * Format date string (YYYY-MM-DD) for display
     * Shows "Today" if the date is today, otherwise formats as "Mon Jan 1"
     * @param {string} dateString - Date string in YYYY-MM-DD format
     * @param {boolean} useUTC - Whether to use UTC for date comparison (default: true)
     * @returns {string} Formatted date string
     */
    function formatDate(dateString, useUTC = true) {
        if (!dateString) return '—';
        
        const date = useUTC 
            ? new Date(dateString + 'T00:00:00Z')
            : new Date(dateString);
        const today = new Date();
        
        if (useUTC) {
            const todayStr = today.toISOString().split('T')[0];
            if (dateString === todayStr) {
                return 'Today';
            }
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } else {
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            
            if (date.toDateString() === today.toDateString()) {
                return 'Today';
            } else if (date.toDateString() === tomorrow.toDateString()) {
                return 'Tomorrow';
            } else {
                return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            }
        }
    }

    /**
     * Format time string (ISO format) for display
     * @param {string} timeString - ISO time string
     * @returns {string} Formatted time string (e.g., "2:30 PM")
     */
    function formatTime(timeString) {
        if (!timeString) return '—';
        const date = new Date(timeString);
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }

    // Export utilities to global scope
    window.DateUtils = {
        formatDate: formatDate,
        formatTime: formatTime
    };
})();

