// Theme switcher functionality for Where Is Al
(function() {
    'use strict';

    const THEME_STORAGE_KEY = 'where-is-al-theme';
    const THEME_ATTRIBUTE = 'data-theme';
    const DEFAULT_THEME = 'light';

    const getStoredTheme = () => {
        try {
            return localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME;
        } catch {
            return DEFAULT_THEME;
        }
    };

    const saveTheme = (theme) => {
        try {
            localStorage.setItem(THEME_STORAGE_KEY, theme);
        } catch {
            // Silently fail if localStorage is not available
        }
    };

    const applyTheme = (theme) => {
        document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);
        saveTheme(theme);
    };

    const toggleTheme = () => {
        const currentTheme = document.documentElement.getAttribute(THEME_ATTRIBUTE) || DEFAULT_THEME;
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(newTheme);
    };

    const initTheme = () => {
        const storedTheme = getStoredTheme();
        applyTheme(storedTheme);
    };

    const setupThemeToggle = () => {
        const toggleButton = document.getElementById('theme-toggle');
        if (toggleButton) {
            toggleButton.addEventListener('click', toggleTheme);
        }
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initTheme();
            setupThemeToggle();
        });
    } else {
        initTheme();
        setupThemeToggle();
    }
})();

