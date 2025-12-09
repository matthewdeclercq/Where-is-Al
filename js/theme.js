// Theme switcher functionality for Where Is Al
(function() {
    'use strict';

    const THEME_STORAGE_KEY = 'where-is-al-theme';
    const THEME_ATTRIBUTE = 'data-theme';
    const DEFAULT_THEME = 'light';

    // Get current theme from localStorage or default to light
    function getStoredTheme() {
        try {
            return localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME;
        } catch (e) {
            return DEFAULT_THEME;
        }
    }

    // Save theme to localStorage
    function saveTheme(theme) {
        try {
            localStorage.setItem(THEME_STORAGE_KEY, theme);
        } catch (e) {
            // Silently fail if localStorage is not available
        }
    }

    // Apply theme to document
    function applyTheme(theme) {
        document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);
        saveTheme(theme);
    }

    // Toggle between light and dark themes
    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute(THEME_ATTRIBUTE) || DEFAULT_THEME;
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(newTheme);
    }

    // Initialize theme on page load
    function initTheme() {
        const storedTheme = getStoredTheme();
        applyTheme(storedTheme);
    }

    // Set up theme toggle button
    function setupThemeToggle() {
        const toggleButton = document.getElementById('theme-toggle');
        if (toggleButton) {
            toggleButton.addEventListener('click', toggleTheme);
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initTheme();
            setupThemeToggle();
        });
    } else {
        initTheme();
        setupThemeToggle();
    }
})();

