import { NextResponse } from 'next/server'

const WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=52.3714&longitude=4.5283&hourly=windspeed_10m,windgusts_10m,winddirection_10m,precipitation,weather_code&windspeed_unit=kn&models=knmi_seamless&timezone=Europe%2FAmsterdam&forecast_days=7'

const MARINE_URL =
  'https://marine-api.open-meteo.com/v1/marine?latitude=52.3714&longitude=4.5283&hourly=wave_height,ocean_current_velocity,ocean_current_direction&timezone=Europe%2FAmsterdam&forecast_days=7'

const SLOT_HOURS = [9, 12, 15, 18]

function isKiteable(dir: number): boolean {
  // Beach faces 290° (straight onshore). Kiteable window: 206° (S cross-shore) to 20° (N cross-shore) via 290°.
  return dir >= 206 || dir <= 20
}

function isIdealDir(dir: number): boolean {
  // Ideal: cross-offshore SW sector (206°–255°) and far NW-N sector (340°–20°)
  return (dir >= 206 && dir <= 255) || dir >= 340 || dir <= 10
}

function getWindLabel(dir: number): string {
  // Beach faces 290° = straight onshore. 206° = S cross-shore boundary. 20° = N cross-shore boundary.
  if (dir >= 206 && dir <= 255) return 'cross-offshore'  // SW: partially offshore component
  if (dir >= 256 && dir <= 324) return 'onshore'         // W zone centred on 290°
  if (dir >= 325 || dir <= 20) return 'cross-shore'      // NW–N sector
  return 'not kiteable'
}

function getKiteSize(speed: number): string {
  if (speed < 10) return 'too light'
  if (speed <= 13) return '17m+'
  if (speed <= 17) return '14-17m'
  if (speed <= 21) return '12-14m'
  if (speed <= 25) return '9-12m'
  if (speed <= 29) return '7-9m'
  return 'too strong'
}

function calcScore(
  windSpeed: number,
  windGust: number,
  windDir: number,
  waveHeight: number,
  currentComponent: number,
  precipitation: number,
): number {
  if (!isKiteable(windDir)) return 0

  let score = 0

  if (windSpeed >= 16 && windSpeed <= 22) score += 40
  else if (windSpeed >= 12 && windSpeed <= 15) score += 25
  else if (windSpeed >= 23 && windSpeed <= 26) score += 20
  else if (windSpeed >= 27 && windSpeed <= 30) score += 10

  if (isIdealDir(windDir)) score += 30
  else score += 15

  if (windGust > windSpeed * 1.4) score -= 15

  if (waveHeight >= 1.5) score -= 25
  else if (waveHeight >= 1.0) score -= 15
  else if (waveHeight >= 0.5) score -= 5

  if (currentComponent > 0.5) score -= 10
  else if (currentComponent < -0.5) score += 5

  if (precipitation < 0.1) score += 10

  return Math.max(0, score)
}

export async function GET() {
  try {
    const [weatherRes, marineRes] = await Promise.all([
      fetch(WEATHER_URL, { next: { revalidate: 10800 } }),
      fetch(MARINE_URL, { next: { revalidate: 10800 } }),
    ])

    if (!weatherRes.ok || !marineRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch forecast data' }, { status: 502 })
    }

    const weather = await weatherRes.json()
    const marine = await marineRes.json()

    const times: string[] = weather.hourly.time
    const windSpeeds: number[] = weather.hourly.windspeed_10m
    const windGusts: number[] = weather.hourly.windgusts_10m
    const windDirs: number[] = weather.hourly.winddirection_10m
    const precipitations: number[] = weather.hourly.precipitation
    const waveHeights: number[] = marine.hourly.wave_height
    const currentSpeeds: number[] = marine.hourly.ocean_current_velocity
    const currentDirs: number[] = marine.hourly.ocean_current_direction

    const slots = []

    for (let i = 0; i < times.length; i++) {
      const timeStr = times[i] // e.g. '2026-03-24T09:00'
      const hour = parseInt(timeStr.split('T')[1].split(':')[0])

      if (!SLOT_HOURS.includes(hour)) continue

      const date = timeStr.split('T')[0]
      const time = `${String(hour).padStart(2, '0')}:00`

      const windSpeed = Math.round(windSpeeds[i] ?? 0)
      const windGust = Math.round(windGusts[i] ?? 0)
      const windDir = Math.round(windDirs[i] ?? 0)
      const precipitation = Math.round((precipitations[i] ?? 0) * 10) / 10
      const waveHeight = Math.round((waveHeights[i] ?? 0) * 10) / 10
      const currentSpeed = Math.round((currentSpeeds[i] ?? 0) * 10) / 10
      const currentDir = currentDirs[i] ?? 0

      const angle = ((currentDir - windDir) * Math.PI) / 180
      const currentComponent = Math.round(currentSpeed * Math.cos(angle) * 10) / 10

      const isGusty = windGust > windSpeed * 1.4
      const windLabel = getWindLabel(windDir)
      const kiteSize = getKiteSize(windSpeed)
      const score = calcScore(windSpeed, windGust, windDir, waveHeight, currentComponent, precipitation)

      slots.push({
        date,
        time,
        windSpeed,
        windGust,
        windDir,
        isGusty,
        windLabel,
        kiteSize,
        waveHeight,
        currentSpeed,
        currentComponent,
        precipitation,
        score,
      })
    }

    return NextResponse.json(slots)
  } catch (err) {
    console.error('Forecast error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
