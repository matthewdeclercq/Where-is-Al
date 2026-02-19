import { createErrorResponse, createSuccessResponse } from './responses.js';
import { validateEnvOrError, getOffTrailThreshold } from './utils.js';
import { loadHistoricalPoints, serializePoint } from './storage.js';
import { tagAndSnapPoints } from './trail-distance.js';
import { haversine } from './geo.js';

// Points handler — reads points from KV only (cron handles KML polling)
export async function handlePoints(request, env) {
  const START_DATE_STR = env.START_DATE;
  const USE_MOCK_DATA = env.USE_MOCK_DATA === 'true';

  const thresholdMiles = getOffTrailThreshold(env);

  if (USE_MOCK_DATA) {
    const mockPoints = generateMockPoints(START_DATE_STR, thresholdMiles);
    return createSuccessResponse({
      points: mockPoints,
      offTrailThreshold: thresholdMiles
    }, request, {
      'Cache-Control': 'public, max-age=300'
    });
  }

  const envError = validateEnvOrError(env, request, true);
  if (envError) return envError;

  try {
    const allPoints = await loadHistoricalPoints(START_DATE_STR, env);

    // Tag on/off trail and snap to trail in a single pass
    tagAndSnapPoints(allPoints, undefined, thresholdMiles);

    // Serialize points for response
    const responsePoints = allPoints.map(p => ({
      ...serializePoint(p),
      lastPingTime: p.lastPingTime ? (p.lastPingTime instanceof Date ? p.lastPingTime.toISOString() : p.lastPingTime) : undefined,
      stationaryPings: p.stationaryPings > 1 ? p.stationaryPings : undefined
    }));

    return createSuccessResponse({
      points: responsePoints,
      offTrailThreshold: thresholdMiles
    }, request, {
      'Cache-Control': 'public, max-age=300'
    });
  } catch (error) {
    return createErrorResponse(500, error.message, request, {
      'Cache-Control': 'no-cache'
    });
  }
}

// At 2.5 mph with a ping every 20 min, each ping covers ~0.833 miles
const HIKING_SPEED_MPH = 2.5;
const PING_INTERVAL_MIN = 20;
const MILES_PER_PING = HIKING_SPEED_MPH * PING_INTERVAL_MIN / 60;

function generateMockPoints(startDateStr, thresholdMiles) {
  if (!startDateStr) return [];

  // Anchor waypoints defining the route — real AT coordinates plus off-trail town stops.
  // Intermediate pings are interpolated between anchors at ~0.83mi intervals.
  const anchors = [
    // Day 0: Springer Mountain → Hawk Mountain Shelter (~8mi)
    { lat: 34.626693, lon: -84.193828, dayOffset: 0, elev: 3782 },
    { lat: 34.663426, lon: -84.133628, dayOffset: 0, elev: 3100 },
    { lat: 34.697000, lon: -84.078000, dayOffset: 0, elev: 3550 },

    // Day 1: Hawk Mountain → Neels Gap (~14mi, includes Blood Mountain)
    { lat: 34.720000, lon: -84.020000, dayOffset: 1, elev: 3200 },
    { lat: 34.738658, lon: -83.920314, dayOffset: 1, elev: 4458 },
    { lat: 34.745000, lon: -83.850000, dayOffset: 1, elev: 3650 },

    // Day 2: Neels Gap → Tesnatee Gap (~10mi, rolling ridges)
    { lat: 34.758000, lon: -83.800000, dayOffset: 2, elev: 3200 },
    { lat: 34.790000, lon: -83.730000, dayOffset: 2, elev: 2900 },
    { lat: 34.822451, lon: -83.660000, dayOffset: 2, elev: 3000 },

    // Day 3: Off-trail — Dahlonega, GA resupply
    { lat: 34.5329, lon: -83.9849, dayOffset: 3, elev: 1500, offTrail: true },
    { lat: 34.5335, lon: -83.9842, dayOffset: 3, elev: 1500, offTrail: true },

    // Day 4: Back on trail → Dicks Creek Gap (~12mi)
    { lat: 34.822451, lon: -83.793192, dayOffset: 4, elev: 3000 },
    { lat: 34.858000, lon: -83.720000, dayOffset: 4, elev: 3300 },
    { lat: 34.896435, lon: -83.628518, dayOffset: 4, elev: 3100 },

    // Day 5: Dicks Creek Gap → Muskrat Creek Shelter (~13mi)
    { lat: 34.930000, lon: -83.610000, dayOffset: 5, elev: 3300 },
    { lat: 34.969694, lon: -83.593826, dayOffset: 5, elev: 3400 },
    { lat: 35.010000, lon: -83.565000, dayOffset: 5, elev: 3800 },

    // Day 6: Off-trail — Hiawassee, GA zero day
    { lat: 34.9502, lon: -83.7578, dayOffset: 6, elev: 1900, offTrail: true },
    { lat: 34.9510, lon: -83.7560, dayOffset: 6, elev: 1900, offTrail: true },

    // Day 7: Back on trail → Rock Gap (~11mi)
    { lat: 35.044825, lon: -83.548652, dayOffset: 7, elev: 4200 },
    { lat: 35.090000, lon: -83.510000, dayOffset: 7, elev: 4500 },
    { lat: 35.131633, lon: -83.481813, dayOffset: 7, elev: 3800 },

    // Day 8: Off-trail — Franklin, NC zero day
    { lat: 35.1822, lon: -83.3815, dayOffset: 8, elev: 2100, offTrail: true },
    { lat: 35.1825, lon: -83.3810, dayOffset: 8, elev: 2100, offTrail: true },

    // Day 9: Winding Stair Gap → Wayah Bald (~11mi, big climb)
    { lat: 35.131633, lon: -83.554168, dayOffset: 9, elev: 4500 },
    { lat: 35.160000, lon: -83.565000, dayOffset: 9, elev: 4800 },
    { lat: 35.181013, lon: -83.561199, dayOffset: 9, elev: 5040 },

    // Day 10: Wayah Bald → Wesser (~14mi, big descent into Nantahala)
    { lat: 35.220000, lon: -83.570000, dayOffset: 10, elev: 4800 },
    { lat: 35.265472, lon: -83.571020, dayOffset: 10, elev: 4000 },
    { lat: 35.322742, lon: -83.587340, dayOffset: 10, elev: 1723 },

    // Day 11: Off-trail — Bryson City, NC resupply
    { lat: 35.4312, lon: -83.4496, dayOffset: 11, elev: 1740, offTrail: true },
    { lat: 35.4318, lon: -83.4490, dayOffset: 11, elev: 1740, offTrail: true },

    // Day 12: Stecoah Gap → Fontana Dam area (~14mi)
    { lat: 35.363242, lon: -83.716218, dayOffset: 12, elev: 3200 },
    { lat: 35.395000, lon: -83.750000, dayOffset: 12, elev: 2700 },
    { lat: 35.409373, lon: -83.765050, dayOffset: 12, elev: 2100 },
  ];

  // Group anchors by day
  const dayGroups = {};
  for (const wp of anchors) {
    if (!dayGroups[wp.dayOffset]) dayGroups[wp.dayOffset] = [];
    dayGroups[wp.dayOffset].push(wp);
  }

  const points = [];
  const startBase = new Date(startDateStr + 'T08:00:00Z');

  for (const dayOffset of Object.keys(dayGroups).map(Number).sort((a, b) => a - b)) {
    const dayAnchors = dayGroups[dayOffset];
    let currentTime = new Date(startBase);
    currentTime.setUTCDate(currentTime.getUTCDate() + dayOffset);

    for (let i = 0; i < dayAnchors.length - 1; i++) {
      const from = dayAnchors[i];
      const to = dayAnchors[i + 1];

      if (from.offTrail) {
        // Town stop: just emit the from point, no interpolation needed
        points.push({
          lat: from.lat, lon: from.lon,
          time: new Date(currentTime).toISOString(),
          elevation: from.elev,
          onTrail: false
        });
        currentTime = new Date(currentTime.getTime() + PING_INTERVAL_MIN * 60 * 1000);
      } else {
        // On-trail: interpolate between anchors at ~0.83mi per ping
        const dist = haversine(from.lat, from.lon, to.lat, to.lon);
        const numPings = Math.max(1, Math.round(dist / MILES_PER_PING));
        for (let j = 0; j < numPings; j++) {
          const t = j / numPings;
          points.push({
            lat: from.lat + t * (to.lat - from.lat),
            lon: from.lon + t * (to.lon - from.lon),
            time: new Date(currentTime).toISOString(),
            elevation: Math.round(from.elev + t * (to.elev - from.elev)),
            onTrail: true
          });
          currentTime = new Date(currentTime.getTime() + PING_INTERVAL_MIN * 60 * 1000);
        }
      }
    }

    // Emit the final anchor of the day
    const last = dayAnchors[dayAnchors.length - 1];
    points.push({
      lat: last.lat, lon: last.lon,
      time: new Date(currentTime).toISOString(),
      elevation: last.elev,
      onTrail: !last.offTrail
    });
  }

  return points;
}
