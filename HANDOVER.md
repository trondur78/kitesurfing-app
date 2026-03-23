# Kitesurfing App - Handover Notes

## Overview

Mobile-first PWA for kitesurfing conditions at Langevelderslag (Zandvoort).
Shows a 5-day forecast grouped by day, scored per time slot (09:00 / 12:00 / 15:00 / 18:00).

## URLs

- **Live app:** https://kitesurfing-app-tan.vercel.app (or check Vercel dashboard for exact URL)
- **GitHub repo:** https://github.com/trondur78/kitesurfing-app
- **Vercel project:** Connected to GitHub, auto-deploys on push to `main`

## Architecture

No server. No database. No cron jobs. Everything is serverless:

```
User browser
    |
    v
Vercel (Next.js 16)
    |-- app/page.tsx           → Frontend PWA (React, Tailwind)
    |-- app/api/forecast/      → Serverless API route
            |
            v
        Stormglass API         → Weather + tide data
        (cached 6h on Vercel)
```

The API route calls Stormglass once per 6 hours (Vercel edge cache). Free tier allows 10 calls/day.

## Key Files

```
app/
  page.tsx                    Main UI — day cards, time slots, score badges
  layout.tsx                  Metadata, PWA manifest link
  api/
    forecast/
      route.ts                Serverless function: fetch + score + return JSON
public/
  manifest.json               PWA manifest (installable on home screen)
  icon-192x192.png
  icon-512x512.png
next-config.js                next-pwa config (PWA service worker)
```

## Data Source

**Stormglass API** — https://stormglass.io
- Free tier: 10 requests/day
- Used: ~2/day (6h cache)
- API key: `729ac3f0-6db7-11ef-aa85-0242ac130004-729ac490-6db7-11ef-aa85-0242ac130004`
- Set as `STORMGLASS_API_KEY` env var in Vercel (Settings → Environment Variables)
- Fallback hardcoded in `route.ts` if env var missing

**Endpoints used:**
- `GET /v2/weather/point` — windSpeed, windDirection, precipitation (source: noaa)
- `GET /v2/tide/extremes/point` — tide highs/lows

**Location:** lat 52.3714, lon 4.5283 (Zandvoort/Langevelderslag)

## Scoring Logic

Scores each time slot 0–100 based on:

| Factor | Max points | Notes |
|--------|-----------|-------|
| Wind speed | 40 | 19–25kn = 40, 15–19 = 20, 25–28 = 15, else 0 |
| Wind direction | 30 | SW (220–250°) or NNW (340–10°) = 30, other kiteable = 15 |
| Tidal current | 20 | Wind-against-current scores highest, tapers near slack |
| No rain | 10 | <0.1mm/h = +10 |

If wind direction is outside kiteable range (210–300° or 300–20°), score = 0 "Not kiteable".

**Tidal current logic:**
- Rising tide → current flows north
- Falling tide → current flows south
- SW wind + north current (rising) = ideal (wind against current = choppier, better kite conditions)
- NW wind + south current (falling) = ideal
- Current strength tapers off near high/low tide (slack water)

## Score Color Coding

- Green: 80+
- Yellow: 60–79
- Orange: 40–59
- Red: 1–39
- Gray dash: 0 (not kiteable)

## Dependencies

```json
{
  "next": "^16.2.1",
  "react": "^19.2.4",
  "react-dom": "^19.2.4",
  "next-pwa": "^5.6.0"
}
```

## Security

Patched on 2026-03-23:
- CVE-2025-55182 (CVSS 10.0) — React Server Components RCE via unsafe deserialization
- CVE-2025-66478 — Next.js related advisory
- Upgraded from Next.js 15.1.3 + React 19.0.0 → Next.js 16.2.1 + React 19.2.4

## Maintenance

Essentially zero. The only thing that could break:
1. Stormglass API key expiry / quota exceeded — check https://dashboard.stormglass.io
2. Next.js security updates — run `npm install next@latest react@latest react-dom@latest` periodically
3. Vercel free tier limits — unlikely for this usage

## History

- Originally ran on PythonAnywhere (Python Flask + data collector script)
- Migrated 2026-03-23 to fully serverless Next.js on Vercel
- Python data collector script preserved in original message (not needed anymore)
- UI rebuilt: day-grouped cards, expandable time slots, score badges, wind arrows
