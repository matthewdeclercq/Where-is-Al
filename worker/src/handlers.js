import { createErrorResponse, createSuccessResponse } from './responses.js';
import { validateEnvVars, buildKmlUrl } from './utils.js';
import { getMockData } from './mock.js';
import { parseKmlPoints } from './kml.js';
import { calculateStats } from './stats.js';
import { loadHistoricalPoints, storePointsByDay, mergePoints } from './storage.js';
import { fetchWeather } from './weather.js';
import { TOTAL_TRAIL_MILES, DEFAULT_OFF_TRAIL_THRESHOLD_MILES } from './constants.js';
import { tagPointsOnOffTrail } from './trail-proximity.js';
import { AT_TRAIL_COORDS } from './at-trail-simplified.js';

// Stats handler
export async function handleStats(request, env, ctx) {
  const MAPSHARE_ID = env.MAPSHARE_ID;
  const MAPSHARE_PASSWORD = env.MAPSHARE_PASSWORD || '';
  const START_DATE_STR = env.START_DATE;
  const USE_MOCK_DATA = env.USE_MOCK_DATA === 'true';

  if (USE_MOCK_DATA) {
    const validationErrors = validateEnvVars(env, false);
    if (validationErrors.length > 0) {
      return createErrorResponse(500, validationErrors.join('; '), request, {
        'Cache-Control': 'no-cache'
      });
    }
    const mockData = getMockData(START_DATE_STR);
    return createSuccessResponse(mockData, request, {
      'Cache-Control': 'public, max-age=300'
    });
  }

  const validationErrors = validateEnvVars(env, true);
  if (validationErrors.length > 0) {
    return createErrorResponse(500, validationErrors.join('; '), request, {
      'Cache-Control': 'no-cache'
    });
  }

  const kmlUrl = buildKmlUrl(MAPSHARE_ID, MAPSHARE_PASSWORD);

  try {
    const kmlResponse = await fetch(kmlUrl);
    if (!kmlResponse.ok) throw new Error('Failed to fetch KML');
    const kmlText = await kmlResponse.text();

    const kmlPoints = parseKmlPoints(kmlText, new Date(START_DATE_STR));

    const historicalPoints = await loadHistoricalPoints(START_DATE_STR, env);

    const allPoints = mergePoints(kmlPoints, historicalPoints);

    // Tag points as on/off trail and filter for stats
    const thresholdMiles = env.OFF_TRAIL_THRESHOLD
      ? parseFloat(env.OFF_TRAIL_THRESHOLD)
      : DEFAULT_OFF_TRAIL_THRESHOLD_MILES;
    tagPointsOnOffTrail(allPoints, AT_TRAIL_COORDS, thresholdMiles);

    const stats = calculateStats(allPoints, START_DATE_STR, TOTAL_TRAIL_MILES, { filterOffTrail: true });

    if (env.TRAIL_HISTORY && kmlPoints.length > 0 && ctx) {
      ctx.waitUntil(
        storePointsByDay(kmlPoints, env).catch(err => {
          console.error('[Worker] Failed to store points:', err);
        })
      );
    } else if (env.TRAIL_HISTORY && kmlPoints.length > 0) {
      storePointsByDay(kmlPoints, env).catch(err => {
        console.error('[Worker] Failed to store points:', err);
      });
    }

    let weather = null;
    let location = null;
    if (allPoints.length > 0) {
      const currentPoint = allPoints[allPoints.length - 1];
      location = { lat: currentPoint.lat, lon: currentPoint.lon };

      try {
        weather = await fetchWeather(currentPoint.lat, currentPoint.lon);
      } catch (error) {
        console.error('[Worker] Weather fetch failed:', error);
      }
    }

    const response = {
      ...stats,
      location: location,
      weather: weather
    };

    return createSuccessResponse(response, request, {
      'Cache-Control': 'public, max-age=300'
    });
  } catch (error) {
    return createErrorResponse(500, error.message, request, {
      'Cache-Control': 'no-cache'
    });
  }
}

// Sync handler for manual point synchronization
export async function handleSync(request, env) {
  const MAPSHARE_ID = env.MAPSHARE_ID;
  const MAPSHARE_PASSWORD = env.MAPSHARE_PASSWORD || '';
  const START_DATE_STR = env.START_DATE;
  const USE_MOCK_DATA = env.USE_MOCK_DATA === 'true';

  if (USE_MOCK_DATA) {
    return createErrorResponse(400, 'Sync not available in mock data mode', request);
  }

  if (!env.TRAIL_HISTORY) {
    return createErrorResponse(500, 'KV namespace not configured', request);
  }

  if (!MAPSHARE_ID) {
    return createErrorResponse(500, 'MAPSHARE_ID environment variable not configured', request);
  }

  if (!START_DATE_STR) {
    return createErrorResponse(500, 'START_DATE environment variable not configured', request);
  }

  try {
    const kmlUrl = buildKmlUrl(MAPSHARE_ID, MAPSHARE_PASSWORD);

    const kmlResponse = await fetch(kmlUrl);
    if (!kmlResponse.ok) throw new Error('Failed to fetch KML');
    const kmlText = await kmlResponse.text();

    const kmlPoints = parseKmlPoints(kmlText, new Date(START_DATE_STR));

    await storePointsByDay(kmlPoints, env);

    const keys = await env.TRAIL_HISTORY.list({ prefix: 'points:' });
    let totalPoints = 0;
    for (const key of keys.keys) {
      const dayPointsJson = await env.TRAIL_HISTORY.get(key.name);
      if (dayPointsJson) {
        const dayPoints = JSON.parse(dayPointsJson);
        totalPoints += dayPoints.length;
      }
    }

    return createSuccessResponse({
      success: true,
      message: 'Sync completed',
      kmlPointsProcessed: kmlPoints.length,
      totalStoredPoints: totalPoints,
      daysStored: keys.keys.length
    }, request);
  } catch (error) {
    return createErrorResponse(500, error.message, request);
  }
}
