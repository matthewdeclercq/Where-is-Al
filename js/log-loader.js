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
            const filenames = await fetchHTML(manifestPath).then(text => JSON.parse(text));
            
            if (!Array.isArray(filenames) || filenames.length === 0) return;

            // Sort by filename (newest first) and load sequentially to ensure correct order
            const sortedFilenames = [...filenames].sort().reverse();
            for (const filename of sortedFilenames) {
                await loadLogEntry('#log-grid', basePath + 'log-entries/' + filename);
            }
        } catch (error) {
            console.error('Failed to load log entries:', error);
        }
    }

    // Auto-initialize when DOM is ready
    Utils.ready(loadLogEntries);
})();
