// Shared Chart Utilities for Where Is Al
// Provides common Chart.js configuration and utilities
(function() {
    'use strict';

    /**
     * Check if current device is mobile
     * @returns {boolean} True if mobile device
     */
    function isMobile() {
        return Utils.isMobile();
    }

    /**
     * Get base tooltip configuration
     * @returns {Object} Tooltip configuration object
     */
    function getBaseTooltipConfig() {
        return {
            backgroundColor: 'rgba(30, 58, 15, 0.9)',
            padding: 12,
            titleFont: {
                family: "'Cabin', sans-serif",
                size: 14,
                weight: 600
            },
            bodyFont: {
                family: "'Cabin', sans-serif",
                size: 13
            },
            borderColor: 'var(--earth-brown)',
            borderWidth: 2
        };
    }

    /**
     * Get base font configuration for chart elements
     * @param {number} mobileSize - Font size for mobile (default: 10)
     * @param {number} desktopSize - Font size for desktop (default: 12)
     * @returns {Object} Font configuration object
     */
    function getBaseFontConfig(mobileSize = 10, desktopSize = 12) {
        const mobile = isMobile();
        return {
            family: "'Cabin', sans-serif",
            size: mobile ? mobileSize : desktopSize
        };
    }

    /**
     * Get base tick configuration for x-axis
     * @param {Array} labels - Array of label strings
     * @param {Object} options - Additional options
     * @param {boolean} options.showGrid - Whether to show grid (default: false)
     * @param {number} options.maxRotation - Max rotation for labels (default: 0)
     * @returns {Object} X-axis ticks configuration
     */
    function getXTicksConfig(labels, options = {}) {
        const mobile = isMobile();
        const { showGrid = false, maxRotation = 0 } = options;
        
        const config = {
            font: getBaseFontConfig(10, 12),
            color: 'var(--text-dark)',
            padding: mobile ? 5 : 10
        };

        // Special handling for "Today" label highlighting (if labels contain "Today")
        if (labels && labels.some(label => label === 'Today')) {
            config.font = function(context) {
                const label = labels[context.index];
                return {
                    family: "'Cabin', sans-serif",
                    size: mobile ? 10 : 12,
                    weight: label === 'Today' ? 700 : 600
                };
            };
            config.color = function(context) {
                const label = labels[context.index];
                return label === 'Today' ? '#1e3a0f' : 'var(--earth-brown-dark)';
            };
        }

        if (maxRotation > 0) {
            config.maxRotation = mobile ? maxRotation : 0;
        }

        return config;
    }

    /**
     * Get base tick configuration for y-axis
     * @param {Function} callback - Callback function for formatting tick values
     * @param {Object} options - Additional options
     * @returns {Object} Y-axis ticks configuration
     */
    function getYTicksConfig(callback, options = {}) {
        const mobile = isMobile();
        return {
            font: getBaseFontConfig(10, 12),
            color: 'var(--text-dark)',
            callback: callback,
            padding: mobile ? 5 : 10
        };
    }

    /**
     * Create base chart options configuration
     * @param {Object} options - Chart options
     * @param {number} options.aspectRatio - Aspect ratio for chart (default: 3.2)
     * @param {number} options.aspectRatioMobile - Aspect ratio for mobile (default: 1.8)
     * @param {boolean} options.showLegend - Whether to show legend (default: false)
     * @param {Function} options.tooltipLabelCallback - Custom tooltip label callback
     * @param {Array} options.labels - Array of label strings for x-axis
     * @param {number} options.yAxisMin - Minimum value for y-axis
     * @param {number} options.yAxisMax - Maximum value for y-axis
     * @param {Function} options.yAxisCallback - Callback for y-axis tick formatting
     * @param {Object} options.xAxisOptions - Additional x-axis options
     * @returns {Object} Chart options configuration
     */
    function createBaseChartOptions(options = {}) {
        const {
            aspectRatio = 3.2,
            aspectRatioMobile = 1.8,
            showLegend = false,
            tooltipLabelCallback,
            labels = [],
            yAxisMin,
            yAxisMax,
            yAxisCallback,
            xAxisOptions = {}
        } = options;

        const mobile = isMobile();
        const finalAspectRatio = mobile ? aspectRatioMobile : aspectRatio;

        const tooltipConfig = getBaseTooltipConfig();
        if (tooltipLabelCallback) {
            tooltipConfig.callbacks = {
                label: tooltipLabelCallback
            };
        }

        const chartOptions = {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: finalAspectRatio,
            plugins: {
                legend: {
                    display: showLegend,
                    position: 'top',
                    onClick: showLegend ? null : undefined,
                    labels: showLegend ? {
                        usePointStyle: true,
                        padding: mobile ? 10 : 15,
                        font: {
                            family: "'Cabin', sans-serif",
                            size: mobile ? 12 : 14,
                            weight: 600
                        },
                        color: 'var(--text-dark)'
                    } : undefined
                },
                tooltip: tooltipConfig
            },
            scales: {
                x: {
                    grid: {
                        display: xAxisOptions.showGrid !== undefined ? xAxisOptions.showGrid : false,
                        color: xAxisOptions.showGrid ? 'rgba(139, 111, 71, 0.1)' : undefined
                    },
                    ticks: getXTicksConfig(labels, {
                        showGrid: xAxisOptions.showGrid,
                        maxRotation: xAxisOptions.maxRotation || 0
                    })
                },
                y: {
                    beginAtZero: false,
                    min: yAxisMin,
                    max: yAxisMax,
                    grid: {
                        color: 'rgba(139, 111, 71, 0.2)',
                        lineWidth: 1
                    },
                    ticks: getYTicksConfig(yAxisCallback)
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        };

        return chartOptions;
    }

    /**
     * Create point styling arrays based on labels (for highlighting specific points)
     * @param {Array} labels - Array of label strings
     * @param {string} highlightLabel - Label to highlight (e.g., "Today")
     * @param {number} baseRadius - Base point radius
     * @param {number} highlightRadius - Highlighted point radius
     * @returns {Array} Array of point radii
     */
    function createPointStyling(labels, highlightLabel, baseRadius, highlightRadius) {
        return labels.map(label => label === highlightLabel ? highlightRadius : baseRadius);
    }

    /**
     * Create point border styling arrays
     * @param {Array} labels - Array of label strings
     * @param {string} highlightLabel - Label to highlight
     * @param {number} baseBorder - Base border width
     * @param {number} highlightBorder - Highlighted border width
     * @returns {Array} Array of border widths
     */
    function createPointBorderStyling(labels, highlightLabel, baseBorder, highlightBorder) {
        return labels.map(label => label === highlightLabel ? highlightBorder : baseBorder);
    }

    // Export utilities to global scope
    window.ChartUtils = {
        createBaseChartOptions: createBaseChartOptions,
        createPointStyling: createPointStyling,
        createPointBorderStyling: createPointBorderStyling
    };
})();

