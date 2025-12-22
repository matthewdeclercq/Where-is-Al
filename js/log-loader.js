// Log entry loader for Where Is Al
(function() {
    'use strict';

    async function fetchHTML(filePath) {
        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.text();
    }

    async function loadLogEntry(containerSelector, filePath) {
        const container = document.querySelector(containerSelector);
        if (!container) return false;

        try {
            const html = await fetchHTML(filePath);
            container.insertAdjacentHTML('beforeend', html);
            return true;
        } catch (error) {
            console.warn(`Failed to load ${filePath}:`, error);
            return false;
        }
    }

    async function loadLogEntries() {
        const logGrid = document.getElementById('log-grid');
        if (!logGrid) return;

        logGrid.innerHTML = '';

        try {
            // Calculate base path
            const currentPath = window.location.pathname;
            const basePath = currentPath.endsWith('main.html') 
                ? currentPath.replace(/main\.html$/, '')
                : currentPath.substring(0, currentPath.lastIndexOf('/') + 1);
            
            // Fetch manifest
            const manifestPath = basePath + 'log-entries/manifest.json';
            let filenames;
            try {
                const manifestText = await fetchHTML(manifestPath);
                filenames = JSON.parse(manifestText);
            } catch (parseError) {
                console.error('Failed to parse manifest.json:', parseError);
                throw new Error(`Invalid manifest format: ${parseError.message}`);
            }
            
            if (!Array.isArray(filenames) || filenames.length === 0) return;

            // Sort by filename (newest first) and load in parallel for better performance
            // Load all entries in parallel, then insert in order
            const sortedFilenames = [...filenames].sort().reverse();
            const loadPromises = sortedFilenames.map(async (filename) => {
                try {
                    const html = await fetchHTML(basePath + 'log-entries/' + filename);
                    return { filename, html };
                } catch (error) {
                    console.warn(`[LogLoader] Failed to load ${filename}:`, error);
                    return { filename, html: null };
                }
            });
            
            const results = await Promise.all(loadPromises);
            // Sort results by filename (newest first) to ensure correct display order
            // This handles any edge cases where order might not be preserved
            const sortedResults = results
                .filter(result => result.html !== null)
                .sort((a, b) => {
                    // Sort by filename descending (newest first)
                    return b.filename.localeCompare(a.filename);
                });
            
            // Insert in sorted order
            for (const { html } of sortedResults) {
                logGrid.insertAdjacentHTML('beforeend', html);
            }
        } catch (error) {
            console.error('[LogLoader] Failed to load log entries:', error);
        }
    }

    // Auto-initialize when DOM is ready
    (function init() {
        if (typeof Utils !== 'undefined' && Utils.ready) {
            Utils.ready(loadLogEntries);
        } else if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', loadLogEntries);
        } else {
            loadLogEntries();
        }
    })();
})();
