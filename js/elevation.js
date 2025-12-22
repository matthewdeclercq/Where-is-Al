// Elevation Profile Module - Fetches and displays elevation profile for selected day
(function() {
    'use strict';

    // Configuration
    // Utils is loaded before this script, so getConfig should always be available
    const getConfigValue = (path, defaultValue) => {
        return (typeof Utils !== 'undefined' && Utils.getConfig) 
            ? Utils.getConfig(path, defaultValue)
            : defaultValue;
    };
    
    const ElevationConfig = {
        workerUrl: getConfigValue('workerUrl', 'https://where-is-al.matthew-declercq.workers.dev/'),
        refreshInterval: getConfigValue('refreshIntervals.elevation', 3600000),
        enableAutoRefresh: true
    };

    // Module state
    const state = {
        refreshIntervalId: null,
        isLoading: false,
        errorCount: 0,
        backoffDelay: 0,
        selectedDay: null,
        selectedDayIndex: -1,
        availableDays: [],
        chart: null
    };

    /**
     * Format date for display (uses shared DateUtils)
     * DateUtils is loaded before this script, so it should always be available
     */
    function formatDate(dateString) {
        // DateUtils is loaded before this script, but keep fallback for safety
        if (window.DateUtils && window.DateUtils.formatDate) {
            return window.DateUtils.formatDate(dateString, true); // Use UTC
        }
        // Fallback if DateUtils not available (shouldn't happen in production)
        const date = new Date(dateString + 'T00:00:00Z');
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        if (dateString === todayStr) {
            return 'Today';
        }
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    /**
     * Format time for chart labels (uses shared DateUtils)
     * DateUtils is loaded before this script, so it should always be available
     */
    function formatTime(timeString) {
        // DateUtils is loaded before this script, but keep fallback for safety
        if (window.DateUtils && window.DateUtils.formatTime) {
            return window.DateUtils.formatTime(timeString);
        }
        // Fallback if DateUtils not available (shouldn't happen in production)
        const date = new Date(timeString);
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }

    /**
     * Fetch available days with elevation data
     */
    async function fetchAvailableDays() {
        if (!ElevationConfig.workerUrl) {
            console.warn('[Elevation] Cloudflare Worker URL not configured.');
            return [];
        }

        if (!window.ApiClient) {
            console.error('[Elevation] ApiClient not available. Make sure js/api-client.js is loaded before js/elevation.js');
            return [];
        }

        return new Promise((resolve) => {
            window.ApiClient.fetch(
                `${ElevationConfig.workerUrl}elevation`,
                { method: 'GET' },
                {
                    onSuccess: (data) => {
                        resolve(data.days || []);
                    },
                    onError: (error) => {
                        console.error('[Elevation] Failed to fetch available days:', error);
                        resolve([]);
                    }
                },
                state
            ).catch(() => {
                // Error already handled in onError callback
                resolve([]);
            });
        });
    }

    /**
     * Fetch elevation data for a specific day
     */
    async function fetchElevationData(day) {
        if (!ElevationConfig.workerUrl || !day) {
            return null;
        }

        if (!window.ApiClient) {
            console.error('[Elevation] ApiClient not available. Make sure js/api-client.js is loaded before js/elevation.js');
            return null;
        }

        return new Promise((resolve) => {
            window.ApiClient.fetch(
                `${ElevationConfig.workerUrl}elevation?day=${day}`,
                { method: 'GET' },
                {
                    onSuccess: (data) => {
                        resolve(data);
                    },
                    onError: (error) => {
                        console.error('[Elevation] Failed to fetch elevation data:', error);
                        resolve(null);
                    }
                },
                state
            ).catch(() => {
                // Error already handled in onError callback
                resolve(null);
            });
        });
    }

    /**
     * Set up day selector navigation buttons (called once during initialization)
     */
    function setupDaySelector() {
        const prevButton = document.getElementById('elevation-day-prev');
        const nextButton = document.getElementById('elevation-day-next');
        const selector = document.getElementById('elevation-day-selector');

        if (!prevButton || !nextButton || !selector) {
            console.warn('[Elevation] Day selector elements not found', {
                prevButton: !!prevButton,
                nextButton: !!nextButton,
                selector: !!selector
            });
            return;
        }

        // Ensure selector is empty (remove any old buttons that might have been dynamically added)
        const oldButtons = selector.querySelectorAll('.day-selector-button');
        oldButtons.forEach(btn => btn.remove());

        // Make sure our navigation buttons are visible
        prevButton.style.display = 'flex';
        nextButton.style.display = 'flex';

        // Set up navigation buttons (only once)
        // Left button = back (go to earlier date, higher index)
        // Right button = forward (go to later date, lower index)
        // Note: Days are sorted descending (most recent first), so index 0 = most recent
        prevButton.addEventListener('click', () => {
            // Back = earlier date = move to higher index
            if (state.selectedDayIndex < state.availableDays.length - 1) {
                selectDayByIndex(state.selectedDayIndex + 1);
            }
        });

        nextButton.addEventListener('click', () => {
            // Forward = later date = move to lower index
            if (state.selectedDayIndex > 0) {
                selectDayByIndex(state.selectedDayIndex - 1);
            }
        });
    }

    /**
     * Render day selector with navigation buttons
     */
    function renderDaySelector(days) {
        // Just update button states, event listeners are set up once
        updateNavigationButtons();
    }

    /**
     * Update navigation button states
     */
    function updateNavigationButtons() {
        const prevButton = document.getElementById('elevation-day-prev');
        const nextButton = document.getElementById('elevation-day-next');
        const dayDisplay = document.getElementById('elevation-day-display');

        if (!prevButton || !nextButton || !dayDisplay) return;

        if (state.availableDays.length === 0) {
            prevButton.disabled = true;
            nextButton.disabled = true;
            dayDisplay.textContent = 'No data available';
            return;
        }

        // Enable/disable buttons based on position
        // Left arrow (back) disabled when at the earliest day (highest index)
        prevButton.disabled = state.selectedDayIndex >= state.availableDays.length - 1;
        // Right arrow (forward) disabled when at the most recent day (lowest index = 0)
        nextButton.disabled = state.selectedDayIndex <= 0;

        // Update day display
        if (state.selectedDay && state.selectedDayIndex >= 0) {
            dayDisplay.textContent = formatDate(state.selectedDay);
        } else {
            dayDisplay.textContent = '—';
        }
    }

    /**
     * Select a day by index
     */
    async function selectDayByIndex(index) {
        if (index < 0 || index >= state.availableDays.length) return;
        
        const day = state.availableDays[index];
        state.selectedDayIndex = index;
        await selectDay(day);
    }

    /**
     * Select a day and load its elevation data
     */
    async function selectDay(day) {
        if (state.selectedDay === day) return;

        state.selectedDay = day;
        
        // Update day index with validation
        const dayIndex = state.availableDays.indexOf(day);
        if (dayIndex >= 0) {
            state.selectedDayIndex = dayIndex;
        } else {
            // Day not found in available days - reset to invalid state
            state.selectedDayIndex = -1;
            console.warn('[Elevation] Selected day not found in available days:', day);
        }

        // Update navigation buttons
        updateNavigationButtons();

        // Show loading state
        const placeholder = document.querySelector('.elevation-placeholder');
        if (placeholder) {
            placeholder.textContent = 'Loading elevation data...';
            placeholder.style.display = 'block';
        }

        // Hide chart container
        const chartContainer = document.querySelector('.elevation-chart-container');
        if (chartContainer) {
            chartContainer.style.display = 'none';
        }

        // Fetch and display elevation data
        const elevationData = await fetchElevationData(day);
        
        if (!elevationData || !elevationData.points || elevationData.points.length === 0) {
            if (placeholder) {
                placeholder.textContent = 'No elevation data available for this day.';
                placeholder.style.display = 'block';
            }
            updateMinMax(null, null);
            updateVerticalClimbed(null);
            updateVerticalLoss(null);
            return;
        }

        // Hide placeholder
        if (placeholder) {
            placeholder.style.display = 'none';
        }

        // Show chart container
        if (chartContainer) {
            chartContainer.style.display = 'block';
        }

        // Update stats
        updateMinMax(elevationData.minElevation, elevationData.maxElevation);
        updateVerticalClimbed(elevationData.verticalClimbed);
        updateVerticalLoss(elevationData.verticalLoss);

        // Update chart
        updateChart(elevationData);
    }

    /**
     * Update min/max elevation display
     */
    function updateMinMax(min, max) {
        const minEl = document.getElementById('elevation-min');
        const maxEl = document.getElementById('elevation-max');

        if (minEl) {
            minEl.textContent = min !== null ? min.toLocaleString() : '—';
        }
        if (maxEl) {
            maxEl.textContent = max !== null ? max.toLocaleString() : '—';
        }
    }

    /**
     * Update vertical climbed display
     */
    function updateVerticalClimbed(climbed) {
        const climbedEl = document.getElementById('elevation-climbed');

        if (climbedEl) {
            climbedEl.textContent = climbed !== null ? climbed.toLocaleString() : '—';
        }
    }

    /**
     * Update vertical loss display
     */
    function updateVerticalLoss(loss) {
        const lossEl = document.getElementById('elevation-loss');

        if (lossEl) {
            lossEl.textContent = loss !== null ? loss.toLocaleString() : '—';
        }
    }

    /**
     * Create chart options configuration (uses shared ChartUtils)
     */
    function createChartOptions(labels, yAxisMin, yAxisMax) {
        if (typeof ChartUtils !== 'undefined' && ChartUtils.createBaseChartOptions) {
            return ChartUtils.createBaseChartOptions({
                aspectRatio: 4.0,
                aspectRatioMobile: 2.5,
                showLegend: false,
                tooltipLabelCallback: function(context) {
                    return `Elevation: ${context.parsed.y.toLocaleString()} ft`;
                },
                labels: labels,
                yAxisMin: yAxisMin,
                yAxisMax: yAxisMax,
                yAxisCallback: function(value) {
                    return value.toLocaleString() + ' ft';
                },
                xAxisOptions: {
                    showGrid: true,
                    maxRotation: 45
                }
            });
        }
        
        // Fallback if ChartUtils not available
        const isMobile = (typeof Utils !== 'undefined' && Utils.isMobile) ? Utils.isMobile() : window.innerWidth <= 480;
        const aspectRatio = isMobile ? 2.5 : 4.0;
        return {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: aspectRatio,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(30, 58, 15, 0.9)',
                    padding: 12,
                    titleFont: { family: "'Cabin', sans-serif", size: 14, weight: 600 },
                    bodyFont: { family: "'Cabin', sans-serif", size: 13 },
                    borderColor: 'var(--earth-brown)',
                    borderWidth: 2,
                    callbacks: {
                        label: function(context) {
                            return `Elevation: ${context.parsed.y.toLocaleString()} ft`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: true, color: 'rgba(139, 111, 71, 0.1)' },
                    ticks: {
                        font: { family: "'Cabin', sans-serif", size: isMobile ? 10 : 12, weight: 500 },
                        color: 'var(--text-dark)',
                        maxRotation: isMobile ? 45 : 0,
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
                        callback: function(value) {
                            return value.toLocaleString() + ' ft';
                        },
                        padding: isMobile ? 5 : 10
                    }
                }
            },
            interaction: { intersect: false, mode: 'index' }
        };
    }

    /**
     * Update elevation chart
     */
    function updateChart(elevationData) {
        if (!elevationData || !elevationData.points || elevationData.points.length === 0) {
            return;
        }

        // Check if Chart.js is available
        if (typeof Chart === 'undefined') {
            console.error('[Elevation] Chart.js is not loaded.');
            return;
        }

        const canvas = document.getElementById('elevation-chart');
        if (!canvas) return;

        const chartContainer = document.querySelector('.elevation-chart-container');
        if (!chartContainer) return;

        // Set explicit canvas dimensions
        const containerWidth = chartContainer.offsetWidth;
        const containerHeight = chartContainer.offsetHeight || 400;

        canvas.width = containerWidth * window.devicePixelRatio;
        canvas.height = containerHeight * window.devicePixelRatio;
        canvas.style.width = containerWidth + 'px';
        canvas.style.height = containerHeight + 'px';

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error('[Elevation] Could not get 2d context from canvas');
            return;
        }

        // Prepare data
        const labels = elevationData.points.map(p => formatTime(p.time));
        const elevations = elevationData.points.map(p => p.elevation);

        // Calculate y-axis range
        const minElevation = Math.min(...elevations);
        const maxElevation = Math.max(...elevations);
        const elevationRange = maxElevation - minElevation;
        const yAxisMin = Math.floor(minElevation - elevationRange * 0.1);
        const yAxisMax = Math.ceil(maxElevation + elevationRange * 0.1);

        // Destroy existing chart if it exists
        if (state.chart) {
            state.chart.destroy();
            state.chart = null;
        }

        // Create new chart
        state.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Elevation',
                    data: elevations,
                    borderColor: '#3d6b2a',
                    backgroundColor: 'rgba(61, 107, 42, 0.1)',
                    borderWidth: 3,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    pointBackgroundColor: '#3d6b2a',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    tension: 0.3,
                    fill: true
                }]
            },
            options: createChartOptions(labels, yAxisMin, yAxisMax)
        });
    }

    /**
     * Initialize elevation module
     */
    async function initializeElevation() {
        // Set up day selector buttons (once)
        setupDaySelector();

        // Fetch available days
        const days = await fetchAvailableDays();
        state.availableDays = days;

        if (days.length === 0) {
            const placeholder = document.querySelector('.elevation-placeholder');
            if (placeholder) {
                placeholder.textContent = 'No elevation data available yet.';
                placeholder.style.display = 'block';
            }
            updateNavigationButtons();
            return;
        }

        // Update day selector display
        renderDaySelector(days);

        // Select first day (most recent) by default
        if (days.length > 0) {
            state.selectedDayIndex = 0;
            await selectDay(days[0]);
        } else {
            updateNavigationButtons();
        }
    }

    /**
     * Handle window resize
     */
    function handleResize() {
        if (state.chart) {
            state.chart.resize();
        }
    }

    // Initialize when DOM is ready
    (function init() {
        if (typeof Utils !== 'undefined' && Utils.ready) {
            Utils.ready(initializeElevation);
        } else if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeElevation);
        } else {
            initializeElevation();
        }
    })();

    // Handle window resize with standardized debouncing
    const debouncedHandleResize = (typeof Utils !== 'undefined' && Utils.debounce)
        ? Utils.debounce(handleResize, 200)
        : (function() {
            // Fallback debounce implementation
            let resizeTimeout = null;
            return function() {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(handleResize, 200);
            };
        })();
    
    window.addEventListener('resize', debouncedHandleResize);
})();

