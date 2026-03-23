import { NextResponse } from 'next/server';

const STORMGLASS_API_KEY =
  process.env.STORMGLASS_API_KEY ||
  '729ac3f0-6db7-11ef-aa85-0242ac130004-729ac490-6db7-11ef-aa85-0242ac130004';

const LAT = 52.3714;
const LON = 4.5283;
const DAYLIGHT_HOURS = [9, 12, 15, 18];

interface TideEvent {
  time: string;
  type: 'high' | 'low';
  height: number;
}

interface TideState {
  tideState: 'rising' | 'falling' | 'unknown';
  currentDirection: 'north' | 'south' | 'unknown';
  timeSinceLastTide: number;
}

function getTideState(timestamp: Date, tideData: TideEvent[]): TideState {
  const sorted = [...tideData].sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
  );

  const ts = timestamp.getTime();
  let prev: TideEvent | null = null;
  let next: TideEvent | null = null;

  for (const event of sorted) {
    const t = new Date(event.time).getTime();
    if (t <= ts) prev = event;
    else if (next === null) next = event;
  }

  if (!prev) {
    return { tideState: 'unknown', currentDirection: 'unknown', timeSinceLastTide: 0 };
  }

  const timeSinceLastTide = (ts - new Date(prev.time).getTime()) / 3600000;
  const tideState: 'rising' | 'falling' = prev.type === 'low' ? 'rising' : 'falling';
  const currentDirection: 'north' | 'south' = tideState === 'rising' ? 'north' : 'south';

  return { tideState, currentDirection, timeSinceLastTide };
}

function getWindLabel(direction: number): string {
  // Zandvoort coast runs N-S. Wind FROM:
  // SW (220-260): cross-offshore — ideal, wind blows away from shore at angle
  // W (260-290): offshore — dangerous, blows straight out to sea
  // NW (290-340): cross-shore from north — good, parallel to beach
  // N (340-30): onshore from north — not ideal
  // other: not kiteable
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

function calculateScore(
  windSpeedKnots: number,
  windDirection: number,
  tideState: string,
  currentDirection: string,
  timeSinceLastTide: number,
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

  // Gust penalty: gusty = unpredictable
  const gustPenalty = windGustKnots > windSpeedKnots * 1.4 ? 15 : 0;

  // Wave height penalty
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

  // Current score (0-20)
  const isSWwind = windDirection >= 210 && windDirection <= 260;
  const isNWwind = windDirection >= 330 || windDirection <= 20;
  let baseCurrentScore = 5;
  if (isSWwind && currentDirection === 'north') baseCurrentScore = 20;
  else if (isNWwind && currentDirection === 'south') baseCurrentScore = 20;

  let tidalFactor: number;
  if (timeSinceLastTide <= 3) {
    tidalFactor = timeSinceLastTide / 3;
  } else if (timeSinceLastTide <= 6) {
    tidalFactor = (6 - timeSinceLastTide) / 3;
  } else {
    tidalFactor = 0;
  }
  tidalFactor = Math.max(0.2, tidalFactor);
  const currentScore = baseCurrentScore * tidalFactor;

  // Precipitation bonus
  const precipBonus = precipitation < 0.1 ? 10 : 0;

  const total = windSpeedScore - gustPenalty - wavePenalty + windDirScore + currentScore + precipBonus;
  return Math.round(Math.max(0, total));
}

function buildConditions(
  windSpeedKnots: number,
  windDirection: number,
  tideState: string,
  currentDirection: string,
  precipitation: number,
  score: number
): string {
  if (score === 0) return 'Not kiteable';

  const parts: string[] = [];

  // Wind speed quality
  if (windSpeedKnots >= 19 && windSpeedKnots <= 25) parts.push('Perfect wind');
  else if (windSpeedKnots >= 15 && windSpeedKnots < 19) parts.push('Light wind');
  else if (windSpeedKnots > 25 && windSpeedKnots <= 28) parts.push('Strong wind');
  else parts.push(`${Math.round(windSpeedKnots)}kn wind`);

  // Direction quality
  const goodDir =
    (windDirection >= 220 && windDirection <= 250) ||
    windDirection >= 340 ||
    windDirection <= 10;
  parts.push(goodDir ? 'ideal direction' : 'ok direction');

  // Tide/current
  parts.push(`${tideState} tide, ${currentDirection} current`);

  // Rain
  if (precipitation >= 0.1) parts.push('rain expected');

  return parts.join(', ');
}

export async function GET() {
  try {
    const now = new Date();
    // Fetch 5 days of data
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 5);

    const [weatherRes, tideRes] = await Promise.all([
      fetch(
        `https://api.stormglass.io/v2/weather/point?lat=${LAT}&lng=${LON}&params=windSpeed,windDirection,windGust,waveHeight,precipitation&source=noaa&start=${start.toISOString()}&end=${end.toISOString()}`,
        {
          headers: { Authorization: STORMGLASS_API_KEY },
          next: { revalidate: 21600 },
        }
      ),
      fetch(
        `https://api.stormglass.io/v2/tide/extremes/point?lat=${LAT}&lng=${LON}&start=${start.toISOString()}&end=${end.toISOString()}`,
        {
          headers: { Authorization: STORMGLASS_API_KEY },
          next: { revalidate: 21600 },
        }
      ),
    ]);

    if (weatherRes.status === 402 || weatherRes.status === 429) {
      return NextResponse.json(
        { error: 'quota_exceeded', message: 'Daily forecast limit reached. Data resets at midnight UTC — check back after 01:00 Amsterdam time.' },
        { status: 503 }
      );
    }
    if (!weatherRes.ok) {
      throw new Error(`Stormglass weather error: ${weatherRes.status}`);
    }
    if (!tideRes.ok) {
      throw new Error(`Stormglass tide error: ${tideRes.status}`);
    }

    const weatherData = await weatherRes.json();
    const tideData = await tideRes.json();

    const tideEvents: TideEvent[] = tideData.data || [];

    // Index weather hours for quick lookup
    const weatherByHour: Record<string, { windSpeed: number; windDirection: number; windGust: number; waveHeight: number; precipitation: number }> = {};
    for (const hour of weatherData.hours || []) {
      const t = new Date(hour.time);
      const key = `${t.getUTCFullYear()}-${t.getUTCMonth()}-${t.getUTCDate()}-${t.getUTCHours()}`;
      const ws = hour.windSpeed?.noaa ?? hour.windSpeed?.sg ?? 0;
      const wd = hour.windDirection?.noaa ?? hour.windDirection?.sg ?? 0;
      const pr = hour.precipitation?.noaa ?? hour.precipitation?.sg ?? 0;
      weatherByHour[key] = {
        windSpeed: ws * 1.94384, // m/s to knots
        windDirection: wd,
        windGust: (hour.windGust?.noaa ?? hour.windGust?.sg ?? 0) * 1.94384, // m/s to knots
        waveHeight: hour.waveHeight?.noaa ?? hour.waveHeight?.sg ?? hour.waveHeight?.icon ?? 0, // meters
        precipitation: pr,
      };
    }

    const results = [];

    for (let d = 0; d < 5; d++) {
      const day = new Date(start);
      day.setDate(day.getDate() + d);

      for (const hour of DAYLIGHT_HOURS) {
        const ts = new Date(day);
        ts.setUTCHours(hour, 0, 0, 0);

        const key = `${ts.getUTCFullYear()}-${ts.getUTCMonth()}-${ts.getUTCDate()}-${ts.getUTCHours()}`;
        const weather = weatherByHour[key];
        if (!weather) continue;

        const { windSpeed, windDirection, windGust, waveHeight, precipitation } = weather;
        const { tideState, currentDirection, timeSinceLastTide } = getTideState(ts, tideEvents);

        const currentStrength =
          timeSinceLastTide <= 6
            ? Math.round((1 - Math.abs(timeSinceLastTide - 3) / 3) * 100)
            : 0;

        const score = calculateScore(
          windSpeed,
          windDirection,
          tideState,
          currentDirection,
          timeSinceLastTide,
          precipitation,
          windGust,
          waveHeight
        );

        const conditions = buildConditions(
          windSpeed,
          windDirection,
          tideState,
          currentDirection,
          precipitation,
          score
        );

        // Format date as local Amsterdam date (UTC+1/+2)
        const localDate = new Date(ts.getTime() + 60 * 60 * 1000); // rough UTC+1
        const dateStr = localDate.toISOString().slice(0, 10);
        const timeStr = `${String(hour).padStart(2, '0')}:00`;

        results.push({
          date: dateStr,
          time: timeStr,
          wind_speed: Math.round(windSpeed),
          wind_direction: Math.round(windDirection),
          wind_gust: Math.round(windGust),
          wave_height: Math.round(waveHeight * 10) / 10,
          is_gusty: windGust > windSpeed * 1.4,
          wind_label: getWindLabel(windDirection),
          kite_size: getKiteSize(windSpeed),
          tide_state: tideState,
          current_direction: currentDirection,
          current_strength: currentStrength,
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
