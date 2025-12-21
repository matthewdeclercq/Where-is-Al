// Cloudflare Worker Code for Trail Stats Calculator
// Copy this code into your Cloudflare Workers dashboard editor
// See CLOUDFLARE_SETUP.md for deployment instructions

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
  const avgDailyMiles = totalMiles / completedDays;
  const daysRemaining = avgDailyMiles > 0 ? Math.ceil(milesRemaining / avgDailyMiles) : 0;
  const estFinish = new Date(now);
  estFinish.setDate(estFinish.getDate() + daysRemaining);
  
  // Mock location (somewhere in Virginia on the AT - Shenandoah area)
  const mockLat = 38.6270;
  const mockLon = -78.3444;
  
  // Generate forecast dates
  const getDateString = (daysOffset) => {
    const date = new Date(now);
    date.setDate(date.getDate() + daysOffset);
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
  
  return {
    startDate: startDate.toLocaleDateString('en-US'),
    totalMilesCompleted: totalMiles.toFixed(1),
    milesRemaining: milesRemaining.toFixed(1),
    dailyDistance: dailyDistance.toFixed(1),
    averageSpeed: avgSpeed.toFixed(1),
    currentDayOnTrail: currentDay,
    estimatedFinishDate: estFinish.toLocaleDateString('en-US'),
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
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400'
        }
      });
    }
    
    // Handle authentication endpoint
    if (url.pathname === '/auth' && request.method === 'POST') {
      return handleAuth(request, env);
    }
    
    // Handle stats endpoint (default)
    return handleStats(request, env);
  },
};

// Authentication handler
async function handleAuth(request, env) {
  try {
    const { password } = await request.json();
    const CORRECT_PASSWORD = env.SITE_PASSWORD;
    
    if (!CORRECT_PASSWORD) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Authentication not configured' 
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }
    
    if (password.toLowerCase() === CORRECT_PASSWORD) {
      // Generate a session token
      const token = crypto.randomUUID();
      const expiry = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
      
      return new Response(JSON.stringify({ 
        success: true, 
        token: token,
        expires: expiry 
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Cache-Control': 'no-cache'
        }
      });
    }
    
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Invalid password'
    }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'no-cache'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Invalid request format'
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }
}

// Stats handler (existing functionality)
async function handleStats(request, env) {
  // Config from env
  const MAPSHARE_ID = env.MAPSHARE_ID;
  const MAPSHARE_PASSWORD = env.MAPSHARE_PASSWORD || '';
  const START_DATE_STR = env.START_DATE;
  const START_LAT = parseFloat(env.START_LAT);
  const START_LON = parseFloat(env.START_LON);
  const TOTAL_TRAIL_MILES = 2197.9;
  const USE_MOCK_DATA = env.USE_MOCK_DATA === 'true';

    // If mock mode is enabled, return mock data immediately
    if (USE_MOCK_DATA) {
      const mockData = getMockData(START_DATE_STR);
      return new Response(JSON.stringify(mockData), {
        headers: { 
          'Content-Type': 'application/json', 
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
        },
      });
    }

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

      // Get current location from most recent point
      let weather = null;
      let location = null;
      if (points.length > 0) {
        const currentPoint = points[points.length - 1];
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
      return new Response(JSON.stringify(response), {
        headers: { 
          'Content-Type': 'application/json', 
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
        },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache' // Don't cache errors
        }
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

// Main stats calculator
function calculateStats(points, startDateStr, totalTrailMiles) {
  // Trail correction factor to account for trail winding
  // Research suggests AT has fractal dimension ~1.08, meaning actual trail
  // distance is typically 8-15% longer than straight-line distance
  // Using 12% as a reasonable middle ground
  const TRAIL_CORRECTION_FACTOR = 1.12;

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

  // Apply trail correction factor to account for trail winding
  // This converts straight-line GPS distance to approximate actual trail distance
  totalMiles = totalMiles * TRAIL_CORRECTION_FACTOR;
  dailyMiles = dailyMiles * TRAIL_CORRECTION_FACTOR;

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
