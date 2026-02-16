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
        trailColor: '#1d4ed8',
        trailWeight: 4,
        trailOpacity: 0.85,
        onTrailColor: '#e6198a',
        offTrailColor: '#ff4400',
        currentPositionColor: '#facc15',
        currentPositionBorder: '#1a1a1a',
        routeLineColor: '#e6198a',
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
    let trailLayer = null;
    let milestonesLayer = null;
    let pointsLayer = null;
    let routeLineLayer = null;
    let currentMarker = null;
    let trailDataLoaded = false;
    let milestonesDataLoaded = false;

    function addFullscreenControl() {
        var FullscreenControl = L.Control.extend({
            options: { position: 'topleft' },
            onAdd: function() {
                var container = L.DomUtil.create('div', 'leaflet-bar leaflet-control map-fullscreen-control');
                var button = L.DomUtil.create('a', 'map-fullscreen-button', container);
                button.href = '#';
                button.title = 'Toggle fullscreen';
                button.setAttribute('role', 'button');
                button.setAttribute('aria-label', 'Toggle fullscreen');
                button.innerHTML = '<i class="fas fa-expand"></i>';

                L.DomEvent.disableClickPropagation(container);
                L.DomEvent.on(button, 'click', function(e) {
                    L.DomEvent.preventDefault(e);
                    toggleFullscreen(button);
                });

                return container;
            }
        });
        map.addControl(new FullscreenControl());
    }

    function toggleFullscreen(button) {
        var wrapper = document.querySelector('.map-section');
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
            zoomControl: true,
            scrollWheelZoom: true
        });

        // Add tile layer
        L.tileLayer(MapConfig.tileUrl, {
            attribution: MapConfig.tileAttribution,
            maxZoom: 17,
            subdomains: 'abc'
        }).addTo(map);

        // Add fullscreen control
        addFullscreenControl();

        // Load trail and milestones in parallel, then fetch points
        loadTrailData();
        loadMilestones();
        fetchPoints();

        // Setup auto-refresh
        setupAutoRefresh();

        // Handle Escape key to exit fullscreen
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                var wrapper = document.querySelector('.map-section.map-fullscreen');
                if (wrapper) {
                    var btn = wrapper.querySelector('.map-fullscreen-button');
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
                trailDataLoaded = true;
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
                        html: '<i class="fas fa-mountain" style="color: #a78bfa;"></i>',
                        iconSize: [20, 20],
                        iconAnchor: [10, 10]
                    });

                    var popupContent = '<strong>' + ms.name + '</strong>' +
                        '<div class="popup-state">' + ms.state + '</div>' +
                        '<div>' + ms.description + '</div>';

                    L.marker([ms.lat, ms.lon], { icon: icon })
                        .bindPopup(popupContent, { maxWidth: 250 })
                        .addTo(milestonesLayer);
                });

                milestonesLayer.addTo(map);
                milestonesDataLoaded = true;
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
                    (isOnTrail ? '' : '<div style="color: #999; font-style: italic;">Off trail</div>');

                currentMarker.bindPopup(popupContent, { maxWidth: 250 });
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
                    '<div style="color: ' + color + ';">' + statusStr + '</div>',
                    { maxWidth: 200 }
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

        // Auto-fit bounds to all points
        var allCoords = points.map(function(p) { return [p.lat, p.lon]; });
        if (allCoords.length > 0) {
            var bounds = L.latLngBounds(allCoords);
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
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
