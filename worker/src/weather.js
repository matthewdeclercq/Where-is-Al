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

export async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,apparent_temperature&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=5&temperature_unit=fahrenheit`;
  const geocodeUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`;

  const geocodeController = new AbortController();
  const geocodeTimeout = setTimeout(() => geocodeController.abort(), 3000);

  const [weatherResponse, geocodeResponse] = await Promise.allSettled([
    fetch(url),
    fetch(geocodeUrl, { signal: geocodeController.signal }).finally(() => clearTimeout(geocodeTimeout))
  ]);

  if (weatherResponse.status === 'rejected' || !weatherResponse.value.ok) {
    throw new Error(`Weather API error: ${weatherResponse.value?.status ?? 'network error'}`);
  }

  let locationName = null;
  if (geocodeResponse.status === 'fulfilled' && geocodeResponse.value.ok) {
    try {
      const geo = await geocodeResponse.value.json();
      locationName = geo.locality || geo.city || geo.principalSubdivision || null;
    } catch (_) {}
  }

  const response = weatherResponse.value;
  const data = await response.json();

  const current = data.current;
  const daily = data.daily;

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
      windSpeed: Math.round(current.wind_speed_10m * 0.621371),
      windDirection: current.wind_direction_10m,
      feelsLike: Math.round(current.apparent_temperature)
    },
    forecast: forecast,
    locationName: locationName
  };
}
