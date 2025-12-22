// Cloudflare Worker Code for Trail Stats Calculator

// Constants
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
// Trail correction factor to account for trail winding
// Research suggests AT has fractal dimension ~1.08, meaning actual trail
// distance is typically 8-15% longer than straight-line distance
// Using 12% as a reasonable middle ground
const TRAIL_CORRECTION_FACTOR = 1.12;
const ALLOWED_ORIGINS = [
  'https://where-is-al.matthew-declercq.pages.dev',
  'https://whereisal.com',
  'http://localhost:3000',
  'http://localhost:8000',
  'http://127.0.0.1:3000',
];

// Helper function to get CORS origin from request
function getCorsOrigin(request) {
  const origin = request.headers.get('Origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return origin;
  }
  // For development: allow any localhost origin
  if (origin && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))) {
    return origin;
  }
  // Default to first allowed origin if no match (for same-origin requests)
  return ALLOWED_ORIGINS[0];
}

// Helper function to create CORS headers
function getCorsHeaders(request) {
  return {
    'Access-Control-Allow-Origin': getCorsOrigin(request),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}

// Helper function to create error response
function createErrorResponse(status, message, request, additionalHeaders = {}) {
  return new Response(JSON.stringify({ 
    success: false,
    error: message 
  }), {
    status: status,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(request),
      ...additionalHeaders
    }
  });
}

// Helper function to create success response
function createSuccessResponse(data, request, additionalHeaders = {}) {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(request),
      ...additionalHeaders
    }
  });
}

// Decode token from base64 JSON format
function decodeToken(token) {
  try {
    return JSON.parse(atob(token));
  } catch (error) {
    return null;
  }
}

// Validate authentication token
async function validateToken(token, env) {
  if (!token) {
    return false;
  }
  
  try {
    // Try KV-based validation first (more secure, allows revocation)
    if (env.TRAIL_HISTORY) {
      const tokenData = await env.TRAIL_HISTORY.get(`token:${token}`);
      if (tokenData) {
        const { expires } = JSON.parse(tokenData);
        if (Date.now() < expires) {
          return true;
        } else {
          // Token expired, clean it up
          await env.TRAIL_HISTORY.delete(`token:${token}`);
          return false;
        }
      }
    }
    
    // Fallback: decode token to check expiry (works without KV)
    // Token format: base64(JSON.stringify({id, expires}))
    const decoded = decodeToken(token);
    if (!decoded || !decoded.expires) {
      return false;
    }
    
    return Date.now() < decoded.expires;
  } catch (error) {
    console.error('Token validation error:', error);
    return false;
  }
}

// Store authentication token
async function storeToken(token, expires, env) {
  // Store in KV if available (allows revocation)
  if (env.TRAIL_HISTORY) {
    try {
      await env.TRAIL_HISTORY.put(
        `token:${token}`,
        JSON.stringify({ expires }),
        { expirationTtl: Math.floor((expires - Date.now()) / 1000) }
      );
    } catch (error) {
      console.error('Failed to store token in KV:', error);
    }
  }
}

// Build KML URL from MapShare ID and password
function buildKmlUrl(mapshareId, password) {
  let kmlUrl = `https://share.garmin.com/Feed/Share/${mapshareId}`;
  if (password) {
    kmlUrl += `?pw=${password}`;
  }
  return kmlUrl;
}

// Generate mock data for demo purposes
function getMockData(startDateStr) {
  const startDate = new Date(startDateStr + 'T00:00:00Z');
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startDateUTC = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  const daysDiff = Math.floor((todayUTC - startDateUTC) / (86400000));
  const currentDay = Math.max(1, daysDiff + 1);
  
  // Mock trail progress (about 15% complete - realistic for a few weeks on trail)
  const totalMiles = 330.0;
  const milesRemaining = 1867.9;
  const dailyDistance = 12.5;
  const avgSpeed = 2.3;
  
  // Calculate estimated finish
  const completedDays = currentDay > 1 ? currentDay - 1 : 1;
  const avgDailyMiles = completedDays > 0 ? totalMiles / completedDays : 0;
  const daysRemaining = avgDailyMiles > 0 ? Math.ceil(milesRemaining / avgDailyMiles) : 0;
  const estFinish = new Date(todayUTC);
  estFinish.setUTCDate(estFinish.getUTCDate() + daysRemaining);
  
  // Mock location (somewhere in Virginia on the AT - Shenandoah area)
  const mockLat = 38.6270;
  const mockLon = -78.3444;
  
  // Generate forecast dates
  const getDateString = (daysOffset) => {
    const date = new Date(todayUTC);
    date.setUTCDate(date.getUTCDate() + daysOffset);
    return date.toISOString().split('T')[0];
  };
  
  // Mock weather data
  const mockWeather = {
    current: {
      temperature: 68,
      condition: 'Partly cloudy',
      humidity: 65,
      windSpeed: 7,
      windDirection: 180,
      feelsLike: 70
    },
    forecast: [
      { date: getDateString(0), high: 72, low: 58, condition: 'Partly cloudy' },
      { date: getDateString(1), high: 75, low: 60, condition: 'Sunny' },
      { date: getDateString(2), high: 70, low: 55, condition: 'Partly cloudy' },
      { date: getDateString(3), high: 68, low: 52, condition: 'Light rain' },
      { date: getDateString(4), high: 65, low: 50, condition: 'Partly cloudy' }
    ]
  };
  
  // Mock longest day record
  const longestDayMiles = 18.7;
  const longestDayDate = new Date(todayUTC);
  longestDayDate.setUTCDate(longestDayDate.getUTCDate() - 5); // 5 days ago
  
  return {
    startDate: startDate.toLocaleDateString('en-US'),
    totalMilesCompleted: totalMiles.toFixed(1),
    milesRemaining: milesRemaining.toFixed(1),
    dailyDistance: dailyDistance.toFixed(1),
    averageSpeed: avgSpeed.toFixed(1),
    currentDayOnTrail: currentDay,
    estimatedFinishDate: estFinish.toLocaleDateString('en-US'),
    longestDayMiles: longestDayMiles.toFixed(1),
    longestDayDate: longestDayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    location: { lat: mockLat, lon: mockLon },
    weather: mockWeather
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: getCorsHeaders(request)
      });
    }
    
    // Handle authentication endpoint (public, no token required)
    if (url.pathname === '/auth' && request.method === 'POST') {
      return handleAuth(request, env);
    }
    
    // Handle sync endpoint (requires authentication)
    if (url.pathname === '/sync' && request.method === 'GET') {
      const authHeader = request.headers.get('Authorization');
      const token = authHeader ? authHeader.replace('Bearer ', '') : null;
      
      if (!token || !(await validateToken(token, env))) {
        return createErrorResponse(401, 'Unauthorized - Invalid or missing token', request);
      }
      
      return handleSync(request, env);
    }
    
    // Handle stats endpoint (requires authentication)
    const authHeader = request.headers.get('Authorization');
    const token = authHeader ? authHeader.replace('Bearer ', '') : null;
    
    if (!token || !(await validateToken(token, env))) {
      return createErrorResponse(401, 'Unauthorized - Invalid or missing token', request);
    }
    
    return handleStats(request, env);
  },
};

// Authentication handler
async function handleAuth(request, env) {
  try {
    const { password } = await request.json();
    const CORRECT_PASSWORD = env.SITE_PASSWORD;
    
    if (!CORRECT_PASSWORD) {
      return createErrorResponse(500, 'Authentication not configured', request);
    }
    
    if (password.toLowerCase() === CORRECT_PASSWORD) {
      // Generate a session token with embedded expiry
      // Format: base64(JSON.stringify({id: uuid, expires: timestamp}))
      const tokenId = crypto.randomUUID();
      const expiry = Date.now() + TOKEN_EXPIRY_MS;
      const tokenData = { id: tokenId, expires: expiry };
      const token = btoa(JSON.stringify(tokenData));
      
      // Store token in KV for validation (if available)
      await storeToken(token, expiry, env);
      
      return createSuccessResponse({ 
        success: true, 
        token: token,
        expires: expiry 
      }, request, {
        'Cache-Control': 'no-cache'
      });
    }
    
    return createErrorResponse(401, 'Invalid password', request, {
      'Cache-Control': 'no-cache'
    });
  } catch (error) {
    return createErrorResponse(400, 'Invalid request format', request);
  }
}

// Sync handler for manual point synchronization
async function handleSync(request, env) {
  const MAPSHARE_ID = env.MAPSHARE_ID;
  const MAPSHARE_PASSWORD = env.MAPSHARE_PASSWORD || '';
  const START_DATE_STR = env.START_DATE;
  const USE_MOCK_DATA = env.USE_MOCK_DATA === 'true';

  if (USE_MOCK_DATA) {
    return createErrorResponse(400, 'Sync not available in mock data mode', request);
  }

  if (!env.TRAIL_HISTORY) {
    return createErrorResponse(500, 'KV namespace not configured', request);
  }

  if (!MAPSHARE_ID) {
    return createErrorResponse(500, 'MAPSHARE_ID environment variable not configured', request);
  }

  if (!START_DATE_STR) {
    return createErrorResponse(500, 'START_DATE environment variable not configured', request);
  }

  try {
    // Build KML URL
    const kmlUrl = buildKmlUrl(MAPSHARE_ID, MAPSHARE_PASSWORD);

    // Fetch KML
    const kmlResponse = await fetch(kmlUrl);
    if (!kmlResponse.ok) throw new Error('Failed to fetch KML');
    const kmlText = await kmlResponse.text();

    // Parse KML
    const kmlPoints = parseKmlPoints(kmlText, new Date(START_DATE_STR));

    // Store points
    await storePointsByDay(kmlPoints, env);

    // Get total stored points count
    const keys = await env.TRAIL_HISTORY.list({ prefix: 'points:' });
    let totalPoints = 0;
    for (const key of keys.keys) {
      const dayPointsJson = await env.TRAIL_HISTORY.get(key.name);
      if (dayPointsJson) {
        const dayPoints = JSON.parse(dayPointsJson);
        totalPoints += dayPoints.length;
      }
    }

    return createSuccessResponse({
      success: true,
      message: 'Sync completed',
      kmlPointsProcessed: kmlPoints.length,
      totalStoredPoints: totalPoints,
      daysStored: keys.keys.length
    }, request);
  } catch (error) {
    return createErrorResponse(500, error.message, request);
  }
}

// Validate environment variables
function validateEnvVars(env, requireMapshare = true) {
  const errors = [];
  
  if (requireMapshare && !env.MAPSHARE_ID) {
    errors.push('MAPSHARE_ID environment variable not configured');
  }
  
  if (!env.START_DATE) {
    errors.push('START_DATE environment variable not configured');
  } else {
    // Validate START_DATE format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(env.START_DATE)) {
      errors.push('START_DATE must be in YYYY-MM-DD format');
    } else {
      const testDate = new Date(env.START_DATE + 'T00:00:00Z');
      if (isNaN(testDate.getTime())) {
        errors.push('START_DATE is not a valid date');
      }
    }
  }
  
  if (env.START_LAT !== undefined) {
    const lat = parseFloat(env.START_LAT);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      errors.push('START_LAT must be a valid latitude between -90 and 90');
    }
  }
  
  if (env.START_LON !== undefined) {
    const lon = parseFloat(env.START_LON);
    if (isNaN(lon) || lon < -180 || lon > 180) {
      errors.push('START_LON must be a valid longitude between -180 and 180');
    }
  }
  
  return errors;
}

// Stats handler (existing functionality)
async function handleStats(request, env) {
  // Config from env
  const MAPSHARE_ID = env.MAPSHARE_ID;
  const MAPSHARE_PASSWORD = env.MAPSHARE_PASSWORD || '';
  const START_DATE_STR = env.START_DATE;
  const START_LAT = env.START_LAT !== undefined ? parseFloat(env.START_LAT) : undefined;
  const START_LON = env.START_LON !== undefined ? parseFloat(env.START_LON) : undefined;
  const TOTAL_TRAIL_MILES = 2197.9;
  const USE_MOCK_DATA = env.USE_MOCK_DATA === 'true';

  // If mock mode is enabled, return mock data immediately
  if (USE_MOCK_DATA) {
    const validationErrors = validateEnvVars(env, false);
    if (validationErrors.length > 0) {
      return createErrorResponse(500, validationErrors.join('; '), request, {
        'Cache-Control': 'no-cache'
      });
    }
    const mockData = getMockData(START_DATE_STR);
    return createSuccessResponse(mockData, request, {
      'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
    });
  }

  // Validate required environment variables
  const validationErrors = validateEnvVars(env, true);
  if (validationErrors.length > 0) {
    return createErrorResponse(500, validationErrors.join('; '), request, {
      'Cache-Control': 'no-cache'
    });
  }

    // Build KML URL
    const kmlUrl = buildKmlUrl(MAPSHARE_ID, MAPSHARE_PASSWORD);

    try {
      // Fetch KML
      const kmlResponse = await fetch(kmlUrl);
      if (!kmlResponse.ok) throw new Error('Failed to fetch KML');
      const kmlText = await kmlResponse.text();

      // Parse KML (manual lightweight parser since no DOMParser in Workers)
      const kmlPoints = parseKmlPoints(kmlText, new Date(START_DATE_STR));

      // Load historical points from KV
      const historicalPoints = await loadHistoricalPoints(START_DATE_STR, env);
      
      // Merge KML points with historical points
      const allPoints = mergePoints(kmlPoints, historicalPoints);

      // Calculate stats from merged dataset
      const stats = calculateStats(allPoints, START_DATE_STR, TOTAL_TRAIL_MILES);

      // Store new/updated points in KV (async, don't block response)
      if (env.TRAIL_HISTORY && kmlPoints.length > 0) {
        storePointsByDay(kmlPoints, env).catch(err => {
          console.error('Failed to store points:', err);
        });
      }

      // Get current location from most recent point
      let weather = null;
      let location = null;
      if (allPoints.length > 0) {
        const currentPoint = allPoints[allPoints.length - 1];
        location = { lat: currentPoint.lat, lon: currentPoint.lon };
        
        // Fetch weather data
        try {
          weather = await fetchWeather(currentPoint.lat, currentPoint.lon);
        } catch (error) {
          console.error('Weather fetch failed:', error);
          // Continue without weather - graceful degradation
        }
      }

      // Combine stats with weather and location
      const response = {
        ...stats,
        location: location,
        weather: weather
      };

      // Return JSON with cache headers
      // Cache for 5 minutes - trail data doesn't change that frequently
      return createSuccessResponse(response, request, {
        'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
      });
    } catch (error) {
      return createErrorResponse(500, error.message, request, {
        'Cache-Control': 'no-cache' // Don't cache errors
      });
    }
}

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


// Load all historical points from KV
async function loadHistoricalPoints(startDateStr, env) {
  if (!env.TRAIL_HISTORY) {
    return [];
  }
  
  try {
    const startDate = new Date(startDateStr + 'T00:00:00Z');
    const allPoints = [];
    
    // List all keys with prefix "points:"
    const keys = await env.TRAIL_HISTORY.list({ prefix: 'points:' });
    
    // Fetch points for each day
    for (const key of keys.keys) {
      try {
        const dayPointsJson = await env.TRAIL_HISTORY.get(key.name);
        if (dayPointsJson) {
          const dayPoints = JSON.parse(dayPointsJson);
          // Convert time strings back to Date objects
          const parsedPoints = dayPoints.map(p => ({
            ...p,
            time: new Date(p.time)
          }));
          allPoints.push(...parsedPoints);
        }
      } catch (error) {
        console.error(`Failed to parse points for ${key.name}:`, error);
      }
    }
    
    // Filter by start date and sort
    return allPoints
      .filter(p => p.time >= startDate)
      .sort((a, b) => a.time - b.time);
  } catch (error) {
    console.error('Failed to load historical points:', error);
    return [];
  }
}

// Store points grouped by day in KV
async function storePointsByDay(points, env) {
  if (!env.TRAIL_HISTORY || points.length === 0) {
    return;
  }
  
  try {
    // Group points by date (YYYY-MM-DD)
    const pointsByDay = new Map();
    
    for (const point of points) {
      const dateKey = point.time.toISOString().split('T')[0];
      if (!pointsByDay.has(dateKey)) {
        pointsByDay.set(dateKey, []);
      }
      pointsByDay.get(dateKey).push(point);
    }
    
    // Store each day's points, merging with existing data
    for (const [dateKey, dayPoints] of pointsByDay.entries()) {
      const kvKey = `points:${dateKey}`;
      
      try {
        // Get existing points for this day
        const existingJson = await env.TRAIL_HISTORY.get(kvKey);
        let existingPoints = [];
        
        if (existingJson) {
          existingPoints = JSON.parse(existingJson).map(p => ({
            ...p,
            time: new Date(p.time)
          }));
        }
        
        // Merge and deduplicate by timestamp
        const pointMap = new Map();
        
        // Add existing points
        for (const p of existingPoints) {
          const timeKey = p.time.toISOString();
          pointMap.set(timeKey, p);
        }
        
        // Add new points (will overwrite duplicates)
        for (const p of dayPoints) {
          const timeKey = p.time.toISOString();
          pointMap.set(timeKey, p);
        }
        
        // Convert back to array and serialize (time as ISO string for JSON)
        const mergedPoints = Array.from(pointMap.values())
          .sort((a, b) => a.time - b.time)
          .map(p => ({
            lat: p.lat,
            lon: p.lon,
            time: p.time.toISOString(),
            velocity: p.velocity
          }));
        
        // Store in KV
        await env.TRAIL_HISTORY.put(kvKey, JSON.stringify(mergedPoints));
      } catch (error) {
        console.error(`Failed to store points for ${dateKey}:`, error);
      }
    }
    
    // Update latest timestamp
    if (points.length > 0) {
      const latestPoint = points[points.length - 1];
      await env.TRAIL_HISTORY.put('meta:latest_timestamp', latestPoint.time.toISOString());
    }
  } catch (error) {
    console.error('Failed to store points:', error);
  }
}

// Merge KML points with historical points, deduplicating by timestamp
function mergePoints(kmlPoints, historicalPoints) {
  const pointMap = new Map();
  
  // Add historical points first
  for (const p of historicalPoints) {
    const timeKey = p.time.toISOString();
    pointMap.set(timeKey, p);
  }
  
  // Add KML points (will overwrite duplicates)
  for (const p of kmlPoints) {
    const timeKey = p.time.toISOString();
    pointMap.set(timeKey, p);
  }
  
  // Return sorted array
  return Array.from(pointMap.values()).sort((a, b) => a.time - b.time);
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

// Fetch weather data from Open-Meteo API
async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,apparent_temperature&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=5`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status}`);
  }
  
  const data = await response.json();
  
  // Convert weather codes to human-readable conditions
  const weatherCodeMap = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Foggy',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    56: 'Light freezing drizzle',
    57: 'Dense freezing drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    66: 'Light freezing rain',
    67: 'Heavy freezing rain',
    71: 'Slight snow',
    73: 'Moderate snow',
    75: 'Heavy snow',
    77: 'Snow grains',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    85: 'Slight snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail'
  };
  
  const current = data.current;
  const daily = data.daily;
  
  // Format forecast data
  const forecast = [];
  for (let i = 0; i < Math.min(daily.time.length, 5); i++) {
    forecast.push({
      date: daily.time[i],
      high: Math.round(daily.temperature_2m_max[i]),
      low: Math.round(daily.temperature_2m_min[i]),
      condition: weatherCodeMap[daily.weather_code[i]] || 'Unknown'
    });
  }
  
  return {
    current: {
      temperature: Math.round(current.temperature_2m),
      condition: weatherCodeMap[current.weather_code] || 'Unknown',
      humidity: current.relative_humidity_2m,
      windSpeed: Math.round(current.wind_speed_10m * 0.621371), // Convert km/h to mph
      windDirection: current.wind_direction_10m,
      feelsLike: Math.round(current.apparent_temperature)
    },
    forecast: forecast
  };
}

// Calculate daily mileage for all days
function calculateDailyMileage(points, startDateStr) {
  const dailyMileageMap = new Map();
  
  if (points.length < 2) {
    return dailyMileageMap;
  }
  
  // Group points by date
  const pointsByDate = new Map();
  for (const point of points) {
    const dateKey = point.time.toISOString().split('T')[0];
    if (!pointsByDate.has(dateKey)) {
      pointsByDate.set(dateKey, []);
    }
    pointsByDate.get(dateKey).push(point);
  }
  
  // Calculate mileage for each day
  for (const [dateKey, dayPoints] of pointsByDate.entries()) {
    if (dayPoints.length < 2) {
      dailyMileageMap.set(dateKey, 0);
      continue;
    }
    
    let dayMiles = 0;
    const sortedDayPoints = dayPoints.sort((a, b) => a.time - b.time);
    
    for (let i = 1; i < sortedDayPoints.length; i++) {
      const prev = sortedDayPoints[i - 1];
      const curr = sortedDayPoints[i];
      const dist = haversine(prev.lat, prev.lon, curr.lat, curr.lon);
      dayMiles += dist;
    }
    
    // Apply trail correction factor
    dayMiles = dayMiles * TRAIL_CORRECTION_FACTOR;
    dailyMileageMap.set(dateKey, dayMiles);
  }
  
  return dailyMileageMap;
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
      startDate: new Date(startDateStr + 'T00:00:00Z').toLocaleDateString('en-US'),
      longestDayMiles: '0.0',
      longestDayDate: 'N/A'
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
  const currentDay = Math.max(1, daysDiff + 1);

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

  // Apply trail correction factor to account for trail winding
  // This converts straight-line GPS distance to approximate actual trail distance
  totalMiles = totalMiles * TRAIL_CORRECTION_FACTOR;
  dailyMiles = dailyMiles * TRAIL_CORRECTION_FACTOR;

  const avgSpeed = movingTimeHours > 0 ? totalMiles / movingTimeHours : 0;
  const completedDays = currentDay > 1 ? currentDay - 1 : 1; // Full days
  const avgDailyMiles = completedDays > 0 ? totalMiles / completedDays : 0;
  const milesRemaining = totalTrailMiles - totalMiles;
  const daysRemaining = avgDailyMiles > 0 ? Math.ceil(milesRemaining / avgDailyMiles) : 0;
  const estFinish = new Date(todayUTC);
  estFinish.setUTCDate(estFinish.getUTCDate() + daysRemaining);

  // Calculate longest day record
  const dailyMileage = calculateDailyMileage(points, startDateStr);
  let longestDayMiles = 0;
  let longestDayDate = null;
  
  for (const [date, miles] of dailyMileage.entries()) {
    if (miles > longestDayMiles) {
      longestDayMiles = miles;
      longestDayDate = date;
    }
  }

  const result = {
    startDate: startDate.toLocaleDateString('en-US'),
    totalMilesCompleted: totalMiles.toFixed(1),
    milesRemaining: milesRemaining.toFixed(1),
    dailyDistance: dailyMiles.toFixed(1),
    averageSpeed: avgSpeed.toFixed(1),
    currentDayOnTrail: currentDay,
    estimatedFinishDate: estFinish.toLocaleDateString('en-US'),
    longestDayMiles: longestDayDate ? longestDayMiles.toFixed(1) : '0.0',
    longestDayDate: longestDayDate ? (new Date(longestDayDate + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) : 'N/A'
  };
  
  return result;
}
