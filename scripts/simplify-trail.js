#!/usr/bin/env node
/**
 * Parses the AT trail KML and generates:
 * 1. worker/src/at-trail-simplified.js - Simplified coords (~5K points) for off-trail detection
 * 2. data/at-trail.geojson - Full-resolution GeoJSON for frontend map display
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const KML_PATH = path.join(ROOT, 'data', 'at-trail.kml');
const SIMPLIFIED_JS_PATH = path.join(ROOT, 'worker', 'src', 'at-trail-simplified.js');
const GEOJSON_PATH = path.join(ROOT, 'data', 'at-trail.geojson');

// Target number of points for simplified version
const TARGET_POINTS = 5000;

// --- KML Parsing ---

function parseKmlCoordinates(kmlText) {
  const coordBlockRegex = /<coordinates>([\s\S]*?)<\/coordinates>/gi;
  const allSegments = [];
  let match;

  while ((match = coordBlockRegex.exec(kmlText)) !== null) {
    const block = match[1].trim();
    if (!block.includes(' ')) continue;

    const points = block.split(/\s+/).map(triplet => {
      const parts = triplet.split(',');
      if (parts.length < 2) return null;
      const lon = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      if (isNaN(lon) || isNaN(lat)) return null;
      return [lon, lat];
    }).filter(Boolean);

    if (points.length > 1) {
      allSegments.push(points);
    }
  }

  return allSegments;
}

/**
 * Deduplicate segments that share the same endpoints (KML often has duplicates).
 * Keeps the longest version of each unique endpoint pair.
 */
function deduplicateSegments(segments) {
  const map = new Map();

  for (const seg of segments) {
    const first = seg[0];
    const last = seg[seg.length - 1];
    // Create a key from rounded endpoints, order-independent
    const a = `${first[1].toFixed(3)},${first[0].toFixed(3)}`;
    const b = `${last[1].toFixed(3)},${last[0].toFixed(3)}`;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;

    const existing = map.get(key);
    if (!existing || seg.length > existing.length) {
      map.set(key, seg);
    }
  }

  const unique = Array.from(map.values());
  console.log(`Deduplicated ${segments.length} segments -> ${unique.length} unique`);
  return unique;
}

/**
 * Order segments into a continuous trail from south (GA) to north (ME).
 * Uses greedy nearest-endpoint matching.
 */
function orderSegments(segments) {
  if (segments.length === 0) return [];
  if (segments.length === 1) return segments[0];

  // Deduplicate first
  segments = deduplicateSegments(segments);

  // For each segment, ensure it goes roughly south-to-north
  const oriented = segments.map(seg => {
    const firstLat = seg[0][1];
    const lastLat = seg[seg.length - 1][1];
    return firstLat <= lastLat ? seg : [...seg].reverse();
  });

  // Sort segments by the latitude of their first (southern) point
  oriented.sort((a, b) => a[0][1] - b[0][1]);

  // Greedily connect by nearest endpoint
  const used = new Set();
  const ordered = [];

  // Start with the southernmost segment
  ordered.push(...oriented[0]);
  used.add(0);

  while (used.size < oriented.length) {
    const lastPoint = ordered[ordered.length - 1];
    let bestIdx = -1;
    let bestDist = Infinity;
    let bestReverse = false;

    for (let i = 0; i < oriented.length; i++) {
      if (used.has(i)) continue;
      const seg = oriented[i];
      const distToFirst = distSq(lastPoint, seg[0]);
      const distToLast = distSq(lastPoint, seg[seg.length - 1]);

      if (distToFirst < bestDist) {
        bestDist = distToFirst;
        bestIdx = i;
        bestReverse = false;
      }
      if (distToLast < bestDist) {
        bestDist = distToLast;
        bestIdx = i;
        bestReverse = true;
      }
    }

    if (bestIdx === -1) break;

    const nextSeg = bestReverse ? [...oriented[bestIdx]].reverse() : oriented[bestIdx];
    ordered.push(...nextSeg);
    used.add(bestIdx);
  }

  return ordered;
}

function distSq(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

// --- Iterative Douglas-Peucker Simplification ---

function douglasPeucker(points, epsilon) {
  if (points.length <= 2) return points;

  // Use iterative approach to avoid stack overflow on large arrays
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [start, end] = stack.pop();
    if (end - start <= 1) continue;

    let maxDist = 0;
    let maxIdx = start;

    for (let i = start + 1; i < end; i++) {
      const dist = perpendicularDistance(points[i], points[start], points[end]);
      if (dist > maxDist) {
        maxDist = dist;
        maxIdx = i;
      }
    }

    if (maxDist > epsilon) {
      keep[maxIdx] = 1;
      stack.push([start, maxIdx]);
      stack.push([maxIdx, end]);
    }
  }

  const result = [];
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) result.push(points[i]);
  }
  return result;
}

function perpendicularDistance(point, lineStart, lineEnd) {
  const dx = lineEnd[0] - lineStart[0];
  const dy = lineEnd[1] - lineStart[1];
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    const ex = point[0] - lineStart[0];
    const ey = point[1] - lineStart[1];
    return Math.sqrt(ex * ex + ey * ey);
  }

  let t = ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = lineStart[0] + t * dx;
  const projY = lineStart[1] + t * dy;
  const ex = point[0] - projX;
  const ey = point[1] - projY;
  return Math.sqrt(ex * ex + ey * ey);
}

function simplifyToTarget(points, targetCount) {
  if (points.length <= targetCount) return points;

  let lo = 0;
  let hi = 0.1;
  let bestResult = points;

  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const result = douglasPeucker(points, mid);

    if (result.length > targetCount) {
      lo = mid;
    } else {
      hi = mid;
      bestResult = result;
    }

    if (Math.abs(result.length - targetCount) < targetCount * 0.05) {
      bestResult = result;
      break;
    }
  }

  return bestResult;
}

// --- Main ---

console.log('Reading KML...');
const kmlText = fs.readFileSync(KML_PATH, 'utf-8');

console.log('Parsing coordinates...');
const segments = parseKmlCoordinates(kmlText);
console.log(`Found ${segments.length} LineString segments`);

const totalPoints = segments.reduce((sum, s) => sum + s.length, 0);
console.log(`Total points across all segments: ${totalPoints}`);

console.log('Ordering segments south-to-north...');
const fullTrail = orderSegments(segments);
console.log(`Ordered trail: ${fullTrail.length} points`);

// Remove consecutive duplicates
const deduped = [fullTrail[0]];
for (let i = 1; i < fullTrail.length; i++) {
  if (fullTrail[i][0] !== fullTrail[i - 1][0] || fullTrail[i][1] !== fullTrail[i - 1][1]) {
    deduped.push(fullTrail[i]);
  }
}
console.log(`After dedup: ${deduped.length} points`);

// Verify trail direction
console.log(`Start: lat=${deduped[0][1].toFixed(4)}, lon=${deduped[0][0].toFixed(4)} (expect ~34.63, -84.19 Springer Mt)`);
console.log(`End: lat=${deduped[deduped.length-1][1].toFixed(4)}, lon=${deduped[deduped.length-1][0].toFixed(4)} (expect ~45.90, -68.92 Katahdin)`);

// --- Generate full GeoJSON ---
console.log('Writing full GeoJSON...');
const geojson = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: {
      name: 'Appalachian Trail'
    },
    geometry: {
      type: 'LineString',
      coordinates: deduped
    }
  }]
};

fs.writeFileSync(GEOJSON_PATH, JSON.stringify(geojson));
const geojsonSize = fs.statSync(GEOJSON_PATH).size;
console.log(`GeoJSON written: ${(geojsonSize / 1024 / 1024).toFixed(1)} MB (${deduped.length} points)`);

// --- Generate simplified JS ---
console.log(`Simplifying to ~${TARGET_POINTS} points...`);
const simplified = simplifyToTarget(deduped, TARGET_POINTS);
console.log(`Simplified to ${simplified.length} points`);

// Round to 4 decimal places (11m precision - plenty for 0.25mi threshold)
const rounded = simplified.map(([lon, lat]) => [
  Math.round(lon * 10000) / 10000,
  Math.round(lat * 10000) / 10000
]);

const jsContent = `// Simplified Appalachian Trail coordinates for off-trail distance calculations.
// Format: [lon, lat] pairs (GeoJSON coordinate order)
// Douglas-Peucker simplified to ${rounded.length} points from ${deduped.length} original points.
// Generated by scripts/simplify-trail.js
export const AT_TRAIL_COORDS = ${JSON.stringify(rounded)};
`;

fs.writeFileSync(SIMPLIFIED_JS_PATH, jsContent);
const jsSize = fs.statSync(SIMPLIFIED_JS_PATH).size;
console.log(`Simplified JS written: ${(jsSize / 1024).toFixed(1)} KB (${rounded.length} points)`);

console.log('Done!');
