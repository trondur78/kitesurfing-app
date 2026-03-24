import { NextResponse } from 'next/server';

const LAT = 52.3714;
const LON = 4.5283;
const DAYLIGHT_HOURS = [9, 12, 15, 18];

function getWindLabel(direction: number): string {
  if (direction >= 220 && direction <= 260) return 'cross-offshore';
  if (direction > 260 && direction <= 290) return 'offshore';
  if (direction > 290 && direction <= 340) return 'cross-shore';
  if (direction > 340 || direction <= 30) return 'onshore';
  return 'not kiteable';
}

function getKiteSize(windSpeedKnots: number): string {
  if (windSpeedKnots < 10) return 'too light';
  if (windSpeedKnots < 14) return '17m+';
  if (windSpeedKnots < 18) return '14-17m';
  if (windSpeedKnots < 22) return '12-14m';
  if (windSpeedKnots < 26) return '9-12m';
  if (windSpeedKnots < 30) return '7-9m';
  return 'too strong';
}

function getCurrentLabel(currentSpeedKn: number, currentDir: number, windDir: number): string {
  const angle = currentDir - windDir;
  const component = currentSpeedKn * Math.cos((angle * Math.PI) / 180);
  if (component > 0.5) return `${currentSpeedKn.toFixed(1)} kn against wind`;
  if (component < -0.5) return `${currentSpeedKn.toFixed(1)} kn with wind`;
  return 'slack';
}

function calculateScore(
  windSpeedKnots: number,
  windDirection: number,
  currentSpeedKn: number,
  currentDir: number,
  precipitation: number,
  windGustKnots: number,
  waveHeight: number
): number {
  // Wind direction must be kiteable: 210-300 OR >=300 OR <=20
  const kiteable =
    (windDirection >= 210 && windDirection <= 300) ||
    windDirection >= 300 ||
    windDirection <= 20;
  if (!kiteable) return 0;

  // Wind speed score (0-40)
  let windSpeedScore = 0;
  if (windSpeedKnots >= 16 && windSpeedKnots <= 22) windSpeedScore = 40;
  else if (windSpeedKnots >= 12 && windSpeedKnots < 16) windSpeedScore = 25;
  else if (windSpeedKnots > 22 && windSpeedKnots <= 26) windSpeedScore = 20;
  else if (windSpeedKnots > 26 && windSpeedKnots <= 30) windSpeedScore = 10;
  else if (windSpeedKnots > 30) windSpeedScore = 0;

  // Gust penalty
  const gustPenalty = windGustKnots > windSpeedKnots * 1.4 ? 15 : 0;

  // Wave height penalty (beginners need flat water)
  let wavePenalty = 0;
  if (waveHeight >= 1.5) wavePenalty = 25;
  else if (waveHeight >= 1.0) wavePenalty = 15;
  else if (waveHeight >= 0.5) wavePenalty = 5;

  // Wind direction score (0-30)
  const goodDir =
    (windDirection >= 220 && windDirection <= 250) ||
    windDirection >= 340 ||
    windDirection <= 10;
  const windDirScore = goodDir ? 30 : 15;

  // Current score (0-15): against-wind current creates chop, with-wind is clean
  const angle = currentDir - windDir;
  const component = currentSpeedKn * Math.cos((angle * Math.PI) / 180);
  let currentScore = 10; // neutral
  if (component > 0.5) currentScore = 0;  // against wind — chop
  else if (component < -0.5) currentScore = 15; // with wind — clean water

  // Precipitation bonus
  const precipBonus = precipitation < 0.1 ? 10 : 0;

  const total = windSpeedScore - gustPenalty - wavePenalty + windDirScore + currentScore + precipBonus;
  return Math.round(Math.max(0, total));
}

function buildConditions(
  windSpeedKnots: number,
  windDirection: number,
  currentLabel: string,
  precipitation: number,
  windGustKnots: number,
  waveHeight: number,
  score: number
): string {
  if (score === 0) return 'Not kiteable';

  const parts: string[] = [];

  if (windSpeedKnots >= 19 && windSpeedKnots <= 25) parts.push('Perfect wind');
  else if (windSpeedKnots >= 15 && windSpeedKnots < 19) parts.push('Light wind');
  else if (windSpeedKnots > 25 && windSpeedKnots <= 28) parts.push('Strong wind');
  else parts.push(`${Math.round(windSpeedKnots)}kn wind`);

  const goodDir =
    (windDirection >= 220 && windDirection <= 250) ||
    windDirection >= 340 ||
    windDirection <= 10;
  parts.push(goodDir ? 'ideal direction' : 'ok direction');

  if (windGustKnots > windSpeedKnots * 1.4) parts.push('gusty — size down');
  if (waveHeight >= 1.0) parts.push(`waves ${waveHeight.toFixed(1)}m — rough`);
  if (precipitation >= 0.1) parts.push('rain expected');
  parts.push(`current: ${currentLabel}`);

  return parts.join(', ');
}

export async function GET() {
  try {
    const now = new Date();
    const tz = 'Europe%2FAmsterdam';

    // Open-Meteo forecast (KNMI Seamless model) — wind + weather
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&hourly=windspeed_10m,windgusts_10m,winddirection_10m,precipitation,weather_code&windspeed_unit=kn&models=knmi_seamless&timezone=${tz}&forecast_days=7`;

    // Open-Meteo Marine — waves + ocean current
    const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${LAT}&longitude=${LON}&hourly=significant_wave_height,ocean_current_velocity,ocean_current_direction&length_unit=imperial&timezone=${tz}&forecast_days=7`;

    const [weatherRes, marineRes] = await Promise.all([
      fetch(weatherUrl, { next: { revalidate: 10800 } }), // 3h cache
      fetch(marineUrl, { next: { revalidate: 10800 } }),
    ]);

    if (!weatherRes.ok) throw new Error(`Open-Meteo weather error: ${weatherRes.status}`);
    if (!marineRes.ok) throw new Error(`Open-Meteo marine error: ${marineRes.status}`);

    const weatherData = await weatherRes.json();
    const marineData = await marineRes.json();

    // Build lookup by ISO time string (local Amsterdam time from API)
    const weatherByTime: Record<string, {
      windSpeed: number; windGust: number; windDir: number;
      precipitation: number; weatherCode: number;
    }> = {};

    for (let i = 0; i < weatherData.hourly.time.length; i++) {
      weatherByTime[weatherData.hourly.time[i]] = {
        windSpeed: weatherData.hourly.windspeed_10m[i] ?? 0,
        windGust: weatherData.hourly.windgusts_10m[i] ?? 0,
        windDir: weatherData.hourly.winddirection_10m[i] ?? 0,
        precipitation: weatherData.hourly.precipitation[i] ?? 0,
        weatherCode: weatherData.hourly.weather_code[i] ?? 0,
      };
    }

    const marineByTime: Record<string, {
      waveHeight: number; currentSpeed: number; currentDir: number;
    }> = {};

    for (let i = 0; i < marineData.hourly.time.length; i++) {
      marineByTime[marineData.hourly.time[i]] = {
        waveHeight: marineData.hourly.significant_wave_height[i] ?? 0,
        currentSpeed: marineData.hourly.ocean_current_velocity[i] ?? 0,
        currentDir: marineData.hourly.ocean_current_direction[i] ?? 0,
      };
    }

    // Build results: next 7 days, daylight hours only
    const results = [];

    for (let d = 0; d < 7; d++) {
      const day = new Date(now);
      day.setDate(day.getDate() + d);
      const yyyy = day.getFullYear();
      const mm = String(day.getMonth() + 1).padStart(2, '0');
      const dd = String(day.getDate()).padStart(2, '0');

      for (const hour of DAYLIGHT_HOURS) {
        if (d === 0 && hour <= now.getHours()) continue; // skip past hours today

        const timeKey = `${yyyy}-${mm}-${dd}T${String(hour).padStart(2, '0')}:00`;
        const w = weatherByTime[timeKey];
        const m = marineByTime[timeKey];
        if (!w) continue;

        const windSpeed = w.windSpeed;
        const windGust = w.windGust;
        const windDir = w.windDir;
        const precipitation = w.precipitation;
        const waveHeight = m?.waveHeight ?? 0;
        const currentSpeed = m?.currentSpeed ?? 0;
        const currentDir = m?.currentDir ?? 0;

        const score = calculateScore(
          windSpeed, windDir, currentSpeed, currentDir, precipitation, windGust, waveHeight
        );

        const currentLabel = getCurrentLabel(currentSpeed, currentDir, windDir);

        const conditions = buildConditions(
          windSpeed, windDir, currentLabel, precipitation, windGust, waveHeight, score
        );

        results.push({
          date: `${yyyy}-${mm}-${dd}`,
          time: `${String(hour).padStart(2, '0')}:00`,
          wind_speed: Math.round(windSpeed),
          wind_direction: Math.round(windDir),
          wind_gust: Math.round(windGust),
          wave_height: Math.round(waveHeight * 10) / 10,
          is_gusty: windGust > windSpeed * 1.4,
          wind_label: getWindLabel(windDir),
          kite_size: getKiteSize(windSpeed),
          tide_state: 'n/a',       // removed — Open-Meteo has no tide extremes
          current_direction: currentDir > 0 ? `${Math.round(currentDir)}°` : 'unknown',
          current_strength: Math.round(currentSpeed * 10) / 10,
          precipitation: Math.round(precipitation * 10) / 10,
          score,
          conditions,
        });
      }
    }

    return NextResponse.json(results);
  } catch (err) {
    console.error('Forecast error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch forecast' },
      { status: 500 }
    );
  }
}
