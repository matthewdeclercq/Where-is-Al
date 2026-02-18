import { AT_TRAIL_DATA } from './at-trail-with-miles.js';
import { projectToSegment } from './geo.js';
import { DEFAULT_OFF_TRAIL_THRESHOLD_MILES } from './constants.js';

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

/**
 * Combined single-pass: tag each point as on/off trail AND snap on-trail points to get
 * trailMile + trailElevation. Replaces calling tagPointsOnOffTrail() + snapPointsToTrail()
 * separately, halving the number of projectToSegment() calls.
 *
 * @param {Array} points - Array of point objects with lat, lon
 * @param {Array} trailData - AT_TRAIL_DATA array of [lon, lat, miles, elevFt]
 * @param {number} thresholdMiles - On-trail distance threshold in miles
 * @returns {Array} Same points array with onTrail, trailMile, trailElevation set
 */
export function tagAndSnapPoints(points, trailData = AT_TRAIL_DATA, thresholdMiles = DEFAULT_OFF_TRAIL_THRESHOLD_MILES) {
  for (const point of points) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) {
      point.onTrail = false;
      point.trailMile = null;
      point.trailElevation = null;
      continue;
    }

    let bestDist = Infinity;
    let bestT = 0;
    let bestIdx = 0;

    for (let i = 0; i < trailData.length - 1; i++) {
      const [aLon, aLat] = trailData[i];
      const [bLon, bLat] = trailData[i + 1];

      const { distance, t } = projectToSegment(point.lat, point.lon, aLat, aLon, bLat, bLon);
      if (distance < bestDist) {
        bestDist = distance;
        bestT = t;
        bestIdx = i;
        if (bestDist < 0.001) break; // Close enough — early exit
      }
    }

    point.onTrail = bestDist <= thresholdMiles;

    if (point.onTrail) {
      const [, , mile1, elev1] = trailData[bestIdx];
      const [, , mile2, elev2] = trailData[bestIdx + 1];
      point.trailMile = Math.round((mile1 + bestT * (mile2 - mile1)) * 100) / 100;
      point.trailElevation = (elev1 !== null && elev2 !== null)
        ? Math.round(elev1 + bestT * (elev2 - elev1))
        : null;
    } else {
      point.trailMile = null;
      point.trailElevation = null;
    }
  }
  return points;
}
