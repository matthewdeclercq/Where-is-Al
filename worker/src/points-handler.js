import { createErrorResponse, createSuccessResponse } from './responses.js';
import { validateEnvOrError, getOffTrailThreshold } from './utils.js';
import { loadHistoricalPoints, serializePoint } from './storage.js';
import { tagAndSnapPoints } from './trail-distance.js';
import { AT_TRAIL_DATA } from './at-trail-with-miles.js';

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
const MILES_PER_PING = 2.5 * 20 / 60;
const PING_MS = 20 * 60 * 1000;

// Sample actual AT trail coordinates at MILES_PER_PING intervals between startMile and endMile.
// Points are guaranteed to be on the trail since they interpolate along real trail segments.
function sampleTrailSegment(startMile, endMile) {
  const sampled = [];
  let nextMile = startMile;

  for (let i = 0; i < AT_TRAIL_DATA.length - 1; i++) {
    const [lon1, lat1, mile1, elev1] = AT_TRAIL_DATA[i];
    const [lon2, lat2, mile2, elev2] = AT_TRAIL_DATA[i + 1];

    if (mile2 < nextMile) continue;
    if (mile1 > endMile) break;

    const segLen = mile2 - mile1;
    while (nextMile <= mile2 && nextMile <= endMile) {
      const t = segLen > 0 ? (nextMile - mile1) / segLen : 0;
      sampled.push({
        lat: lat1 + t * (lat2 - lat1),
        lon: lon1 + t * (lon2 - lon1),
        elevation: Math.round((elev1 != null && elev2 != null) ? elev1 + t * (elev2 - elev1) : (elev1 ?? 0)),
        onTrail: true
      });
      nextMile += MILES_PER_PING;
    }
  }

  return sampled;
}

function generateMockPoints(startDateStr, thresholdMiles) {
  if (!startDateStr) return [];

  // Hiking schedule: on-trail days defined by mile range, zero/town days by coordinates.
  // NOBO miles are approximate AT NOBO distances from Springer Mountain.
  const schedule = [
    { dayOffset: 0,  startMile: 0,   endMile: 9   }, // Springer → Hawk Mtn Shelter
    { dayOffset: 1,  startMile: 9,   endMile: 30  }, // Hawk Mtn → past Blood Mountain
    { dayOffset: 2,  startMile: 30,  endMile: 47  }, // Neels Gap → Unicoi Gap area
    { dayOffset: 3,  town: { lat: 34.7003, lon: -83.7299, elev: 1550 } }, // Zero — Helen, GA
    { dayOffset: 4,  startMile: 47,  endMile: 65  }, // Unicoi Gap → beyond Low Gap
    { dayOffset: 5,  startMile: 65,  endMile: 80  }, // Low Gap → into NC (Bly Gap area)
    { dayOffset: 6,  town: { lat: 34.9502, lon: -83.7578, elev: 1900 } }, // Zero — Hiawassee, GA
    { dayOffset: 7,  startMile: 80,  endMile: 97  }, // Bly Gap → Winding Stair Gap area
    { dayOffset: 8,  town: { lat: 35.1822, lon: -83.3815, elev: 2100 } }, // Zero — Franklin, NC
    { dayOffset: 9,  startMile: 97,  endMile: 114 }, // Winding Stair → Wayah Bald area
    { dayOffset: 10, startMile: 114, endMile: 131 }, // Wayah Bald → NOC/Wesser area
    { dayOffset: 11, town: { lat: 35.4312, lon: -83.4496, elev: 1740 } }, // Resupply — Bryson City, NC
    { dayOffset: 12, startMile: 131, endMile: 148 }, // Stecoah Gap → past Yellow Creek Mtn
  ];

  const points = [];
  const startBase = new Date(startDateStr + 'T08:00:00Z');

  for (const day of schedule) {
    let currentTime = new Date(startBase);
    currentTime.setUTCDate(currentTime.getUTCDate() + day.dayOffset);

    if (day.town) {
      // Zero/town day: two pings 20 min apart at the town location
      for (let p = 0; p < 2; p++) {
        points.push({
          lat: day.town.lat,
          lon: day.town.lon,
          time: new Date(currentTime).toISOString(),
          elevation: day.town.elev,
          onTrail: false
        });
        currentTime = new Date(currentTime.getTime() + PING_MS);
      }
    } else {
      // Hiking day: sample real AT coordinates at MILES_PER_PING intervals
      const trailPoints = sampleTrailSegment(day.startMile, day.endMile);
      for (const tp of trailPoints) {
        points.push({ ...tp, time: new Date(currentTime).toISOString() });
        currentTime = new Date(currentTime.getTime() + PING_MS);
      }
    }
  }

  // Shift all timestamps so the last ping is 10 minutes ago, making the
  // tracker appear live (ON) in mock mode regardless of START_DATE's age.
  if (points.length > 0) {
    const lastTime = new Date(points[points.length - 1].time).getTime();
    const offset = (Date.now() - 10 * 60 * 1000) - lastTime;
    for (const p of points) {
      p.time = new Date(new Date(p.time).getTime() + offset).toISOString();
    }
  }

  return points;
}
