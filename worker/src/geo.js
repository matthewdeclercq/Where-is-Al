/**
 * Project a point onto a line segment and return the distance and parametric t.
 * Uses approximate Cartesian projection (good enough for short segments).
 *
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

  return { distance: Math.sqrt(dx * dx + dy * dy), t };
}

// Haversine distance in miles
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const toRad = (deg) => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
