import { createErrorResponse, createSuccessResponse } from './responses.js';
import { validateEnvVars } from './utils.js';
import { loadHistoricalPoints } from './storage.js';
import { tagPointsOnOffTrail } from './trail-proximity.js';
import { AT_TRAIL_COORDS } from './at-trail-simplified.js';
import { DEFAULT_OFF_TRAIL_THRESHOLD_MILES } from './constants.js';
import { snapPointsToTrail } from './trail-distance.js';

// Points handler — reads points from KV only (cron handles KML polling)
export async function handlePoints(request, env) {
  const START_DATE_STR = env.START_DATE;
  const USE_MOCK_DATA = env.USE_MOCK_DATA === 'true';

  const thresholdMiles = env.OFF_TRAIL_THRESHOLD
    ? parseFloat(env.OFF_TRAIL_THRESHOLD)
    : DEFAULT_OFF_TRAIL_THRESHOLD_MILES;

  if (USE_MOCK_DATA) {
    const mockPoints = generateMockPoints(START_DATE_STR, thresholdMiles);
    return createSuccessResponse({
      points: mockPoints,
      offTrailThreshold: thresholdMiles
    }, request, {
      'Cache-Control': 'public, max-age=300'
    });
  }

  const validationErrors = validateEnvVars(env, true);
  if (validationErrors.length > 0) {
    return createErrorResponse(500, validationErrors.join('; '), request, {
      'Cache-Control': 'no-cache'
    });
  }

  try {
    const allPoints = await loadHistoricalPoints(START_DATE_STR, env);

    // Tag on/off trail, then snap to get trail miles and elevation
    tagPointsOnOffTrail(allPoints, AT_TRAIL_COORDS, thresholdMiles);
    snapPointsToTrail(allPoints);

    // Serialize points for response
    const responsePoints = allPoints.map(p => ({
      lat: p.lat,
      lon: p.lon,
      time: p.time instanceof Date ? p.time.toISOString() : p.time,
      elevation: p.elevation !== undefined ? p.elevation : null,
      onTrail: p.onTrail,
      trailMile: p.trailMile !== undefined ? p.trailMile : null,
      trailElevation: p.trailElevation !== undefined ? p.trailElevation : null,
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

function generateMockPoints(startDateStr, thresholdMiles) {
  if (!startDateStr) return [];

  const points = [];
  const start = new Date(startDateStr + 'T08:00:00Z');

  // Real AT trail coordinates sampled from the GeoJSON, plus off-trail town stops
  const mockTrailPoints = [
    // Day 1: Springer Mountain start
    { lat: 34.626693, lon: -84.193828, dayOffset: 0, elev: 3782 },
    { lat: 34.638500, lon: -84.175000, dayOffset: 0, elev: 3450 },
    { lat: 34.663426, lon: -84.133628, dayOffset: 0, elev: 3100 },
    // Day 2
    { lat: 34.654985, lon: -84.044220, dayOffset: 1, elev: 3200 },
    { lat: 34.707898, lon: -83.984947, dayOffset: 1, elev: 3650 },
    // Day 3: Blood Mountain & Neels Gap
    { lat: 34.738658, lon: -83.920314, dayOffset: 2, elev: 4200 },
    { lat: 34.729384, lon: -83.832970, dayOffset: 2, elev: 3550 },
    // Off-trail: town resupply in Dahlonega (~10mi west of trail)
    { lat: 34.5329, lon: -83.9849, dayOffset: 3, elev: 1500, offTrail: true },
    // Day 4: back on trail
    { lat: 34.822451, lon: -83.793192, dayOffset: 4, elev: 3000 },
    { lat: 34.798050, lon: -83.691960, dayOffset: 4, elev: 2800 },
    // Day 5
    { lat: 34.896435, lon: -83.628518, dayOffset: 5, elev: 3100 },
    { lat: 34.969694, lon: -83.593826, dayOffset: 5, elev: 3400 },
    // Off-trail: hitched to Hiawassee, GA for zero day (~6mi from trail)
    { lat: 34.9502, lon: -83.7578, dayOffset: 6, elev: 1900, offTrail: true },
    { lat: 34.9510, lon: -83.7560, dayOffset: 6, elev: 1900, offTrail: true },
    // Day 7: back on trail
    { lat: 35.044825, lon: -83.548652, dayOffset: 7, elev: 4200 },
    { lat: 35.003786, lon: -83.481813, dayOffset: 7, elev: 3800 },
    // Off-trail: stopped in Franklin, NC (~8mi from trail)
    { lat: 35.1822, lon: -83.3815, dayOffset: 8, elev: 2100, offTrail: true },
    // Day 9: back on trail
    { lat: 35.131633, lon: -83.554168, dayOffset: 9, elev: 4500 },
    { lat: 35.181013, lon: -83.561199, dayOffset: 9, elev: 5000 },
    // Day 10
    { lat: 35.265472, lon: -83.571020, dayOffset: 10, elev: 5200 },
    { lat: 35.322742, lon: -83.587340, dayOffset: 10, elev: 4800 },
    // Off-trail: shuttle to Bryson City, NC for resupply (~12mi from trail)
    { lat: 35.4312, lon: -83.4496, dayOffset: 11, elev: 1740, offTrail: true },
    // Day 12: approaching Fontana Dam
    { lat: 35.363242, lon: -83.716218, dayOffset: 12, elev: 3200 },
    { lat: 35.409373, lon: -83.765050, dayOffset: 12, elev: 2500 },
  ];

  for (let i = 0; i < mockTrailPoints.length; i++) {
    const mp = mockTrailPoints[i];
    const time = new Date(start);
    time.setUTCDate(time.getUTCDate() + mp.dayOffset);
    // Spread pings across the day: morning for first ping, afternoon for second
    const hourBase = (i % 2 === 0) ? 8 : 14;
    time.setUTCHours(hourBase + Math.floor(Math.random() * 3));
    time.setUTCMinutes(Math.floor(Math.random() * 60));

    points.push({
      lat: mp.lat,
      lon: mp.lon,
      time: time.toISOString(),
      elevation: mp.elev,
      onTrail: !mp.offTrail
    });
  }

  return points;
}
