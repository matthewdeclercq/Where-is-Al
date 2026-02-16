// Helper function to get UTC date string (YYYY-MM-DD) from Date object or ISO string
export function getUTCDateString(dateOrTime) {
  if (!dateOrTime) return null;
  const date = dateOrTime instanceof Date ? dateOrTime : new Date(dateOrTime);
  return date.toISOString().split('T')[0];
}

// Group an array of points by UTC date
export function groupPointsByDate(points) {
  const pointsByDate = new Map();
  for (const point of points) {
    const dateKey = getUTCDateString(point.time);
    if (!pointsByDate.has(dateKey)) {
      pointsByDate.set(dateKey, []);
    }
    pointsByDate.get(dateKey).push(point);
  }
  return pointsByDate;
}

// Calculate current day on trail from start date
export function calculateCurrentDay(startDateStr) {
  const startDate = new Date(startDateStr + 'T00:00:00Z');
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startDateUTC = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  const MS_PER_DAY = 86400000;
  const daysDiff = Math.floor((todayUTC - startDateUTC) / MS_PER_DAY);
  return { currentDay: Math.max(1, daysDiff + 1), todayUTC, startDate };
}

// Build KML URL from MapShare ID
export function buildKmlUrl(mapshareId) {
  return `https://share.garmin.com/Feed/Share/${mapshareId}`;
}

// Build fetch options for KML request (Garmin uses HTTP Basic Auth)
export function buildKmlFetchOptions(password) {
  if (!password) {
    return {};
  }
  return {
    headers: {
      'Authorization': 'Basic ' + btoa(':' + password)
    }
  };
}

// Validate environment variables
export function validateEnvVars(env, requireMapshare = true) {
  const errors = [];

  if (requireMapshare && !env.MAPSHARE_ID) {
    errors.push('MAPSHARE_ID environment variable not configured');
  }

  if (!env.START_DATE) {
    errors.push('START_DATE environment variable not configured');
  } else {
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
