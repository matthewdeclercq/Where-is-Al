import { AT_TRAIL_DATA } from './at-trail-with-miles.js';

/**
 * Project a point onto a line segment and return the distance and parametric t.
 * Uses approximate Cartesian projection (same approach as trail-proximity.js).
 *
 * @param {number} pLat - Point latitude
 * @param {number} pLon - Point longitude
 * @param {number} aLat - Segment start latitude
 * @param {number} aLon - Segment start longitude
 * @param {number} bLat - Segment end latitude
 * @param {number} bLon - Segment end longitude
 * @returns {{ distance: number, t: number }} distance in miles, t in [0, 1]
 */
export function projectToSegment(pLat, pLon, aLat, aLon, bLat, bLon) {
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
    t = 0;
  } else {
    t = (px * bx + py * by) / segLenSq;
    t = Math.max(0, Math.min(1, t));
  }

  const closestX = t * bx;
  const closestY = t * by;
  const dx = px - closestX;
  const dy = py - closestY;

  return {
    distance: Math.sqrt(dx * dx + dy * dy),
    t
  };
}

/**
 * Snap a GPS point to the nearest position on the AT trail.
 * Returns interpolated trail mile and elevation at the snapped position.
 *
 * @param {number} lat - Point latitude
 * @param {number} lon - Point longitude
 * @param {Array} trailData - AT_TRAIL_DATA array of [lon, lat, miles, elevFt]
 * @returns {{ trailMile: number, trailElevation: number, distance: number }}
 */
export function snapToTrail(lat, lon, trailData = AT_TRAIL_DATA) {
  let bestDist = Infinity;
  let bestT = 0;
  let bestIdx = 0;

  for (let i = 0; i < trailData.length - 1; i++) {
    const [aLon, aLat] = trailData[i];
    const [bLon, bLat] = trailData[i + 1];

    const { distance, t } = projectToSegment(lat, lon, aLat, aLon, bLat, bLon);
    if (distance < bestDist) {
      bestDist = distance;
      bestT = t;
      bestIdx = i;
    }
  }

  const [, , mile1, elev1] = trailData[bestIdx];
  const [, , mile2, elev2] = trailData[bestIdx + 1];

  return {
    trailMile: Math.round((mile1 + bestT * (mile2 - mile1)) * 100) / 100,
    trailElevation: elev1 !== null && elev2 !== null
      ? Math.round(elev1 + bestT * (elev2 - elev1))
      : null,
    distance: bestDist
  };
}

/**
 * Snap all on-trail points in an array. Mutates the points in place.
 *
 * @param {Array} points - Array of point objects with lat, lon, onTrail
 * @param {Array} trailData - AT_TRAIL_DATA array
 */
export function snapPointsToTrail(points, trailData = AT_TRAIL_DATA) {
  for (const point of points) {
    if (point.onTrail) {
      const snap = snapToTrail(point.lat, point.lon, trailData);
      point.trailMile = snap.trailMile;
      point.trailElevation = snap.trailElevation;
    } else {
      point.trailMile = null;
      point.trailElevation = null;
    }
  }
  return points;
}
