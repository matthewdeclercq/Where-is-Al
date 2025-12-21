// Weather Module - Fetches and displays weather at Al's current location
(function() {
    'use strict';

    // Configuration
    const WeatherConfig = {
        workerUrl: 'https://where-is-al.matthew-declercq.workers.dev/',
        
        // Refresh interval in milliseconds (default: 1 hour)
        refreshInterval: 3600000,
        
        // Enable/disable automatic weather refresh
        enableAutoRefresh: true
    };

    let refreshIntervalId = null;
    let isLoading = false;
    let isPageVisible = true;
    let errorCount = 0;
    let backoffDelay = 0;
    const MAX_BACKOFF_DELAY = 300000; // 5 minutes max backoff

    /**
     * Get weather icon class based on condition
     */
    function getWeatherIcon(condition) {
        const conditionLower = condition.toLowerCase();
        if (conditionLower.includes('clear') || conditionLower.includes('sunny')) {
            return 'fa-sun';
        } else if (conditionLower.includes('cloud')) {
            return 'fa-cloud';
        } else if (conditionLower.includes('rain') || conditionLower.includes('drizzle')) {
            return 'fa-cloud-rain';
        } else if (conditionLower.includes('snow')) {
            return 'fa-snowflake';
        } else if (conditionLower.includes('thunder')) {
            return 'fa-bolt';
        } else if (conditionLower.includes('fog')) {
            return 'fa-smog';
        } else {
            return 'fa-cloud-sun';
        }
    }

    /**
     * Format wind direction from degrees to cardinal direction
     */
    function getWindDirection(degrees) {
        const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        const index = Math.round(degrees / 22.5) % 16;
        return directions[index];
    }

    /**
     * Format date for display
     */
    function formatDate(dateString) {
        const date = new Date(dateString);
        const today = new Date();
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

    /**
     * Update current weather display
     */
    function updateCurrentWeather(weather) {
        if (!weather || !weather.current) {
            return;
        }

        const current = weather.current;
        const currentSection = document.getElementById('weather-current');
        if (!currentSection) return;

        // Main temperature and condition
        const tempEl = currentSection.querySelector('.weather-temp');
        const conditionEl = currentSection.querySelector('.weather-condition');
        const iconEl = currentSection.querySelector('.weather-icon i');

        if (tempEl) tempEl.textContent = `${current.temperature}°F`;
        if (conditionEl) conditionEl.textContent = current.condition;
        if (iconEl) {
            iconEl.className = `fas ${getWeatherIcon(current.condition)}`;
        }

        // Details
        const feelsLikeEl = currentSection.querySelector('.weather-feels-like');
        const humidityEl = currentSection.querySelector('.weather-humidity');
        const windEl = currentSection.querySelector('.weather-wind');

        if (feelsLikeEl) {
            feelsLikeEl.textContent = `Feels like ${current.feelsLike}°F`;
        }
        if (humidityEl) {
            humidityEl.textContent = `${current.humidity}% humidity`;
        }
        if (windEl) {
            const windDir = getWindDirection(current.windDirection);
            windEl.textContent = `${current.windSpeed} mph ${windDir}`;
        }
    }

    /**
     * Update forecast display
     */
    function updateForecast(weather) {
        if (!weather || !weather.forecast || !Array.isArray(weather.forecast)) {
            return;
        }

        const forecastContainer = document.getElementById('weather-forecast');
        if (!forecastContainer) return;

        forecastContainer.innerHTML = '';

        weather.forecast.forEach((day, index) => {
            const forecastCard = document.createElement('div');
            forecastCard.className = 'forecast-card';
            
            const iconClass = getWeatherIcon(day.condition);
            
            forecastCard.innerHTML = `
                <div class="forecast-date">${formatDate(day.date)}</div>
                <div class="forecast-icon">
                    <i class="fas ${iconClass}"></i>
                </div>
                <div class="forecast-condition">${day.condition}</div>
                <div class="forecast-temps">
                    <span class="forecast-high">${day.high}°</span>
                    <span class="forecast-low">${day.low}°</span>
                </div>
            `;

            forecastContainer.appendChild(forecastCard);
        });
    }

    /**
     * Update weather display with data
     */
    function updateWeatherDisplay(data) {
        if (!data || !data.weather) {
            showWeatherPlaceholder();
            return;
        }

        // Show the weather section
        const weatherSection = document.querySelector('.weather-section');
        if (weatherSection) {
            weatherSection.style.display = 'block';
        }

        hideWeatherPlaceholder();
        updateCurrentWeather(data.weather);
        updateForecast(data.weather);
    }

    /**
     * Show placeholder when weather data is unavailable
     */
    function showWeatherPlaceholder() {
        // Show the weather section even if no data
        const weatherSection = document.querySelector('.weather-section');
        if (weatherSection) {
            weatherSection.style.display = 'block';
            const placeholder = weatherSection.querySelector('.weather-placeholder');
            if (placeholder) {
                placeholder.style.display = 'block';
            }
        }
    }

    /**
     * Hide placeholder
     */
    function hideWeatherPlaceholder() {
        const weatherSection = document.querySelector('.weather-section');
        if (weatherSection) {
            const placeholder = weatherSection.querySelector('.weather-placeholder');
            if (placeholder) {
                placeholder.style.display = 'none';
            }
        }
    }

    /**
     * Show error message
     */
    function showWeatherError(message) {
        console.error('Weather error:', message);
        showWeatherPlaceholder();
    }

    /**
     * Fetch weather from Cloudflare Worker
     */
    async function fetchWeather() {
        if (isLoading) {
            return; // Prevent concurrent requests
        }

        // Don't fetch if page is hidden
        if (!isPageVisible) {
            return;
        }

        if (!WeatherConfig.workerUrl || WeatherConfig.workerUrl.includes('your-worker')) {
            console.warn('Cloudflare Worker URL not configured. Update WeatherConfig.workerUrl in js/weather.js');
            return;
        }

        // Apply exponential backoff if there were recent errors
        if (backoffDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
        }

        isLoading = true;
        
        // Show the weather section while loading
        const weatherSection = document.querySelector('.weather-section');
        if (weatherSection) {
            weatherSection.style.display = 'block';
        }
        hideWeatherPlaceholder();

        try {
            const response = await fetch(WeatherConfig.workerUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            // Check for error in response
            if (data.error) {
                throw new Error(data.error);
            }

            // Success - reset error count and backoff
            errorCount = 0;
            backoffDelay = 0;

            // Update the display
            updateWeatherDisplay(data);
            
        } catch (error) {
            errorCount++;
            // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, 64s, 128s, 256s (max 5 min)
            backoffDelay = Math.min(Math.pow(2, errorCount - 1) * 1000, MAX_BACKOFF_DELAY);
            console.warn(`Weather fetch failed (attempt ${errorCount}), retrying in ${backoffDelay}ms:`, error.message);
            showWeatherError(error.message);
        } finally {
            isLoading = false;
        }
    }

    /**
     * Setup automatic refresh
     */
    function setupAutoRefresh() {
        if (refreshIntervalId) {
            clearInterval(refreshIntervalId);
        }

        // Only set up interval if page is visible
        if (isPageVisible && WeatherConfig.enableAutoRefresh && WeatherConfig.refreshInterval > 0) {
            refreshIntervalId = setInterval(fetchWeather, WeatherConfig.refreshInterval);
        }
    }

    /**
     * Handle page visibility changes
     */
    function handleVisibilityChange() {
        isPageVisible = !document.hidden;
        
        if (isPageVisible) {
            // Page became visible - resume polling
            setupAutoRefresh();
            // Reset error count and backoff when page becomes visible
            errorCount = 0;
            backoffDelay = 0;
            // Fetch immediately when page becomes visible
            fetchWeather();
        } else {
            // Page became hidden - pause polling
            if (refreshIntervalId) {
                clearInterval(refreshIntervalId);
                refreshIntervalId = null;
            }
        }
    }

    /**
     * Initialize weather module
     */
    function initializeWeather() {
        // Fetch weather immediately on page load
        fetchWeather();

        // Setup automatic refresh
        if (WeatherConfig.enableAutoRefresh) {
            setupAutoRefresh();
        }
    }

    /**
     * Cleanup on page unload
     */
    function cleanup() {
        if (refreshIntervalId) {
            clearInterval(refreshIntervalId);
            refreshIntervalId = null;
        }
        document.removeEventListener('visibilitychange', handleVisibilityChange);
    }

    // Initialize when DOM is ready
    Utils.ready(initializeWeather);

    // Handle page visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup on page unload
    window.addEventListener('beforeunload', cleanup);

    // Export for manual use if needed
    window.WeatherManager = {
        refresh: fetchWeather,
        initialize: initializeWeather,
        config: WeatherConfig
    };
})();

