// Interactive Leaflet Map Module for Where Is Al
(function() {
    'use strict';

    const MapConfig = {
        refreshInterval: Utils.getConfig('refreshIntervals.map', 1800000),
        workerUrl: Utils.getConfig('workerUrl', ''),
        tileUrl: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        tileAttribution: 'Map data: &copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors, ' +
            '<a href="http://viewfinderpanoramas.org">SRTM</a> | ' +
            'Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> ' +
            '(<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
        trailColor: '#1e40af',
        trailWeight: 4,
        trailOpacity: 0.85,
        onTrailColor: '#06b6d4',
        offTrailColor: '#f97316',
        currentPositionColor: '#facc15',
        currentPositionBorder: '#1a1a1a',
        routeLineColor: '#06b6d4',
        defaultCenter: [37.0, -79.5],
        defaultZoom: 6
    };

    // Module state
    const state = {
        refreshIntervalId: null,
        isLoading: false,
        errorCount: 0,
        backoffDelay: 0
    };

    let map = null;
    let mapSection = null;
    let trailLayer = null;
    let milestonesLayer = null;
    let pointsLayer = null;
    let routeLineLayer = null;
    let currentMarker = null;
    let hasInitiallyFocused = false;

    function createMapControl(options) {
        var Control = L.Control.extend({
            options: { position: 'topright' },
            onAdd: function() {
                var container = L.DomUtil.create('div', 'leaflet-bar leaflet-control' + (options.containerClass ? ' ' + options.containerClass : ''));
                var button = L.DomUtil.create('a', 'map-fullscreen-button', container);
                button.href = '#';
                button.title = options.title;
                button.setAttribute('role', 'button');
                button.setAttribute('aria-label', options.title);
                button.innerHTML = options.innerHTML;

                L.DomEvent.disableClickPropagation(container);
                L.DomEvent.on(button, 'click', function(e) {
                    L.DomEvent.preventDefault(e);
                    options.onClick(button);
                });

                return container;
            }
        });
        map.addControl(new Control());
    }

    function addFullscreenControl() {
        createMapControl({
            containerClass: 'map-fullscreen-control',
            title: 'Toggle fullscreen',
            innerHTML: '<i class="fas fa-expand"></i>',
            onClick: toggleFullscreen
        });
    }

    function addLocateControl() {
        createMapControl({
            title: 'Go to current location',
            innerHTML: '<i class="fas fa-crosshairs"></i>',
            onClick: function() { flyToCurrentLocation(); }
        });
    }

    function flyToCurrentLocation() {
        if (currentMarker) {
            map.flyTo(currentMarker.getLatLng(), 13);
            currentMarker.openPopup();
        }
    }

    function toggleFullscreen(button) {
        var wrapper = mapSection;
        if (!wrapper) return;

        if (wrapper.classList.contains('map-fullscreen')) {
            // Exit fullscreen
            wrapper.classList.remove('map-fullscreen');
            document.body.style.overflow = '';
            button.innerHTML = '<i class="fas fa-expand"></i>';
            button.title = 'Enter fullscreen';
        } else {
            // Enter fullscreen — scroll to top first so Leaflet's cached
            // container offset doesn't cause a stale viewport calculation
            window.scrollTo(0, 0);
            wrapper.classList.add('map-fullscreen');
            document.body.style.overflow = 'hidden';
            button.innerHTML = '<i class="fas fa-compress"></i>';
            button.title = 'Exit fullscreen';
        }

        // Leaflet caches the container's page offset. After toggling
        // position:fixed the cached offset is stale, so tiles render
        // for the wrong viewport. Force an immediate + deferred reset.
        if (map) {
            map.invalidateSize({ animate: false, pan: false });
            // Second call after the layout fully settles
            setTimeout(function() {
                if (map) {
                    map.invalidateSize({ animate: false, pan: false });
                    map.fire('moveend');
                }
            }, 50);
        }
    }

    function initializeMap() {
        const container = document.getElementById('leaflet-map');
        if (!container) {
            console.warn('[Map] #leaflet-map container not found');
            return;
        }

        // Initialize Leaflet map
        map = L.map('leaflet-map', {
            center: MapConfig.defaultCenter,
            zoom: MapConfig.defaultZoom,
            zoomControl: false,
            scrollWheelZoom: true
        });
        L.control.zoom({ position: 'topright' }).addTo(map);

        // Add tile layer
        L.tileLayer(MapConfig.tileUrl, {
            attribution: MapConfig.tileAttribution,
            maxZoom: 17,
            subdomains: 'abc'
        }).addTo(map);

        // Add fullscreen control
        addFullscreenControl();

        // Add "go to current location" control
        addLocateControl();

        // Load trail and milestones in parallel, then fetch points
        loadTrailData();
        loadMilestones();
        fetchPoints();

        // Setup auto-refresh
        setupAutoRefresh();

        // Cache map section element
        mapSection = document.querySelector('.map-section');

        // Handle Escape key to exit fullscreen
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                if (mapSection && mapSection.classList.contains('map-fullscreen')) {
                    var btn = mapSection.querySelector('.map-fullscreen-button');
                    if (btn) toggleFullscreen(btn);
                }
            }
        });

        // Handle resize
        var resizeHandler = Utils.debounce(function() {
            if (map) {
                map.invalidateSize();
            }
        }, 200);
        window.addEventListener('resize', resizeHandler);
    }

    function loadTrailData() {
        fetch('data/at-trail.geojson')
            .then(function(response) {
                if (!response.ok) throw new Error('Failed to load trail GeoJSON');
                return response.json();
            })
            .then(function(geojson) {
                trailLayer = L.geoJSON(geojson, {
                    style: {
                        color: MapConfig.trailColor,
                        weight: MapConfig.trailWeight,
                        opacity: MapConfig.trailOpacity,
                        lineCap: 'round',
                        lineJoin: 'round'
                    }
                }).addTo(map);
            })
            .catch(function(error) {
                console.error('[Map] Failed to load trail data:', error);
            });
    }

    function loadMilestones() {
        fetch('data/milestones.json')
            .then(function(response) {
                if (!response.ok) throw new Error('Failed to load milestones');
                return response.json();
            })
            .then(function(milestones) {
                milestonesLayer = L.layerGroup();

                milestones.forEach(function(ms) {
                    var icon = L.divIcon({
                        className: 'milestone-icon',
                        html: '<i class="fas fa-mountain" style="color: #f59e0b;"></i>',
                        iconSize: [26, 26],
                        iconAnchor: [13, 13]
                    });

                    var popupContent = '<strong>' + ms.name + '</strong>' +
                        '<div class="popup-state">' + ms.state + '</div>' +
                        '<div>' + ms.description + '</div>';

                    L.marker([ms.lat, ms.lon], { icon: icon })
                        .bindPopup(popupContent, { maxWidth: 250 })
                        .addTo(milestonesLayer);
                });

                milestonesLayer.addTo(map);
            })
            .catch(function(error) {
                console.error('[Map] Failed to load milestones:', error);
            });
    }

    function fetchPoints() {
        var url = MapConfig.workerUrl + 'points';

        window.ApiClient.fetch(url, { method: 'GET' }, {
            onSuccess: function(data) {
                renderPoints(data.points || []);
            },
            onError: function(error) {
                console.error('[Map] Failed to fetch points:', error.message);
            }
        }, state);
    }

    function formatIdleInfo(point) {
        if (!point.lastPingTime || !point.time) return '';
        var first = new Date(point.time);
        var last = new Date(point.lastPingTime);
        var diffMs = last - first;
        if (diffMs <= 0) return '';

        var hours = Math.floor(diffMs / 3600000);
        var mins = Math.floor((diffMs % 3600000) / 60000);
        var durationStr = hours > 0 ? hours + 'h ' + mins + 'm' : mins + 'm';

        return '<div class="popup-idle">' +
            '<div style="margin-top:4px; padding-top:4px; border-top:1px solid rgba(255,255,255,0.15);">' +
            '<div style="color: #facc15; font-weight: 600;">Idle ' + durationStr + '</div>' +
            '<div>First ping: ' + first.toLocaleString() + '</div>' +
            '<div>Last ping: ' + last.toLocaleString() + '</div>' +
            '<div style="color: #999;">' + point.stationaryPings + ' pings from this spot</div>' +
            '</div></div>';
    }

    function renderPoints(points) {
        // Clear existing point layers
        if (pointsLayer) {
            map.removeLayer(pointsLayer);
        }
        if (routeLineLayer) {
            map.removeLayer(routeLineLayer);
        }
        if (currentMarker) {
            map.removeLayer(currentMarker);
        }

        if (!points || points.length === 0) {
            return;
        }

        pointsLayer = L.layerGroup();

        // Separate on-trail and off-trail points
        var onTrailCoords = [];

        points.forEach(function(point, index) {
            var isLast = index === points.length - 1;
            var isOnTrail = point.onTrail !== false;

            if (isLast) {
                // Most recent point - large bright marker with dark border
                var pointAge = point.time ? (Date.now() - new Date(point.time).getTime()) : Infinity;
                var isRecent = pointAge < 24 * 60 * 60 * 1000; // within 24 hours
                var positionLabel = isRecent ? 'Current Position' : 'Last Known Position';

                currentMarker = L.circleMarker([point.lat, point.lon], {
                    radius: 12,
                    fillColor: MapConfig.currentPositionColor,
                    color: MapConfig.currentPositionBorder,
                    weight: 3,
                    opacity: 1,
                    fillOpacity: 1
                });

                var timeStr = point.time ? new Date(point.time).toLocaleString() : 'Unknown';
                var elevStr = point.elevation != null ? point.elevation + ' ft' : 'N/A';
                var popupContent = '<strong>' + positionLabel + '</strong>' +
                    '<div class="popup-time">' + timeStr + '</div>' +
                    '<div>Elevation: ' + elevStr + '</div>' +
                    (isOnTrail ? '' : '<div style="color: #999; font-style: italic;">Off trail</div>') +
                    formatIdleInfo(point);

                currentMarker.bindPopup(popupContent, { maxWidth: 280 });
                currentMarker.addTo(map);
            } else {
                // Regular point
                var color = isOnTrail ? MapConfig.onTrailColor : MapConfig.offTrailColor;
                var radius = isOnTrail ? 7 : 8;
                var borderColor = isOnTrail ? '#ffffff' : '#1a1a1a';

                var marker = L.circleMarker([point.lat, point.lon], {
                    radius: radius,
                    fillColor: color,
                    color: borderColor,
                    weight: 2,
                    opacity: 0.9,
                    fillOpacity: 0.9
                });

                var timeStr = point.time ? new Date(point.time).toLocaleString() : 'Unknown';
                var elevStr = point.elevation != null ? point.elevation + ' ft' : 'N/A';
                var statusStr = isOnTrail ? 'On trail' : 'Off trail';
                marker.bindPopup(
                    '<div class="popup-time">' + timeStr + '</div>' +
                    '<div>Elevation: ' + elevStr + '</div>' +
                    '<div style="color: ' + color + ';">' + statusStr + '</div>' +
                    formatIdleInfo(point),
                    { maxWidth: 250 }
                );

                marker.addTo(pointsLayer);
            }

            // Collect on-trail coordinates for route line
            if (isOnTrail) {
                onTrailCoords.push([point.lat, point.lon]);
            }
        });

        pointsLayer.addTo(map);

        // Draw dashed route line through on-trail points
        if (onTrailCoords.length > 1) {
            routeLineLayer = L.polyline(onTrailCoords, {
                color: MapConfig.routeLineColor,
                weight: 3,
                opacity: 0.8,
                dashArray: '10, 6',
                lineCap: 'round'
            }).addTo(map);
        }

        // On first load, center on current position
        if (!hasInitiallyFocused && currentMarker) {
            map.setView(currentMarker.getLatLng(), 13);
            hasInitiallyFocused = true;
        }

        // Update tracker status indicator
        updateTrackerStatus(points);
    }

    function updateTrackerStatus(points) {
        var dot = document.getElementById('tracker-status-dot');
        var label = document.getElementById('tracker-status-label');
        if (!dot || !label) return;

        var lastPoint = points.length > 0 ? points[points.length - 1] : null;
        var THIRTY_MIN = 30 * 60 * 1000;

        if (lastPoint && lastPoint.time) {
            var age = Date.now() - new Date(lastPoint.time).getTime();
            if (age < THIRTY_MIN) {
                dot.className = 'tracker-status-dot tracker-on';
                label.textContent = 'Tracker: ON';
            } else {
                dot.className = 'tracker-status-dot tracker-off';
                label.textContent = 'Tracker: OFF';
            }
        } else {
            dot.className = 'tracker-status-dot tracker-off';
            label.textContent = 'Tracker: OFF';
        }
    }

    function setupAutoRefresh() {
        window.ApiClient.setupAutoRefresh(fetchPoints, MapConfig.refreshInterval, state);
    }

    function handleVisibilityChange() {
        window.ApiClient.handleVisibilityChange(fetchPoints, setupAutoRefresh, state);
    }

    function cleanup() {
        window.ApiClient.cleanup(state);
        Utils.VisibilityManager.unregister(handleVisibilityChange);
        if (map) {
            map.remove();
            map = null;
        }
    }

    // Initialize when DOM is ready
    Utils.ready(initializeMap);

    // Register visibility change handler
    Utils.VisibilityManager.register(handleVisibilityChange);

    // Cleanup on page unload
    window.addEventListener('beforeunload', cleanup);
})();
