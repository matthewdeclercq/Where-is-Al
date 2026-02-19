// Elevation Profile Module - Fetches and displays elevation profile for selected day
(function() {
    'use strict';

    // Configuration
    const ElevationConfig = {
        workerUrl: Utils.getConfig('workerUrl', 'https://where-is-al.matthew-declercq.workers.dev/'),
        refreshInterval: Utils.getConfig('refreshIntervals.elevation', 3600000)
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
     */
    function formatDate(dateString) {
        return window.DateUtils.formatDate(dateString, true); // Use UTC
    }

    /**
     * Format time for chart labels (uses shared DateUtils)
     */
    function formatTime(timeString) {
        return window.DateUtils.formatTime(timeString);
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

        try {
            const data = await window.ApiClient.fetch(
                `${ElevationConfig.workerUrl}elevation`,
                { method: 'GET' },
                {
                    onSuccess: () => {},
                    onError: (error) => {
                        console.error('[Elevation] Failed to fetch available days:', error);
                    }
                },
                state
            );
            return data?.days || [];
        } catch {
            return [];
        }
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

        try {
            const data = await window.ApiClient.fetch(
                `${ElevationConfig.workerUrl}elevation?day=${day}`,
                { method: 'GET' },
                {
                    onSuccess: () => {},
                    onError: (error) => {
                        console.error('[Elevation] Failed to fetch elevation data:', error);
                    }
                },
                state
            );
            return data ?? null;
        } catch {
            return null;
        }
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
        const dailyContent = document.getElementById('daily-performance-content');
        if (placeholder) {
            placeholder.textContent = 'Loading elevation data...';
            placeholder.style.display = 'block';
        }
        if (dailyContent) dailyContent.style.display = 'none';

        // Hide chart container
        const chartContainer = document.querySelector('.elevation-chart-container');
        if (chartContainer) {
            chartContainer.style.display = 'none';
        }

        // Fetch and display elevation data
        const elevationData = await fetchElevationData(day);

        // Ignore stale response if user switched to a different day while fetching
        if (state.selectedDay !== day) {
            return;
        }

        const clearChart = () => {
            if (state.chart) {
                state.chart.destroy();
                state.chart = null;
            }
            if (chartContainer) chartContainer.style.display = 'none';
            if (dailyContent) dailyContent.style.display = 'none';
            updateMinMax(null, null);
            updateVerticalClimbed(null);
            updateVerticalLoss(null);
        };

        const filteredPoints = (!elevationData || !elevationData.points)
            ? []
            : filterDaytimePoints(elevationData.points);

        if (filteredPoints.length === 0) {
            if (placeholder) {
                placeholder.textContent = 'No hiking data recorded for this day.';
                placeholder.style.display = 'block';
            }
            clearChart();
            return;
        }

        // Hide placeholder, show daily content and chart
        if (placeholder) placeholder.style.display = 'none';
        if (dailyContent) dailyContent.style.display = 'block';
        if (chartContainer) chartContainer.style.display = 'block';

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

    /**
     * Filter points to only include data from 6am to 8pm
     */
    function filterDaytimePoints(points) {
        if (!points || points.length === 0) return [];
        
        return points.filter(point => {
            if (!point.time) return false;
            const date = new Date(point.time);
            const hour = parseInt(
                new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' })
                    .format(date), 10
            );
            // Include points from 6am (6) to 8pm (20, inclusive)
            return hour >= 6 && hour <= 20;
        });
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

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error('[Elevation] Could not get 2d context from canvas');
            return;
        }

        // Filter points to only show data from 6am to 8pm
        const filteredPoints = filterDaytimePoints(elevationData.points);
        if (filteredPoints.length === 0) return; // Already handled by selectDay

        // Prepare data from filtered points
        const labels = filteredPoints.map(p => formatTime(p.time));
        const elevations = filteredPoints.map(p => p.elevation);

        // Calculate y-axis range
        const minElevation = Math.min(...elevations);
        const maxElevation = Math.max(...elevations);
        const elevationRange = maxElevation - minElevation;
        const padding = elevationRange === 0 ? 5 : elevationRange * 0.1;
        const yAxisMin = Math.floor(minElevation - padding);
        const yAxisMax = Math.ceil(maxElevation + padding);

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
     * Refresh the currently selected day's elevation data (used for visibility/auto-refresh)
     */
    async function fetchElevation() {
        if (state.selectedDay) {
            const prevDay = state.selectedDay;
            state.selectedDay = null; // Clear to force re-fetch in selectDay
            await selectDay(prevDay);
        }
    }

    /**
     * Setup automatic refresh
     */
    function setupAutoRefresh() {
        window.ApiClient.setupAutoRefresh(fetchElevation, ElevationConfig.refreshInterval, state);
    }

    /**
     * Handle page visibility changes
     */
    function handleVisibilityChange() {
        window.ApiClient.handleVisibilityChange(fetchElevation, setupAutoRefresh, state);
    }

    /**
     * Cleanup on page unload
     */
    function cleanup() {
        window.ApiClient.cleanup(state);
        Utils.VisibilityManager.unregister(handleVisibilityChange);
        if (state.chart) {
            state.chart.destroy();
            state.chart = null;
        }
        window.removeEventListener('resize', debouncedHandleResize);
    }

    /**
     * Initialize elevation module
     */
    async function initializeElevation() {
        // Set up day selector buttons (once)
        setupDaySelector();

        // Fetch available days
        const days = await fetchAvailableDays();

        // Add today (local date) as first option if not already present
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        if (!days.includes(todayStr)) {
            days.unshift(todayStr);
        }
        // Deduplicate
        state.availableDays = [...new Set(days)];

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

    // Handle window resize with standardized debouncing
    const debouncedHandleResize = Utils.debounce(handleResize, 200);

    // Initialize when DOM is ready
    Utils.ready(initializeElevation);

    // Register visibility change handler
    Utils.VisibilityManager.register(handleVisibilityChange);

    // Cleanup on page unload
    window.addEventListener('beforeunload', cleanup);

    window.addEventListener('resize', debouncedHandleResize);
})();

