import { haversine } from './geo.js';
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

    const dist = distanceToSegment(lat, lon, lat1, lon1, lat2, lon2);
    if (dist < minDist) {
      minDist = dist;
    }
  }

  return minDist;
}

/**
 * Calculate distance from a point to a line segment using projection.
 * Works in approximate Cartesian space (good enough for short segments).
 */
function distanceToSegment(pLat, pLon, aLat, aLon, bLat, bLon) {
  // Convert to approximate local Cartesian (miles)
  const cosLat = Math.cos((pLat * Math.PI) / 180);
  const MILES_PER_DEG_LAT = 69.0;
  const MILES_PER_DEG_LON = 69.0 * cosLat;

  const px = (pLon - aLon) * MILES_PER_DEG_LON;
  const py = (pLat - aLat) * MILES_PER_DEG_LAT;
  const bx = (bLon - aLon) * MILES_PER_DEG_LON;
  const by = (bLat - aLat) * MILES_PER_DEG_LAT;

  const segLenSq = bx * bx + by * by;

  let t;
  if (segLenSq === 0) {
    // Segment is a point
    t = 0;
  } else {
    t = (px * bx + py * by) / segLenSq;
    t = Math.max(0, Math.min(1, t));
  }

  const closestX = t * bx;
  const closestY = t * by;
  const dx = px - closestX;
  const dy = py - closestY;

  return Math.sqrt(dx * dx + dy * dy);
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
