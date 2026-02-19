import { createErrorResponse, createSuccessResponse } from './responses.js';
import { validateEnvOrError, buildKmlUrl, buildKmlFetchOptions, getOffTrailThreshold } from './utils.js';
import { getMockData } from './mock.js';
import { parseKmlPoints } from './kml.js';
import { calculateStats } from './stats.js';
import { loadHistoricalPoints, storePointsByDay } from './storage.js';
import { fetchWeatherCached } from './weather.js';
import { TOTAL_TRAIL_MILES } from './constants.js';
import { tagAndSnapPoints } from './trail-distance.js';

// Stats handler — reads points from KV only (cron handles KML polling)
export async function handleStats(request, env) {
  const START_DATE_STR = env.START_DATE;
  const USE_MOCK_DATA = env.USE_MOCK_DATA === 'true';

  if (USE_MOCK_DATA) {
    const envError = validateEnvOrError(env, request, false);
    if (envError) return envError;
    const mockData = getMockData(START_DATE_STR);
    return createSuccessResponse(mockData, request, {
      'Cache-Control': 'public, max-age=300'
    });
  }

  const envError = validateEnvOrError(env, request, true);
  if (envError) return envError;

  // Short-circuit with KV-cached stats to avoid recomputation on burst requests
  if (env.TRAIL_HISTORY) {
    try {
      const cached = await env.TRAIL_HISTORY.get('cache:stats', 'json');
      if (cached && Date.now() - cached.timestamp < 60000) {
        return createSuccessResponse(cached.data, request, { 'Cache-Control': 'public, max-age=60' });
      }
    } catch (cacheError) {
      console.warn('[Handler] Stats cache read failed, recomputing:', cacheError.message);
    }
  }

  try {
    const allPoints = await loadHistoricalPoints(START_DATE_STR, env);

    // Tag points as on/off trail and snap to trail in a single pass
    tagAndSnapPoints(allPoints, undefined, getOffTrailThreshold(env));

    const stats = calculateStats(allPoints, START_DATE_STR, TOTAL_TRAIL_MILES, { filterOffTrail: true });

    let weather = null;
    let location = null;
    if (allPoints.length > 0) {
      const currentPoint = allPoints[allPoints.length - 1];
      location = { lat: currentPoint.lat, lon: currentPoint.lon };
      try {
        weather = await fetchWeatherCached(currentPoint.lat, currentPoint.lon, env);
      } catch (error) {
        console.error('[Handler] Weather fetch failed:', error.message);
      }
    }

    const response = {
      ...stats,
      location: location,
      weather: weather
    };

    // Cache computed stats for 60s to avoid re-running O(N×M) trail computation
    if (env.TRAIL_HISTORY) {
      try {
        await env.TRAIL_HISTORY.put('cache:stats', JSON.stringify({ data: response, timestamp: Date.now() }), { expirationTtl: 300 });
      } catch (_) {}
    }

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
    const kmlUrl = buildKmlUrl(MAPSHARE_ID);
    const kmlFetchOptions = buildKmlFetchOptions(MAPSHARE_PASSWORD);

    const kmlResponse = await fetch(kmlUrl, kmlFetchOptions);
    if (!kmlResponse.ok) throw new Error('Failed to fetch KML');
    const kmlText = await kmlResponse.text();

    const kmlPoints = parseKmlPoints(kmlText, new Date(START_DATE_STR));

    await storePointsByDay(kmlPoints, env);

    const keys = await env.TRAIL_HISTORY.list({ prefix: 'points:' });

    return createSuccessResponse({
      success: true,
      message: 'Sync completed',
      kmlPointsProcessed: kmlPoints.length,
      daysStored: keys.keys.length
    }, request);
  } catch (error) {
    return createErrorResponse(500, error.message, request);
  }
}
