#!/usr/bin/env node
/**
 * Generates worker/src/at-trail-with-miles.js from the simplified trail.
 *
 * For each of the 4822 simplified trail vertices:
 *   1. Accumulates haversine distance between consecutive points (cumulative miles)
 *   2. Fetches DEM elevation from Open-Meteo Elevation API
 *   3. Scales cumulative miles so the endpoint matches the known AT length (2197.9 mi)
 *
 * Output format: [[lon, lat, cumulativeMiles, elevationFt], ...]
 *
 * Usage: node scripts/build-trail-data.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SIMPLIFIED_JS_PATH = path.join(ROOT, 'worker', 'src', 'at-trail-simplified.js');
const OUTPUT_PATH = path.join(ROOT, 'worker', 'src', 'at-trail-with-miles.js');

const TOTAL_AT_MILES = 2197.9;
const BATCH_SIZE = 100; // Open-Meteo supports up to 100 coordinates per request
const METERS_TO_FEET = 3.28084;

// Haversine distance in miles (matches worker/src/geo.js)
function haversine(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const toRad = (deg) => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Load simplified trail coords from the JS file
function loadTrailCoords() {
  const content = fs.readFileSync(SIMPLIFIED_JS_PATH, 'utf-8');
  const arrayStr = content.match(/= (\[.+\]);/s)[1];
  return JSON.parse(arrayStr);
}

// Fetch DEM elevations from Open-Meteo in batches
async function fetchElevations(coords) {
  const elevations = new Array(coords.length);
  const totalBatches = Math.ceil(coords.length / BATCH_SIZE);

  for (let i = 0; i < coords.length; i += BATCH_SIZE) {
    const batch = coords.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    const lats = batch.map(([, lat]) => lat).join(',');
    const lons = batch.map(([lon]) => lon).join(',');
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`;

    let retries = 5;
    let retryDelay = 2000;
    while (retries > 0) {
      try {
        const res = await fetch(url);
        if (res.status === 429) {
          throw new Error(`Rate limited (429)`);
        }
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        }
        const data = await res.json();
        for (let j = 0; j < batch.length; j++) {
          elevations[i + j] = data.elevation[j];
        }
        console.log(`  Batch ${batchNum}/${totalBatches}: ${batch.length} elevations fetched`);
        break;
      } catch (err) {
        retries--;
        if (retries === 0) {
          console.error(`  Batch ${batchNum} FAILED: ${err.message}`);
          for (let j = 0; j < batch.length; j++) {
            elevations[i + j] = null;
          }
        } else {
          console.log(`  Batch ${batchNum} retry in ${retryDelay/1000}s (${5 - retries}/5): ${err.message}`);
          await new Promise(r => setTimeout(r, retryDelay));
          retryDelay = Math.min(retryDelay * 2, 30000); // exponential backoff up to 30s
        }
      }
    }

    // Rate limiting: generous delay between batches to stay under limits
    if (i + BATCH_SIZE < coords.length) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  return elevations;
}

async function main() {
  console.log('Loading simplified trail coordinates...');
  const coords = loadTrailCoords();
  console.log(`Loaded ${coords.length} points`);

  // Step 1: Calculate raw cumulative haversine distances
  console.log('Calculating cumulative distances...');
  const rawMiles = new Array(coords.length);
  rawMiles[0] = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lon1, lat1] = coords[i - 1];
    const [lon2, lat2] = coords[i];
    rawMiles[i] = rawMiles[i - 1] + haversine(lat1, lon1, lat2, lon2);
  }
  const rawTotal = rawMiles[coords.length - 1];
  console.log(`Raw haversine total: ${rawTotal.toFixed(1)} miles`);

  // Step 2: Scale to match known AT length
  const scale = TOTAL_AT_MILES / rawTotal;
  console.log(`Scale factor: ${scale.toFixed(6)} (${TOTAL_AT_MILES} / ${rawTotal.toFixed(1)})`);
  const scaledMiles = rawMiles.map(m => m * scale);
  console.log(`Scaled total: ${scaledMiles[scaledMiles.length - 1].toFixed(1)} miles`);

  // Step 3: Fetch DEM elevations
  console.log('Fetching DEM elevations from Open-Meteo...');
  const elevationsMeters = await fetchElevations(coords);

  // Convert to feet
  const elevationsFeet = elevationsMeters.map(e =>
    e !== null ? Math.round(e * METERS_TO_FEET) : null
  );

  // Check for nulls
  const nullCount = elevationsFeet.filter(e => e === null).length;
  if (nullCount > 0) {
    console.warn(`WARNING: ${nullCount} points have null elevation`);
  }

  // Step 4: Build output array
  const trailData = coords.map(([lon, lat], i) => [
    lon,
    lat,
    Math.round(scaledMiles[i] * 100) / 100, // 2 decimal places for miles
    elevationsFeet[i]
  ]);

  // Verify endpoints
  console.log(`\nVerification:`);
  console.log(`  Start: [${trailData[0]}] (expect Springer Mt ~34.63, -84.19, mile 0)`);
  console.log(`  End:   [${trailData[trailData.length - 1]}] (expect Katahdin ~45.90, -68.92, mile ${TOTAL_AT_MILES})`);

  // Step 5: Write output
  const jsContent = `// Appalachian Trail data with cumulative miles and DEM elevation.
// Format: [lon, lat, cumulativeMiles, elevationFt] (GeoJSON coordinate order)
// ${trailData.length} points, scaled to ${TOTAL_AT_MILES} total miles.
// Generated by scripts/build-trail-data.js
export const AT_TRAIL_DATA = ${JSON.stringify(trailData)};
`;

  fs.writeFileSync(OUTPUT_PATH, jsContent);
  const fileSize = fs.statSync(OUTPUT_PATH).size;
  console.log(`\nWritten: ${OUTPUT_PATH}`);
  console.log(`File size: ${(fileSize / 1024).toFixed(1)} KB`);
  console.log('Done!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
