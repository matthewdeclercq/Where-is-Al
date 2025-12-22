// Weather Module - Fetches and displays weather at Al's current location
(function() {
    'use strict';

    // Configuration
    // Utils is loaded before this script, so getConfig should always be available
    const getConfigValue = (path, defaultValue) => {
        return (typeof Utils !== 'undefined' && Utils.getConfig) 
            ? Utils.getConfig(path, defaultValue)
            : defaultValue;
    };
    
    const WeatherConfig = {
        workerUrl: getConfigValue('workerUrl', 'https://where-is-al.matthew-declercq.workers.dev/'),
        refreshInterval: getConfigValue('refreshIntervals.weather', 3600000),
        enableAutoRefresh: true
    };

    // Module state
    const state = {
        refreshIntervalId: null,
        isLoading: false,
        errorCount: 0,
        backoffDelay: 0
    };
    let weatherChart = null; // Chart.js instance

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
     * Format date for display (uses shared DateUtils)
     * DateUtils is loaded before this script, so it should always be available
     */
    function formatDate(dateString) {
        // DateUtils is loaded before this script, but keep fallback for safety
        if (window.DateUtils && window.DateUtils.formatDate) {
            return window.DateUtils.formatDate(dateString, false); // Use local time for weather
        }
        // Fallback if DateUtils not available (shouldn't happen in production)
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
     * Create point styling arrays based on labels (highlight "Today")
     * Uses shared ChartUtils if available
     */
    function createPointStyling(labels, baseRadius, todayRadius) {
        if (typeof ChartUtils !== 'undefined' && ChartUtils.createPointStyling) {
            return ChartUtils.createPointStyling(labels, 'Today', baseRadius, todayRadius);
        }
        return labels.map(label => label === 'Today' ? todayRadius : baseRadius);
    }

    function createPointBorderStyling(labels, baseBorder, todayBorder) {
        if (typeof ChartUtils !== 'undefined' && ChartUtils.createPointBorderStyling) {
            return ChartUtils.createPointBorderStyling(labels, 'Today', baseBorder, todayBorder);
        }
        return labels.map(label => label === 'Today' ? todayBorder : baseBorder);
    }

    /**
     * Create chart dataset configuration
     */
    function createDatasetConfig(label, data, color, labels) {
        return {
            label: label,
            data: data,
            borderColor: color,
            backgroundColor: `rgba(${color === '#e55a2b' ? '229, 90, 43' : '90, 159, 201'}, 0.1)`,
            borderWidth: 3,
            pointRadius: createPointStyling(labels, 5, 8),
            pointHoverRadius: createPointStyling(labels, 7, 10),
            pointBackgroundColor: color,
            pointBorderColor: '#ffffff',
            pointBorderWidth: createPointBorderStyling(labels, 2, 3),
            tension: 0.3,
            fill: false,
            hidden: false
        };
    }

    /**
     * Create chart options configuration (uses shared ChartUtils)
     */
    function createChartOptions(labels, yAxisMin, yAxisMax) {
        if (typeof ChartUtils !== 'undefined' && ChartUtils.createBaseChartOptions) {
            return ChartUtils.createBaseChartOptions({
                aspectRatio: 3.2,
                aspectRatioMobile: 1.8,
                showLegend: true,
                tooltipLabelCallback: function(context) {
                    return `${context.dataset.label}: ${context.parsed.y}°F`;
                },
                labels: labels,
                yAxisMin: yAxisMin,
                yAxisMax: yAxisMax,
                yAxisCallback: function(value) {
                    return value + '°F';
                },
                xAxisOptions: {
                    showGrid: false
                }
            });
        }
        
        // Fallback if ChartUtils not available
        const isMobile = (typeof Utils !== 'undefined' && Utils.isMobile) ? Utils.isMobile() : window.innerWidth <= 480;
        const aspectRatio = isMobile ? 1.8 : 3.2;
        return {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: aspectRatio,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    onClick: null,
                    labels: {
                        usePointStyle: true,
                        padding: isMobile ? 10 : 15,
                        font: { family: "'Cabin', sans-serif", size: isMobile ? 12 : 14, weight: 600 },
                        color: 'var(--text-dark)'
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(30, 58, 15, 0.9)',
                    padding: 12,
                    titleFont: { family: "'Cabin', sans-serif", size: 14, weight: 600 },
                    bodyFont: { family: "'Cabin', sans-serif", size: 13 },
                    borderColor: 'var(--earth-brown)',
                    borderWidth: 2,
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.parsed.y}°F`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        font: function(context) {
                            const label = labels[context.index];
                            return { family: "'Cabin', sans-serif", size: isMobile ? 10 : 12, weight: label === 'Today' ? 700 : 600 };
                        },
                        color: function(context) {
                            const label = labels[context.index];
                            return label === 'Today' ? '#1e3a0f' : 'var(--earth-brown-dark)';
                        },
                        padding: isMobile ? 5 : 10
                    }
                },
                y: {
                    beginAtZero: false,
                    min: yAxisMin,
                    max: yAxisMax,
                    grid: { color: 'rgba(139, 111, 71, 0.2)', lineWidth: 1 },
                    ticks: {
                        font: { family: "'Cabin', sans-serif", size: isMobile ? 10 : 12 },
                        color: 'var(--text-dark)',
                        callback: function(value) { return value + '°F'; },
                        padding: isMobile ? 5 : 10
                    }
                }
            },
            interaction: { intersect: false, mode: 'index' }
        };
    }

    /**
     * Update forecast display with line chart
     */
    function updateForecast(weather) {
        if (!weather || !weather.forecast || !Array.isArray(weather.forecast) || weather.forecast.length === 0) {
            return;
        }

        // Check if Chart.js is available
        if (typeof Chart === 'undefined') {
            console.error('Chart.js is not loaded. Make sure chart.umd.min.js is loaded before weather.js');
            return;
        }

        const forecastContainer = document.getElementById('weather-forecast');
        if (!forecastContainer) return;

        // Get canvas element
        const canvas = document.getElementById('weather-chart');
        if (!canvas) return;

        // Set explicit canvas dimensions to prevent stretching
        const containerWidth = forecastContainer.offsetWidth;
        const containerHeight = forecastContainer.offsetHeight;

        canvas.width = containerWidth * window.devicePixelRatio;
        canvas.height = containerHeight * window.devicePixelRatio;
        canvas.style.width = containerWidth + 'px';
        canvas.style.height = containerHeight + 'px';

        // Ensure container is visible
        forecastContainer.style.display = 'block';

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error('Could not get 2d context from canvas');
            return;
        }

        // Extract data from forecast
        const labels = weather.forecast.map(day => formatDate(day.date));
        const highTemps = weather.forecast.map(day => day.high);
        const lowTemps = weather.forecast.map(day => day.low);
        const conditions = weather.forecast.map(day => day.condition);
        const iconClasses = weather.forecast.map(day => getWeatherIcon(day.condition));
        
        // Find index of "Today" for highlighting
        const todayIndex = labels.findIndex(label => label === 'Today');

        // Calculate min and max temps for y-axis scaling
        const allTemps = [...highTemps, ...lowTemps];
        const minTemp = Math.min(...allTemps);
        const maxTemp = Math.max(...allTemps);
        const tempRange = maxTemp - minTemp;
        const yAxisMin = Math.floor(minTemp - tempRange * 0.1);
        const yAxisMax = Math.ceil(maxTemp + tempRange * 0.1);

        // Clean up any existing icons
        const chartContainer = canvas.parentElement;
        if (chartContainer) {
            const existingIcons = chartContainer.querySelectorAll('i.weather-chart-icon');
            existingIcons.forEach(icon => icon.remove());
        }

        // Store icon data for the plugin
        const iconData = {
            labels: labels,
            iconClasses: iconClasses,
            conditions: conditions
        };

        // Create Chart.js plugin to render weather icons and highlight "Today"
        const weatherIconPlugin = {
            id: 'weatherIcons',
            beforeDraw: (chart) => {
                // Draw vertical highlight for "Today"
                if (todayIndex >= 0) {
                    const { ctx, chartArea, scales } = chart;
                    const xAxis = scales.x;
                    const xPos = xAxis.getPixelForValue(todayIndex);
                    
                    ctx.save();
                    ctx.fillStyle = 'rgba(30, 58, 15, 0.08)'; // Subtle background highlight
                    ctx.fillRect(xPos - 40, chartArea.top, 80, chartArea.bottom - chartArea.top);
                    ctx.restore();
                }
            },
            afterDraw: (chart) => {
                const { chartArea, scales } = chart;
                const xAxis = scales.x;
                const chartContainer = canvas.parentElement;
                
                if (!chartContainer) return;

                // Get iconData from chart instance (for updates) or use closure data (for initial render)
                const data = chart.iconData || iconData;

                // Remove any existing icons first
                const existingIcons = chartContainer.querySelectorAll('i.weather-chart-icon');
                existingIcons.forEach(icon => icon.remove());

                // Draw icons below x-axis
                data.labels.forEach((label, index) => {
                    const xPos = xAxis.getPixelForValue(index);
                    const yPos = chartArea.bottom + 35; // Position below x-axis labels

                    // Create icon element
                    const icon = document.createElement('i');
                    icon.className = `fas ${data.iconClasses[index]} weather-chart-icon`;
                    icon.style.position = 'absolute';
                    icon.style.left = `${xPos}px`;
                    icon.style.top = `${yPos}px`;
                    icon.style.transform = 'translateX(-50%)';
                    icon.style.fontSize = '1.5rem';
                    icon.style.color = 'var(--sky-blue-dark)';
                    icon.style.pointerEvents = 'none';
                    icon.style.zIndex = '10';
                    icon.setAttribute('aria-label', data.conditions[index]);

                    // Append to chart container
                    chartContainer.style.position = 'relative';
                    chartContainer.appendChild(icon);
                });
            }
        };

        // Update existing chart or create new one
        if (weatherChart) {
            // Recalculate mobile state for update
            const isMobile = (typeof Utils !== 'undefined' && Utils.isMobile) ? Utils.isMobile() : window.innerWidth <= 480;
            
            // Update existing chart
            weatherChart.data.labels = labels;
            weatherChart.data.datasets[0].data = highTemps;
            weatherChart.data.datasets[1].data = lowTemps;
            weatherChart.data.datasets[0].pointRadius = createPointStyling(labels, 5, 8);
            weatherChart.data.datasets[0].pointBorderWidth = createPointBorderStyling(labels, 2, 3);
            weatherChart.data.datasets[0].hidden = false;
            weatherChart.data.datasets[1].pointRadius = createPointStyling(labels, 5, 8);
            weatherChart.data.datasets[1].pointBorderWidth = createPointBorderStyling(labels, 2, 3);
            weatherChart.data.datasets[1].hidden = false;
            weatherChart.options.scales.y.min = yAxisMin;
            weatherChart.options.scales.y.max = yAxisMax;
            weatherChart.options.aspectRatio = isMobile ? 1.8 : 3.2;
            weatherChart.options.plugins.legend.labels.padding = isMobile ? 10 : 15;
            weatherChart.options.plugins.legend.labels.font.size = isMobile ? 12 : 14;
            weatherChart.options.scales.x.ticks.font = function(context) {
                const label = labels[context.index];
                return {
                    family: "'Cabin', sans-serif",
                    size: isMobile ? 10 : 12,
                    weight: label === 'Today' ? 700 : 600
                };
            };
            weatherChart.options.scales.x.ticks.padding = isMobile ? 5 : 10;
            weatherChart.options.scales.x.ticks.color = function(context) {
                const label = labels[context.index];
                return label === 'Today' ? '#1e3a0f' : 'var(--earth-brown-dark)';
            };
            weatherChart.options.scales.y.ticks.font.size = isMobile ? 10 : 12;
            weatherChart.options.scales.y.ticks.padding = isMobile ? 5 : 10;

            // Store iconData on chart instance for plugin access
            weatherChart.iconData = iconData;

            weatherChart.update();
        } else {
            // Create new chart
            try {
                weatherChart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [
                            createDatasetConfig('High', highTemps, '#e55a2b', labels),
                            createDatasetConfig('Low', lowTemps, '#5a9fc9', labels)
                        ]
                    },
                    options: createChartOptions(labels, yAxisMin, yAxisMax),
                    plugins: [weatherIconPlugin]
                });
            } catch (error) {
                console.error('Error creating weather chart:', error);
                throw error;
            }
        }
    }

    /**
     * Update weather display with data
     */
    function updateWeatherDisplay(data) {
        if (!data) {
            showWeatherPlaceholder('No data received from server.');
            return;
        }
        
        if (!data.weather) {
            if (!data.location) {
                showWeatherPlaceholder('Weather data will appear here once Al\'s location is available.');
            } else {
                showWeatherPlaceholder('Weather data temporarily unavailable.');
            }
            return;
        }

        // Show the weather section
        const weatherSection = document.querySelector('.weather-section');
        if (weatherSection) {
            weatherSection.style.display = 'block';
        }

        hideWeatherPlaceholder();
        
        try {
            updateCurrentWeather(data.weather);
            updateForecast(data.weather);
        } catch (e) {
            console.error('Error updating weather display:', e);
            showWeatherError('Error updating display: ' + e.message);
        }
    }

    /**
     * Show placeholder when weather data is unavailable
     */
    function showWeatherPlaceholder(message) {
        // Show the weather section even if no data
        const weatherSection = document.querySelector('.weather-section');
        if (weatherSection) {
            weatherSection.style.display = 'block';
            const placeholder = weatherSection.querySelector('.weather-placeholder');
            if (placeholder) {
                placeholder.style.display = 'block';
                if (message) {
                    placeholder.textContent = message;
                }
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
        console.error('[Weather] Error:', message);
        showWeatherPlaceholder(message || 'Unable to load weather data. Please try again later.');
    }

    /**
     * Fetch weather from Cloudflare Worker
     */
    async function fetchWeather() {
        if (!WeatherConfig.workerUrl) {
            console.warn('[Weather] Cloudflare Worker URL not configured. Update WeatherConfig.workerUrl in js/weather.js');
            return;
        }

        if (!window.ApiClient) {
            console.error('[Weather] ApiClient not available. Make sure js/api-client.js is loaded before js/weather.js');
            showWeatherError('API client not initialized');
            return;
        }

        // Show the weather section while loading
        const weatherSection = document.querySelector('.weather-section');
        if (weatherSection) {
            weatherSection.style.display = 'block';
        }
        hideWeatherPlaceholder();

        try {
            await window.ApiClient.fetch(
                WeatherConfig.workerUrl,
                { method: 'GET' },
                {
                    onSuccess: (data) => {
                        if (!data || !data.weather) {
                            if (!data || data.weather === null) {
                                showWeatherPlaceholder('Weather data will appear here once Al\'s location is available.');
                            } else {
                                showWeatherPlaceholder('Weather data temporarily unavailable.');
                            }
                            return;
                        }
                        
                        try {
                            updateWeatherDisplay(data);
                        } catch (e) {
                            console.error('[Weather] Error updating weather display:', e);
                            showWeatherError('Error displaying weather data: ' + e.message);
                        }
                    },
                    onError: (error) => {
                        console.error('[Weather] Fetch error:', error);
                        showWeatherError(error.message);
                    }
                },
                state
            );
        } catch (error) {
            console.error('[Weather] Fetch exception:', error);
            showWeatherError(error.message || 'Failed to fetch weather data');
        }
    }

    /**
     * Setup automatic refresh
     */
    function setupAutoRefresh() {
        if (WeatherConfig.enableAutoRefresh) {
            window.ApiClient.setupAutoRefresh(fetchWeather, WeatherConfig.refreshInterval, state);
        }
    }

    /**
     * Handle page visibility changes
     */
    function handleVisibilityChange() {
        window.ApiClient.handleVisibilityChange(fetchWeather, setupAutoRefresh, state);
    }

    /**
     * Update chart options for current screen size
     */
    function updateChartForScreenSize() {
        if (!weatherChart) return;

        const isMobile = (typeof Utils !== 'undefined' && Utils.isMobile) ? Utils.isMobile() : window.innerWidth <= 480;
        const labels = weatherChart.data.labels || [];

        // Update chart options based on screen size
        weatherChart.options.aspectRatio = isMobile ? 1.8 : 3.2;
        weatherChart.options.plugins.legend.labels.padding = isMobile ? 10 : 15;
        weatherChart.options.plugins.legend.labels.font.size = isMobile ? 12 : 14;
        weatherChart.options.scales.x.ticks.font = function(context) {
            const label = labels[context.index];
            return {
                family: "'Cabin', sans-serif",
                size: isMobile ? 10 : 12,
                weight: label === 'Today' ? 700 : 600
            };
        };
        weatherChart.options.scales.x.ticks.padding = isMobile ? 5 : 10;
        weatherChart.options.scales.y.ticks.font.size = isMobile ? 10 : 12;
        weatherChart.options.scales.y.ticks.padding = isMobile ? 5 : 10;

        // Update the chart
        weatherChart.update('none'); // 'none' mode for smoother resize without animation
    }

    /**
     * Handle window resize with debouncing
     */
    const handleResize = (typeof Utils !== 'undefined' && Utils.debounce)
        ? Utils.debounce(updateChartForScreenSize, 200)
        : (function() {
            // Fallback debounce implementation
            let resizeTimeoutId = null;
            return function() {
                if (resizeTimeoutId) {
                    clearTimeout(resizeTimeoutId);
                }
                resizeTimeoutId = setTimeout(function() {
                    updateChartForScreenSize();
                    resizeTimeoutId = null;
                }, 200);
            };
        })();

    /**
     * Register resize handler
     */
    function registerResizeHandler() {
        window.addEventListener('resize', handleResize);
    }

    /**
     * Unregister resize handler
     */
    function unregisterResizeHandler() {
        window.removeEventListener('resize', handleResize);
    }

    /**
     * Register visibility change handler
     */
    function registerVisibilityHandler() {
        if (typeof Utils !== 'undefined' && Utils.VisibilityManager) {
            Utils.VisibilityManager.register(handleVisibilityChange);
        } else {
            // Fallback to direct listener if Utils or VisibilityManager not available
            document.addEventListener('visibilitychange', handleVisibilityChange);
        }
    }

    /**
     * Unregister visibility change handler
     */
    function unregisterVisibilityHandler() {
        if (typeof Utils !== 'undefined' && Utils.VisibilityManager) {
            Utils.VisibilityManager.unregister(handleVisibilityChange);
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
        window.ApiClient.cleanup(state);
        
        // Destroy chart if it exists
        if (weatherChart) {
            weatherChart.destroy();
            weatherChart = null;
        }
        
        // Clean up weather icons
        const forecastContainer = document.getElementById('weather-forecast');
        if (forecastContainer) {
            const icons = forecastContainer.querySelectorAll('i.weather-chart-icon');
            icons.forEach(icon => icon.remove());
        }
        
        // Unregister handlers
        unregisterVisibilityHandler();
        unregisterResizeHandler();
    }

    // Initialize when DOM is ready and Chart.js is loaded
    function checkAndInitialize() {
        // Check if Chart.js is available
        if (typeof Chart === 'undefined') {
            setTimeout(checkAndInitialize, 100);
            return;
        }
        
        (function init() {
            if (typeof Utils !== 'undefined' && Utils.ready) {
                Utils.ready(function() {
                    initializeWeather();
                    registerVisibilityHandler();
                    registerResizeHandler();
                });
            } else if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', function() {
                    initializeWeather();
                    registerVisibilityHandler();
                    registerResizeHandler();
                });
            } else {
                initializeWeather();
                registerVisibilityHandler();
                registerResizeHandler();
            }
        })();
    }
    
    checkAndInitialize();

    // Cleanup on page unload
    window.addEventListener('beforeunload', cleanup);
})();

