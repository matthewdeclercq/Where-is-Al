import { getUTCDateString, groupPointsByDate } from './utils.js';

// Load all historical points from KV
export async function loadHistoricalPoints(startDateStr, env) {
  if (!env.TRAIL_HISTORY) {
    return [];
  }

  try {
    const startDate = new Date(startDateStr + 'T00:00:00Z');
    const allPoints = [];

    const keys = await env.TRAIL_HISTORY.list({ prefix: 'points:' });

    for (const key of keys.keys) {
      try {
        const dayPointsJson = await env.TRAIL_HISTORY.get(key.name);
        if (dayPointsJson) {
          const dayPoints = JSON.parse(dayPointsJson);
          const parsedPoints = dayPoints.map(p => ({
            ...p,
            time: new Date(p.time)
          }));
          allPoints.push(...parsedPoints);
        }
      } catch (error) {
        console.error(`[Worker] Failed to parse points for ${key.name}:`, error);
      }
    }

    return allPoints
      .filter(p => p.time >= startDate)
      .sort((a, b) => a.time - b.time);
  } catch (error) {
    console.error('[Worker] Failed to load historical points:', error);
    return [];
  }
}

// Store points grouped by day in KV
export async function storePointsByDay(points, env) {
  if (!env.TRAIL_HISTORY || points.length === 0) {
    return;
  }

  try {
    const pointsByDay = groupPointsByDate(points);

    for (const [dateKey, dayPoints] of pointsByDay.entries()) {
      const kvKey = `points:${dateKey}`;

      try {
        const existingJson = await env.TRAIL_HISTORY.get(kvKey);
        let existingPoints = [];

        if (existingJson) {
          existingPoints = JSON.parse(existingJson).map(p => ({
            ...p,
            time: new Date(p.time)
          }));
        }

        const pointMap = new Map();

        for (const p of existingPoints) {
          const timeKey = p.time.toISOString();
          pointMap.set(timeKey, p);
        }

        for (const p of dayPoints) {
          const timeKey = p.time.toISOString();
          pointMap.set(timeKey, p);
        }

        const mergedPoints = Array.from(pointMap.values())
          .sort((a, b) => a.time - b.time)
          .map(p => ({
            lat: p.lat,
            lon: p.lon,
            time: p.time.toISOString(),
            velocity: p.velocity,
            elevation: p.elevation !== undefined ? p.elevation : null
          }));

        await env.TRAIL_HISTORY.put(kvKey, JSON.stringify(mergedPoints));
      } catch (error) {
        console.error(`[Worker] Failed to store points for ${dateKey}:`, error);
      }
    }

    if (points.length > 0) {
      const latestPoint = points[points.length - 1];
      await env.TRAIL_HISTORY.put('meta:latest_timestamp', latestPoint.time.toISOString());
    }
  } catch (error) {
    console.error('Failed to store points:', error);
  }
}

// Merge KML points with historical points, deduplicating by timestamp
export function mergePoints(kmlPoints, historicalPoints) {
  const pointMap = new Map();

  for (const p of historicalPoints) {
    const timeKey = p.time.toISOString();
    pointMap.set(timeKey, p);
  }

  for (const p of kmlPoints) {
    const timeKey = p.time.toISOString();
    pointMap.set(timeKey, p);
  }

  return Array.from(pointMap.values()).sort((a, b) => a.time - b.time);
}
