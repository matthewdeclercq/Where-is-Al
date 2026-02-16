import { haversine } from './geo.js';
import { getUTCDateString, groupPointsByDate, calculateCurrentDay } from './utils.js';
import {
  MOVING_VELOCITY_THRESHOLD_MPH,
  MIN_DAY_ON_TRAIL,
  TRAIL_CORRECTION_FACTOR
} from './constants.js';

/**
 * Helper function to calculate elevation statistics from points array
 */
export function calculateElevationStats(points) {
  let verticalClimbed = 0;
  let verticalLoss = 0;

  for (let i = 1; i < points.length; i++) {
    const currElev = points[i].elevation;
    const prevElev = points[i - 1].elevation;
    if (!Number.isFinite(currElev) || !Number.isFinite(prevElev)) continue;
    const elevationChange = currElev - prevElev;
    if (elevationChange > 0) {
      verticalClimbed += elevationChange;
    } else if (elevationChange < 0) {
      verticalLoss += Math.abs(elevationChange);
    }
  }

  return {
    verticalClimbed: Math.round(verticalClimbed),
    verticalLoss: Math.round(verticalLoss)
  };
}

/**
 * Calculate daily elevation gain for all days
 */
function calculateDailyElevationGain(points, startDateStr) {
  const dailyElevationGainMap = new Map();

  if (points.length < 2) {
    return dailyElevationGainMap;
  }

  const pointsByDate = groupPointsByDate(points);

  for (const [dateKey, dayPoints] of pointsByDate.entries()) {
    if (dayPoints.length < 2) {
      dailyElevationGainMap.set(dateKey, 0);
      continue;
    }

    const pointsWithElevation = dayPoints.filter(p => p.elevation !== null && p.elevation !== undefined);

    if (pointsWithElevation.length < 2) {
      dailyElevationGainMap.set(dateKey, 0);
      continue;
    }

    let dayElevationGain = 0;
    const sortedDayPoints = pointsWithElevation.sort((a, b) => a.time - b.time);

    for (let i = 1; i < sortedDayPoints.length; i++) {
      const prev = sortedDayPoints[i - 1];
      const curr = sortedDayPoints[i];
      const elevationChange = curr.elevation - prev.elevation;
      if (elevationChange > 0) {
        dayElevationGain += elevationChange;
      }
    }

    dailyElevationGainMap.set(dateKey, Math.round(dayElevationGain));
  }

  return dailyElevationGainMap;
}

/**
 * Calculate daily mileage for all days
 */
function calculateDailyMileage(points, startDateStr) {
  const dailyMileageMap = new Map();

  if (points.length < 2) {
    return dailyMileageMap;
  }

  const pointsByDate = groupPointsByDate(points);

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

    dayMiles = dayMiles * TRAIL_CORRECTION_FACTOR;
    dailyMileageMap.set(dateKey, dayMiles);
  }

  return dailyMileageMap;
}

/**
 * Main stats calculator
 */
export function calculateStats(points, startDateStr, totalTrailMiles, options = {}) {
  // Optionally filter out off-trail points
  if (options.filterOffTrail) {
    points = points.filter(p => p.onTrail !== false);
  }

  if (points.length < 2) {
    return {
      totalMilesCompleted: '0.0',
      milesRemaining: totalTrailMiles.toFixed(1),
      dailyDistance: '0.0',
      averageSpeed: '0.0',
      currentDayOnTrail: MIN_DAY_ON_TRAIL,
      estimatedFinishDate: 'N/A',
      startDate: new Date(startDateStr + 'T00:00:00Z').toLocaleDateString('en-US'),
      longestDayMiles: '0.0',
      longestDayDate: 'N/A',
      mostElevationGainFeet: '0',
      mostElevationGainDate: 'N/A'
    };
  }

  const { currentDay, todayUTC, startDate } = calculateCurrentDay(startDateStr);

  let totalMiles = 0;
  let movingTimeHours = 0;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    if (!Number.isFinite(prev.lat) || !Number.isFinite(prev.lon) ||
        !Number.isFinite(curr.lat) || !Number.isFinite(curr.lon)) continue;
    const dist = haversine(prev.lat, prev.lon, curr.lat, curr.lon);
    totalMiles += dist;

    const timeDeltaHours = (curr.time - prev.time) / (1000 * 60 * 60);
    if (curr.velocity > MOVING_VELOCITY_THRESHOLD_MPH) {
      movingTimeHours += timeDeltaHours;
    }
  }

  totalMiles = totalMiles * TRAIL_CORRECTION_FACTOR;

  const dailyMileageMap = calculateDailyMileage(points, startDateStr);
  const todayStr = getUTCDateString(todayUTC);
  const dailyMiles = dailyMileageMap.get(todayStr) || 0;

  const avgSpeed = movingTimeHours > 0 ? totalMiles / movingTimeHours : 0;
  const completedDays = currentDay > MIN_DAY_ON_TRAIL ? currentDay - 1 : MIN_DAY_ON_TRAIL;
  const avgDailyMiles = completedDays > 0 ? totalMiles / completedDays : 0;
  const milesRemaining = Math.max(0, totalTrailMiles - totalMiles);
  const daysRemaining = avgDailyMiles > 0 && milesRemaining > 0 ? Math.ceil(milesRemaining / avgDailyMiles) : 0;
  const estFinish = new Date(todayUTC);
  estFinish.setUTCDate(estFinish.getUTCDate() + daysRemaining);

  let longestDayMiles = 0;
  let longestDayDate = null;

  for (const [date, miles] of dailyMileageMap.entries()) {
    if (miles > longestDayMiles) {
      longestDayMiles = miles;
      longestDayDate = date;
    }
  }

  const dailyElevationGain = calculateDailyElevationGain(points, startDateStr);
  let mostElevationGainFeet = 0;
  let mostElevationGainDate = null;

  for (const [date, elevationGain] of dailyElevationGain.entries()) {
    if (elevationGain > mostElevationGainFeet) {
      mostElevationGainFeet = elevationGain;
      mostElevationGainDate = date;
    }
  }

  return {
    startDate: startDate.toLocaleDateString('en-US'),
    totalMilesCompleted: totalMiles.toFixed(1),
    milesRemaining: milesRemaining.toFixed(1),
    dailyDistance: dailyMiles.toFixed(1),
    averageSpeed: avgSpeed.toFixed(1),
    currentDayOnTrail: currentDay,
    estimatedFinishDate: estFinish.toLocaleDateString('en-US'),
    longestDayMiles: longestDayDate ? longestDayMiles.toFixed(1) : '0.0',
    longestDayDate: longestDayDate ? (new Date(longestDayDate + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) : 'N/A',
    mostElevationGainFeet: mostElevationGainDate ? mostElevationGainFeet.toString() : '0',
    mostElevationGainDate: mostElevationGainDate ? (new Date(mostElevationGainDate + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) : 'N/A'
  };
}
