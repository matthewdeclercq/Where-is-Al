import { createErrorResponse, createSuccessResponse } from './responses.js';
import { getMockElevationData, getMockElevationDays } from './mock.js';
import { calculateElevationStats } from './stats.js';
import { DATE_REGEX } from './constants.js';

const hasElevationData = p => p.trailElevation != null || p.elevation != null;

// Elevation handler
export async function handleElevation(request, env) {
  const USE_MOCK_DATA = env.USE_MOCK_DATA === 'true';
  const START_DATE_STR = env.START_DATE;

  const url = new URL(request.url);
  const dayParam = url.searchParams.get('day');

  if (!dayParam) {
    return handleElevationDays(request, env);
  }

  if (!DATE_REGEX.test(dayParam)) {
    return createErrorResponse(400, 'Invalid date format. Use YYYY-MM-DD', request);
  }

  if (USE_MOCK_DATA) {
    const mockElevationData = getMockElevationData(dayParam, START_DATE_STR);
    return createSuccessResponse(mockElevationData, request, {
      'Cache-Control': 'public, max-age=300'
    });
  }

  try {
    const elevationData = await getElevationByDay(dayParam, env);

    if (!elevationData || elevationData.points.length === 0) {
      return createSuccessResponse({
        date: dayParam,
        points: [],
        minElevation: null,
        maxElevation: null,
        verticalClimbed: null,
        verticalLoss: null
      }, request, {
        'Cache-Control': 'public, max-age=300'
      });
    }

    return createSuccessResponse(elevationData, request, {
      'Cache-Control': 'public, max-age=300'
    });
  } catch (error) {
    return createErrorResponse(500, error.message, request);
  }
}

// Get list of available days with elevation data
export async function handleElevationDays(request, env) {
  const USE_MOCK_DATA = env.USE_MOCK_DATA === 'true';
  const START_DATE_STR = env.START_DATE;

  if (USE_MOCK_DATA) {
    const mockDays = getMockElevationDays(START_DATE_STR);
    return createSuccessResponse({ days: mockDays }, request, {
      'Cache-Control': 'public, max-age=300'
    });
  }

  if (!env.TRAIL_HISTORY) {
    return createSuccessResponse({ days: [] }, request);
  }

  try {
    const keys = await env.TRAIL_HISTORY.list({ prefix: 'points:' });

    const readPromises = keys.keys.map(async (key) => {
      const dateStr = key.name.replace('points:', '');
      try {
        const dayPointsJson = await env.TRAIL_HISTORY.get(key.name);
        if (dayPointsJson) {
          const dayPoints = JSON.parse(dayPointsJson);
          return dayPoints.some(hasElevationData) ? dateStr : null;
        }
      } catch (error) {
        console.error(`[Worker] Failed to read ${key.name}:`, error);
      }
      return null;
    });

    const results = await Promise.all(readPromises);
    const days = results.filter(dateStr => dateStr !== null);

    days.sort((a, b) => b.localeCompare(a));

    return createSuccessResponse({ days }, request, {
      'Cache-Control': 'public, max-age=300'
    });
  } catch (error) {
    return createErrorResponse(500, error.message, request);
  }
}

// Get elevation data for a specific day
export async function getElevationByDay(dateStr, env) {
  if (!env.TRAIL_HISTORY) {
    return { points: [], minElevation: null, maxElevation: null, date: dateStr };
  }

  try {
    const kvKey = `points:${dateStr}`;
    const dayPointsJson = await env.TRAIL_HISTORY.get(kvKey);

    if (!dayPointsJson) {
      return { points: [], minElevation: null, maxElevation: null, date: dateStr };
    }

    const dayPoints = JSON.parse(dayPointsJson);

    const elevationPoints = dayPoints
      .filter(hasElevationData)
      .map(p => ({
        time: p.time,
        elevation: Math.round((p.trailElevation != null ? p.trailElevation : p.elevation) * 10) / 10
      }))
      .sort((a, b) => new Date(a.time) - new Date(b.time));

    if (elevationPoints.length === 0) {
      return { points: [], minElevation: null, maxElevation: null, verticalClimbed: null, verticalLoss: null, date: dateStr };
    }

    const elevations = elevationPoints.map(p => p.elevation);
    const minElevation = Math.round(Math.min(...elevations));
    const maxElevation = Math.round(Math.max(...elevations));

    const { verticalClimbed, verticalLoss } = calculateElevationStats(elevationPoints);

    return {
      date: dateStr,
      points: elevationPoints,
      minElevation,
      maxElevation,
      verticalClimbed,
      verticalLoss
    };
  } catch (error) {
    console.error(`[Worker] Failed to get elevation data for ${dateStr}:`, error);
    return { points: [], minElevation: null, maxElevation: null, verticalClimbed: null, verticalLoss: null, date: dateStr };
  }
}
