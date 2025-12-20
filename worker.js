// Cloudflare Worker Code for Trail Stats Calculator
// Copy this code into your Cloudflare Workers dashboard editor
// See CLOUDFLARE_SETUP.md for deployment instructions

export default {
  async fetch(request, env, ctx) {
    // Config from env
    const MAPSHARE_ID = env.MAPSHARE_ID;
    const MAPSHARE_PASSWORD = env.MAPSHARE_PASSWORD || '';
    const START_DATE_STR = env.START_DATE;
    const START_LAT = parseFloat(env.START_LAT);
    const START_LON = parseFloat(env.START_LON);
    const TOTAL_TRAIL_MILES = 2197.9;

    // Build KML URL
    let kmlUrl = `https://share.garmin.com/Feed/Share/${MAPSHARE_ID}`;
    if (MAPSHARE_PASSWORD) {
      kmlUrl += `?pw=${MAPSHARE_PASSWORD}`;
    }

    try {
      // Fetch KML
      const kmlResponse = await fetch(kmlUrl);
      if (!kmlResponse.ok) throw new Error('Failed to fetch KML');
      const kmlText = await kmlResponse.text();

      // Parse KML (manual lightweight parser since no DOMParser in Workers)
      const points = parseKmlPoints(kmlText, new Date(START_DATE_STR));

      // Calculate stats
      const stats = calculateStats(points, START_DATE_STR, TOTAL_TRAIL_MILES);

      // Return JSON
      return new Response(JSON.stringify(stats), {
        headers: { 
          'Content-Type': 'application/json', 
          'Access-Control-Allow-Origin': '*' 
        },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  },
};

// Lightweight KML parser for Garmin format
function parseKmlPoints(kmlText, startDate) {
  const points = [];
  const placemarkRegex = /<Placemark>[\s\S]*?<\/Placemark>/g;
  const placemarks = kmlText.match(placemarkRegex) || [];

  for (const pm of placemarks) {
    const coordMatch = pm.match(/<coordinates>([\d\.-]+),([\d\.-]+),([\d\.-]+)</);
    const timeMatch = pm.match(/<when>([\d\-T:Z\.]+)</);
    const velocityMatch = pm.match(/name="velocity">([\d\.]+)</); // km/h

    if (coordMatch && timeMatch) {
      const lon = parseFloat(coordMatch[1]);
      const lat = parseFloat(coordMatch[2]);
      const time = new Date(timeMatch[1]);
      const velocityKmh = velocityMatch ? parseFloat(velocityMatch[1]) : 0;
      const velocityMph = velocityKmh * 0.621371;

      if (time >= startDate) {
        points.push({ lat, lon, time, velocity: velocityMph });
      }
    }
  }
  return points.sort((a, b) => a.time - b.time);
}

// Haversine distance in miles
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

// Main stats calculator
function calculateStats(points, startDateStr, totalTrailMiles) {
  if (points.length < 2) {
    return { 
      totalMilesCompleted: '0.0', 
      milesRemaining: totalTrailMiles.toFixed(1), 
      dailyDistance: '0.0', 
      averageSpeed: '0.0', 
      currentDayOnTrail: 1, 
      estimatedFinishDate: 'N/A',
      startDate: new Date(startDateStr + 'T00:00:00Z').toLocaleDateString('en-US')
    };
  }

  const startDate = new Date(startDateStr + 'T00:00:00Z');
  const now = new Date();
  
  // Calculate current day on trail based on calendar days
  // Get today at midnight UTC for consistent day calculation
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startDateUTC = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  
  // Calculate difference in days and add 1 (so start date is day 1)
  const daysDiff = Math.floor((todayUTC - startDateUTC) / (86400000));
  const currentDay = daysDiff + 1;

  let totalMiles = 0;
  let movingTimeHours = 0;

  // Today's points (UTC midnight to now)
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let dailyMiles = 0;
  let prevToday = null;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const dist = haversine(prev.lat, prev.lon, curr.lat, curr.lon);
    totalMiles += dist;

    const timeDeltaHours = (curr.time - prev.time) / (1000 * 60 * 60);
    if (curr.velocity > 1) { // Moving threshold
      movingTimeHours += timeDeltaHours;
    }

    // Daily (assume points in UTC; adjust if hiker in specific TZ)
    if (curr.time >= todayStart) {
      if (prevToday && prev.time >= todayStart) {
        dailyMiles += dist;
      }
      prevToday = curr;
    }
  }

  const avgSpeed = movingTimeHours > 0 ? totalMiles / movingTimeHours : 0;
  const completedDays = currentDay > 1 ? currentDay - 1 : 1; // Full days
  const avgDailyMiles = totalMiles / completedDays;
  const milesRemaining = totalTrailMiles - totalMiles;
  const daysRemaining = avgDailyMiles > 0 ? Math.ceil(milesRemaining / avgDailyMiles) : 0;
  const estFinish = new Date(now);
  estFinish.setDate(estFinish.getDate() + daysRemaining);

  return {
    startDate: startDate.toLocaleDateString('en-US'),
    totalMilesCompleted: totalMiles.toFixed(1),
    milesRemaining: milesRemaining.toFixed(1),
    dailyDistance: dailyMiles.toFixed(1),
    averageSpeed: avgSpeed.toFixed(1),
    currentDayOnTrail: currentDay,
    estimatedFinishDate: estFinish.toLocaleDateString('en-US'),
  };
}
