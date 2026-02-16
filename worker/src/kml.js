// Lightweight KML parser for Garmin format
export function parseKmlPoints(kmlText, startDate) {
  if (!kmlText || typeof kmlText !== 'string') {
    throw new Error('[Worker] Invalid KML text: must be a non-empty string');
  }

  if (!startDate || !(startDate instanceof Date) || isNaN(startDate.getTime())) {
    throw new Error('[Worker] Invalid startDate: must be a valid Date object');
  }

  const points = [];
  const placemarkRegex = /<Placemark>[\s\S]*?<\/Placemark>/g;
  const placemarks = kmlText.match(placemarkRegex) || [];

  for (const pm of placemarks) {
    const coordMatch = pm.match(/<coordinates>([\d\.-]+),([\d\.-]+),([\d\.-]+)</);
    const timeMatch = pm.match(/<when>([\d\-T:Z\.]+)</);
    const velocityMatch = pm.match(/name="velocity">([\d\.]+)</);

    if (coordMatch && timeMatch) {
      const lon = parseFloat(coordMatch[1]);
      const lat = parseFloat(coordMatch[2]);
      const rawElevation = coordMatch[3] ? parseFloat(coordMatch[3]) : null;
      const elevationMeters = rawElevation !== null && !isNaN(rawElevation) ? rawElevation : null;
      const elevationFeet = elevationMeters !== null ? elevationMeters * 3.28084 : null;
      const time = new Date(timeMatch[1]);
      const rawVelocity = velocityMatch ? parseFloat(velocityMatch[1]) : 0;
      const velocityKmh = isNaN(rawVelocity) ? 0 : rawVelocity;
      const velocityMph = velocityKmh * 0.621371;

      if (time >= startDate) {
        points.push({ lat, lon, time, velocity: velocityMph, elevation: elevationFeet });
      }
    }
  }
  return points.sort((a, b) => a.time - b.time);
}
