import { getUTCDateString, calculateCurrentDay } from './utils.js';
import { calculateElevationStats } from './stats.js';

// Helper function to generate mock weather data
function generateMockWeather(todayUTC) {
  const getDateString = (daysOffset) => {
    const date = new Date(todayUTC);
    date.setUTCDate(date.getUTCDate() + daysOffset);
    return getUTCDateString(date);
  };

  return {
    current: {
      temperature: 54,
      condition: 'Partly cloudy',
      humidity: 72,
      windSpeed: 9,
      windDirection: 202,
      feelsLike: 51
    },
    forecast: [
      { date: getDateString(0), high: 58, low: 38, condition: 'Partly cloudy' },
      { date: getDateString(1), high: 62, low: 41, condition: 'Sunny' },
      { date: getDateString(2), high: 55, low: 36, condition: 'Thunderstorm' },
      { date: getDateString(3), high: 49, low: 32, condition: 'Light rain' },
      { date: getDateString(4), high: 53, low: 35, condition: 'Partly cloudy' }
    ]
  };
}

// Helper function to generate mock record dates
function generateMockRecordDates(startDate) {
  const longestDayDate = new Date(startDate);
  longestDayDate.setUTCDate(longestDayDate.getUTCDate() + 2); // Day 3: Blood Mountain

  const mostElevationGainDate = new Date(startDate);
  mostElevationGainDate.setUTCDate(mostElevationGainDate.getUTCDate() + 9); // Day 10: Smokies approach

  return {
    longestDayDate: longestDayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    mostElevationGainDate: mostElevationGainDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  };
}

// Generate mock data for demo purposes
// Snapshot: ~12 days in, approaching Fontana Dam, NC (mile ~165)
export function getMockData(startDateStr) {
  const { todayUTC, startDate } = calculateCurrentDay(startDateStr);

  const totalMiles = 165.2;
  const milesRemaining = 2032.7;   // 2197.9 - 165.2
  const dailyDistance = 14.8;      // Today: moderate day approaching Fontana
  const avgSpeed = 2.4;            // Realistic for hilly terrain

  // Hardcoded to match the 12-day mock GPS scenario regardless of today's date
  const mockCurrentDay = 12;
  const avgDailyMiles = totalMiles / (mockCurrentDay - 1);
  const daysRemaining = Math.ceil(milesRemaining / avgDailyMiles);
  const estFinish = new Date(todayUTC);
  estFinish.setUTCDate(estFinish.getUTCDate() + daysRemaining);

  // Near Fontana Dam, NC — consistent with mock points endpoint
  const mockLat = 35.4094;
  const mockLon = -83.7651;

  const mockWeather = generateMockWeather(todayUTC);
  const recordDates = generateMockRecordDates(startDate);

  const longestDayMiles = 18.3;       // Day 3: Springer to Blood Mountain push
  const mostElevationGainFeet = 4820; // Day 10: Smokies approach ridgeline

  return {
    startDate: startDate.toLocaleDateString('en-US'),
    totalMilesCompleted: totalMiles.toFixed(1),
    milesRemaining: milesRemaining.toFixed(1),
    dailyDistance: dailyDistance.toFixed(1),
    averageSpeed: avgSpeed.toFixed(1),
    currentDayOnTrail: mockCurrentDay,
    estimatedFinishDate: estFinish.toLocaleDateString('en-US'),
    longestDayMiles: longestDayMiles.toFixed(1),
    longestDayDate: recordDates.longestDayDate,
    mostElevationGainFeet: mostElevationGainFeet.toString(),
    mostElevationGainDate: recordDates.mostElevationGainDate,
    location: { lat: mockLat, lon: mockLon },
    weather: mockWeather
  };
}

// Generate mock elevation days — 12 days from start date, newest first
// (matches the 12-day span of mock GPS points)
export function getMockElevationDays(startDateStr) {
  const days = [];
  const startDate = new Date(startDateStr + 'T00:00:00Z');

  for (let i = 11; i >= 0; i--) {
    const date = new Date(startDate);
    date.setUTCDate(date.getUTCDate() + i);
    days.push(getUTCDateString(date));
  }

  return days;
}

// AT terrain profiles by day offset — realistic PUD (Pointless Ups and Downs) patterns
// Each entry: [elevationFt, hourOffset] — drawn from known trail segments
const DAY_PROFILES = [
  // Day 0: Springer Mountain → Hawk Mountain Shelter (~8mi, gentle start)
  [[3782,0],[3450,1],[3100,2],[2800,3],[3200,4],[3500,5],[3250,6],[2900,7],[3050,8]],
  // Day 1: Hawk Mountain → Neels Gap approach (~11mi)
  [[3050,0],[2750,1],[3400,2],[3800,3],[3550,4],[3200,5],[3600,6],[4000,7],[3700,8]],
  // Day 2: Blood Mountain & Neels Gap (~9mi, hardest day early on)
  [[3700,0],[4100,1],[4458,2],[4200,3],[3820,4],[3200,5],[3550,6],[4100,7],[3900,8]],
  // Day 3: Zero/town day (Dahlonega — flat, off-trail)
  [[1500,0],[1480,2],[1510,4],[1490,6],[1520,8]],
  // Day 4: Back on trail, Tesnatee Gap → Low Gap (~12mi)
  [[3000,0],[2700,1],[3100,2],[3400,3],[3200,4],[2900,5],[3300,6],[3600,7],[3400,8]],
  // Day 5: Low Gap → Tray Mountain (~13mi, big climb)
  [[3400,0],[3100,1],[3600,2],[4100,3],[4430,4],[4000,5],[3700,6],[3300,7],[3100,8]],
  // Day 6: Zero in Hiawassee (~4mi road walk, flat)
  [[1900,0],[1870,2],[1920,4],[1880,6]],
  // Day 7: Hiawassee → Muskrat Creek Shelter (~14mi, rolling ridges)
  [[4200,0],[3800,1],[4100,2],[4500,3],[4200,4],[3900,5],[4300,6],[4600,7],[4400,8]],
  // Day 8: Zero in Franklin, NC (mostly flat)
  [[2100,0],[2080,2],[2120,4],[2090,6]],
  // Day 9: Winding Stair Gap → Wayah Bald (~11mi)
  [[4500,0],[4100,1],[4600,2],[5040,3],[4700,4],[4300,5],[4600,6],[4900,7],[4700,8]],
  // Day 10: Wayah Bald → Wesser (~14mi, big descent into Nantahala)
  [[5200,0],[4800,1],[4400,2],[3900,3],[3400,4],[2900,5],[2400,6],[1900,7],[1723,8]],
  // Day 11: Resupply in Bryson City (flat town)
  [[1740,0],[1720,2],[1760,4],[1730,6]],
  // Day 12: Stecoah Gap → approaching Fontana (~14mi)
  [[3200,0],[2800,1],[3400,2],[3800,3],[3500,4],[3100,5],[2700,6],[2400,7],[2100,8]],
];

// Generate mock elevation data for a specific day
export function getMockElevationData(dateStr, startDateStr) {
  const points = [];

  const startDate = new Date(startDateStr + 'T00:00:00Z');
  const dayDate = new Date(dateStr + 'T00:00:00Z');
  const dayOffset = Math.round((dayDate - startDate) / (24 * 60 * 60 * 1000));

  const profileIndex = Math.max(0, Math.min(dayOffset, DAY_PROFILES.length - 1));
  const profile = DAY_PROFILES[profileIndex];

  for (let i = 0; i < profile.length; i++) {
    const [baseElev, hourOffset] = profile[i];
    const pointTime = new Date(dateStr + 'T06:00:00Z');
    pointTime.setUTCHours(6 + hourOffset);
    pointTime.setUTCMinutes(Math.floor(Math.random() * 30));

    const randomVariation = (Math.random() - 0.5) * 80;
    const elevation = Math.round(baseElev + randomVariation);

    points.push({
      time: pointTime.toISOString(),
      elevation: elevation
    });
  }

  const elevations = points.map(p => p.elevation);
  const minElevation = Math.round(Math.min(...elevations));
  const maxElevation = Math.round(Math.max(...elevations));

  const { verticalClimbed, verticalLoss } = calculateElevationStats(points);

  // Town/zero days have no speed; hiking days get a realistic value
  const townDayOffsets = [3, 6, 8, 11];
  const isTownDay = townDayOffsets.includes(dayOffset);

  return {
    date: dateStr,
    points: points,
    minElevation: minElevation,
    maxElevation: maxElevation,
    verticalClimbed: verticalClimbed,
    verticalLoss: verticalLoss,
    averageSpeed: isTownDay ? null : 2.4
  };
}
