import { haversine } from './geo.js';
import { getUTCDateString, groupPointsByDate, calculateCurrentDay } from './utils.js';
import {
  MOVING_VELOCITY_THRESHOLD_MPH,
  MIN_DAY_ON_TRAIL
} from './constants.js';

/**
 * Get the effective elevation for a point, preferring trailElevation over GPS elevation.
 */
function getElevation(point) {
  if (point.trailElevation != null) return point.trailElevation;
  if (point.elevation != null) return point.elevation;
  return null;
}

/**
 * Helper function to calculate elevation statistics from points array
 */
export function calculateElevationStats(points) {
  let verticalClimbed = 0;
  let verticalLoss = 0;

  for (let i = 1; i < points.length; i++) {
    const currElev = getElevation(points[i]);
    const prevElev = getElevation(points[i - 1]);
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
function calculateDailyElevationGain(points) {
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

    const pointsWithElevation = dayPoints.filter(p => getElevation(p) !== null);

    if (pointsWithElevation.length < 2) {
      dailyElevationGainMap.set(dateKey, 0);
      continue;
    }

    let dayElevationGain = 0;
    const sortedDayPoints = pointsWithElevation.sort((a, b) => a.time - b.time);

    for (let i = 1; i < sortedDayPoints.length; i++) {
      const prev = getElevation(sortedDayPoints[i - 1]);
      const curr = getElevation(sortedDayPoints[i]);
      const elevationChange = curr - prev;
      if (elevationChange > 0) {
        dayElevationGain += elevationChange;
      }
    }

    dailyElevationGainMap.set(dateKey, Math.round(dayElevationGain));
  }

  return dailyElevationGainMap;
}

/**
 * Calculate daily mileage using trail miles (max - min trailMile per day).
 * Falls back to haversine for days with no trail mile data.
 */
function calculateDailyMileage(points) {
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

    // Try trail-mile based calculation
    const trailMilePoints = dayPoints.filter(p => p.trailMile != null);
    if (trailMilePoints.length >= 2) {
      const miles = trailMilePoints.map(p => p.trailMile);
      const dayMiles = Math.max(...miles) - Math.min(...miles);
      dailyMileageMap.set(dateKey, dayMiles);
    } else {
      // Fallback: haversine sum (no correction factor)
      let dayMiles = 0;
      const sortedDayPoints = dayPoints.sort((a, b) => a.time - b.time);
      for (let i = 1; i < sortedDayPoints.length; i++) {
        const prev = sortedDayPoints[i - 1];
        const curr = sortedDayPoints[i];
        dayMiles += haversine(prev.lat, prev.lon, curr.lat, curr.lon);
      }
      dailyMileageMap.set(dateKey, dayMiles);
    }
  }

  return dailyMileageMap;
}

/**
 * Calculate total miles using the highest trailMile among on-trail points.
 * Falls back to haversine sum if no trail mile data available.
 */
function calculateTotalMiles(points) {
  const trailMilePoints = points.filter(p => p.trailMile != null);
  if (trailMilePoints.length > 0) {
    return Math.max(...trailMilePoints.map(p => p.trailMile));
  }

  // Fallback: haversine sum (no correction factor)
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    if (!Number.isFinite(prev.lat) || !Number.isFinite(prev.lon) ||
        !Number.isFinite(curr.lat) || !Number.isFinite(curr.lon)) continue;
    total += haversine(prev.lat, prev.lon, curr.lat, curr.lon);
  }
  return total;
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

  const totalMiles = calculateTotalMiles(points);

  // Calculate moving time using haversine (for speed calculation)
  let movingTimeHours = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const timeDeltaHours = (curr.time - prev.time) / (1000 * 60 * 60);
    if (curr.velocity > MOVING_VELOCITY_THRESHOLD_MPH) {
      movingTimeHours += timeDeltaHours;
    }
  }

  const dailyMileageMap = calculateDailyMileage(points);
  const todayStr = getUTCDateString(todayUTC);
  const hasDataToday = dailyMileageMap.has(todayStr);

  let dailyMiles;
  let dailyDistanceDate;
  if (hasDataToday) {
    dailyMiles = dailyMileageMap.get(todayStr) || 0;
    dailyDistanceDate = todayStr;
  } else {
    const sortedDates = [...dailyMileageMap.keys()].sort().reverse();
    const mostRecentDate = sortedDates[0];
    dailyMiles = mostRecentDate ? (dailyMileageMap.get(mostRecentDate) || 0) : 0;
    dailyDistanceDate = mostRecentDate || todayStr;
  }

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

  const dailyElevationGain = calculateDailyElevationGain(points);
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
    hasDataToday,
    dailyDistanceDate,
    averageSpeed: avgSpeed.toFixed(1),
    currentDayOnTrail: currentDay,
    estimatedFinishDate: estFinish.toLocaleDateString('en-US'),
    longestDayMiles: longestDayDate ? longestDayMiles.toFixed(1) : '0.0',
    longestDayDate: longestDayDate ? (new Date(longestDayDate + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) : 'N/A',
    mostElevationGainFeet: mostElevationGainDate ? mostElevationGainFeet.toString() : '0',
    mostElevationGainDate: mostElevationGainDate ? (new Date(mostElevationGainDate + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) : 'N/A'
  };
}
