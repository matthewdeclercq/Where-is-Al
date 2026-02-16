import { getUTCDateString, groupPointsByDate } from './utils.js';
import { haversine } from './geo.js';

const STATIONARY_THRESHOLD_MILES = 100 / 5280; // 100 feet in miles

// Collapse consecutive points that are within 100 feet of each other.
// Keeps the first point of each stationary cluster, annotated with
// `lastPingTime` and `stationaryPings` when multiple pings came from the same spot.
function deduplicateStationary(points) {
  if (points.length <= 1) return points;

  const result = [{ ...points[0], stationaryPings: 1 }];
  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    const dist = haversine(prev.lat, prev.lon, curr.lat, curr.lon);
    if (dist >= STATIONARY_THRESHOLD_MILES) {
      result.push({ ...curr, stationaryPings: 1 });
    } else {
      // Same spot — update the cluster metadata on the kept point
      prev.lastPingTime = curr.time;
      prev.stationaryPings += 1;
    }
  }
  return result;
}

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

    const sorted = allPoints
      .filter(p => p.time >= startDate)
      .sort((a, b) => a.time - b.time);
    return deduplicateStationary(sorted);
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
