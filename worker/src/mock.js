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
}

// Helper function to generate mock record dates
function generateMockRecordDates(todayUTC) {
  const longestDayDate = new Date(todayUTC);
  longestDayDate.setUTCDate(longestDayDate.getUTCDate() - 5);

  const mostElevationGainDate = new Date(todayUTC);
  mostElevationGainDate.setUTCDate(mostElevationGainDate.getUTCDate() - 3);

  return {
    longestDayDate: longestDayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    mostElevationGainDate: mostElevationGainDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  };
}

// Generate mock data for demo purposes
export function getMockData(startDateStr) {
  const { currentDay, todayUTC, startDate } = calculateCurrentDay(startDateStr);

  const totalMiles = 330.0;
  const milesRemaining = 1867.9;
  const dailyDistance = 12.5;
  const avgSpeed = 2.3;

  const completedDays = currentDay > 1 ? currentDay - 1 : 1;
  const avgDailyMiles = completedDays > 0 ? totalMiles / completedDays : 0;
  const daysRemaining = avgDailyMiles > 0 ? Math.ceil(milesRemaining / avgDailyMiles) : 0;
  const estFinish = new Date(todayUTC);
  estFinish.setUTCDate(estFinish.getUTCDate() + daysRemaining);

  const mockLat = 38.6270;
  const mockLon = -78.3444;

  const mockWeather = generateMockWeather(todayUTC);
  const recordDates = generateMockRecordDates(todayUTC);

  const longestDayMiles = 18.7;
  const mostElevationGainFeet = 3420;

  return {
    startDate: startDate.toLocaleDateString('en-US'),
    totalMilesCompleted: totalMiles.toFixed(1),
    milesRemaining: milesRemaining.toFixed(1),
    dailyDistance: dailyDistance.toFixed(1),
    averageSpeed: avgSpeed.toFixed(1),
    currentDayOnTrail: currentDay,
    estimatedFinishDate: estFinish.toLocaleDateString('en-US'),
    longestDayMiles: longestDayMiles.toFixed(1),
    longestDayDate: recordDates.longestDayDate,
    mostElevationGainFeet: mostElevationGainFeet.toString(),
    mostElevationGainDate: recordDates.mostElevationGainDate,
    location: { lat: mockLat, lon: mockLon },
    weather: mockWeather
  };
}

// Generate mock elevation days (last 7 days)
export function getMockElevationDays(startDateStr) {
  const days = [];
  const today = new Date();
  const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  for (let i = 0; i < 7; i++) {
    const date = new Date(todayUTC);
    date.setUTCDate(date.getUTCDate() - i);
    days.push(getUTCDateString(date));
  }

  return days;
}

// Generate mock elevation data for a specific day
export function getMockElevationData(dateStr, startDateStr) {
  const baseElevation = 2000;
  const points = [];

  const date = new Date(dateStr + 'T06:00:00Z');

  for (let i = 0; i < 28; i++) {
    const pointTime = new Date(date);
    pointTime.setUTCHours(6 + Math.floor(i / 2));
    pointTime.setUTCMinutes((i % 2) * 30);

    const progress = i / 27;
    let elevationVariation = 0;

    if (progress < 0.2) {
      elevationVariation = progress * 0.2 * 1500;
    } else if (progress < 0.4) {
      elevationVariation = 0.2 * 1500 - (progress - 0.2) * 0.2 * 1000;
    } else if (progress < 0.7) {
      elevationVariation = 0.1 * 1500 + (progress - 0.4) * 0.3 * 2000;
    } else {
      elevationVariation = 0.7 * 2000 - (progress - 0.7) * 0.3 * 1500;
    }

    const randomVariation = (Math.random() - 0.5) * 100;
    const elevation = Math.round(baseElevation + elevationVariation + randomVariation);

    points.push({
      time: pointTime.toISOString(),
      elevation: elevation
    });
  }

  const elevations = points.map(p => p.elevation);
  const minElevation = Math.round(Math.min(...elevations));
  const maxElevation = Math.round(Math.max(...elevations));

  const { verticalClimbed, verticalLoss } = calculateElevationStats(points);

  return {
    date: dateStr,
    points: points,
    minElevation: minElevation,
    maxElevation: maxElevation,
    verticalClimbed: verticalClimbed,
    verticalLoss: verticalLoss
  };
}
