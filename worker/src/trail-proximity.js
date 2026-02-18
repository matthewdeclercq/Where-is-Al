import { projectToSegment } from './geo.js';
import { DEFAULT_OFF_TRAIL_THRESHOLD_MILES } from './constants.js';

/**
 * Calculate the minimum distance (in miles) from a point to a polyline (trail).
 * Uses perpendicular projection onto each segment for accuracy.
 *
 * @param {number} lat - Point latitude
 * @param {number} lon - Point longitude
 * @param {Array<[number, number]>} trailCoords - Array of [lon, lat] pairs (GeoJSON order)
 * @returns {number} Minimum distance in miles
 */
export function distanceToTrail(lat, lon, trailCoords) {
  let minDist = Infinity;

  for (let i = 0; i < trailCoords.length - 1; i++) {
    const [lon1, lat1] = trailCoords[i];
    const [lon2, lat2] = trailCoords[i + 1];

    const dist = projectToSegment(lat, lon, lat1, lon1, lat2, lon2).distance;
    if (dist < minDist) {
      minDist = dist;
    }
  }

  return minDist;
}

/**
 * Tag each point as on-trail or off-trail based on distance to trail.
 *
 * @param {Array} points - Array of point objects with lat/lon
 * @param {Array<[number, number]>} trailCoords - Simplified trail coordinates [lon, lat]
 * @param {number} thresholdMiles - Distance threshold in miles
 * @returns {Array} Same points array with `onTrail` boolean added
 */
export function tagPointsOnOffTrail(points, trailCoords, thresholdMiles = DEFAULT_OFF_TRAIL_THRESHOLD_MILES) {
  if (!trailCoords || trailCoords.length === 0) {
    // No trail data available - assume all on-trail
    for (const point of points) {
      point.onTrail = true;
    }
    return points;
  }

  for (const point of points) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) {
      point.onTrail = false;
      continue;
    }
    const dist = distanceToTrail(point.lat, point.lon, trailCoords);
    point.onTrail = dist <= thresholdMiles;
  }

  return points;
}
