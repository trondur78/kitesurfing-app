'use client'

import { useState, useEffect, useCallback } from 'react'

interface Forecast {
  date: string
  time: string
  windSpeed: number
  windGust: number
  windDir: number
  isGusty: boolean
  windLabel: string
  kiteSize: string
  waveHeight: number
  currentSpeed: number
  currentComponent: number
  precipitation: number
  score: number
}

interface DayGroup {
  date: string
  dayName: string
  shortDate: string
  slots: Forecast[]
  bestScore: number
}

function getDayName(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(today.getDate() + 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
  return d.toLocaleDateString('en-GB', { weekday: 'long' })
}

function getShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function ScoreBadge({ score, large }: { score: number; large?: boolean }) {
  const base = large
    ? 'px-3 py-1 text-sm font-bold rounded-full'
    : 'px-2 py-0.5 text-xs font-semibold rounded-full min-w-[32px] text-center'
  if (score === 0) return <span className={`${base} bg-slate-600 text-slate-300`}>–</span>
  if (score >= 80) return <span className={`${base} bg-green-600 text-white`}>{score}</span>
  if (score >= 60) return <span className={`${base} bg-yellow-500 text-black`}>{score}</span>
  if (score >= 40) return <span className={`${base} bg-orange-500 text-white`}>{score}</span>
  return <span className={`${base} bg-red-600 text-white`}>{score}</span>
}

function WindArrow({ dir }: { dir: number }) {
  const displayDir = (dir + 180) % 360
  return (
    <span
      className="inline-block text-blue-400"
      style={{ transform: `rotate(${displayDir}deg)` }}
      title={`Wind from ${dir}°`}
    >
      ↑
    </span>
  )
}

function WindLabelBadge({ label }: { label: string }) {
  const styles: Record<string, string> = {
    'cross-offshore': 'bg-green-800 text-green-200',
    offshore: 'bg-red-800 text-red-200',
    'cross-shore': 'bg-yellow-800 text-yellow-200',
    onshore: 'bg-orange-800 text-orange-200',
    'not kiteable': 'bg-slate-700 text-slate-400',
  }
  const cls = styles[label] ?? 'bg-slate-700 text-slate-400'
  return (
    <span className={`px-1.5 py-0.5 text-xs rounded whitespace-nowrap ${cls}`}>
      {label === 'offshore' && '⚠️ '}
      {label}
    </span>
  )
}

function BeginnerGuide({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="mb-4 rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={onToggle}
      >
        <span className="font-semibold text-slate-200">📚 Beginner Guide</span>
        <span className="text-slate-400 text-sm">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 text-sm text-slate-300 space-y-3">
          <div>
            <p className="font-semibold text-white mb-1">Score legend</p>
            <div className="flex flex-wrap gap-2">
              <span className="px-2 py-0.5 rounded-full bg-green-600 text-white text-xs font-bold">80+ Great</span>
              <span className="px-2 py-0.5 rounded-full bg-yellow-500 text-black text-xs font-bold">60–79 Good</span>
              <span className="px-2 py-0.5 rounded-full bg-orange-500 text-white text-xs font-bold">40–59 Fair</span>
              <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-xs font-bold">1–39 Poor</span>
              <span className="px-2 py-0.5 rounded-full bg-slate-600 text-slate-300 text-xs font-bold">– Not kiteable</span>
            </div>
          </div>
          <div>
            <p className="font-semibold text-white mb-1">Perfect session</p>
            <p>16–22 knots, cross-offshore (206°–215°) or cross-shore (215°–265° / 320°–20°) wind, flat water under 0.5m, no rain.</p>
          </div>
          <div className="bg-red-900/50 border border-red-700 rounded-lg p-3">
            <p className="font-semibold text-red-300 mb-1">⚠️ Offshore wind danger</p>
            <p className="text-red-200 text-xs">
              Offshore wind blows you away from shore. If your gear fails you cannot return. Beginners
              should NEVER kite in offshore conditions without experienced supervision.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-xl bg-slate-800 border border-slate-700 p-4 animate-pulse">
      <div className="h-5 bg-slate-700 rounded w-1/2 mb-3" />
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="h-10 bg-slate-700 rounded mb-2" />
      ))}
    </div>
  )
}

function SlotRow({
  slot,
  isExpanded,
  onToggle,
}: {
  slot: Forecast
  isExpanded: boolean
  onToggle: () => void
}) {
  const currentLabel =
    slot.currentComponent > 0.5
      ? 'against wind – expect chop'
      : slot.currentComponent < -0.5
        ? 'with wind – clean water'
        : 'slack'

  const conditionsSummary = (): string => {
    if (slot.score === 0) return 'Not kiteable at this time.'
    const parts: string[] = []
    if (slot.score >= 80) parts.push('Excellent conditions')
    else if (slot.score >= 60) parts.push('Good conditions')
    else if (slot.score >= 40) parts.push('Fair conditions')
    else parts.push('Poor conditions')
    if (slot.isGusty) parts.push('gusty winds')
    if (slot.waveHeight >= 1.5) parts.push('large waves')
    else if (slot.waveHeight >= 1.0) parts.push('moderate waves')
    if (slot.precipitation >= 0.1) parts.push('rain expected')
    return parts.join(', ') + '.'
  }

  return (
    <div className="border-t border-slate-700 first:border-t-0">
      <button
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-700/50 active:bg-slate-700 transition-colors"
        onClick={onToggle}
      >
        <span className="text-sm font-mono text-slate-400 w-12 shrink-0">{slot.time}</span>
        <WindArrow dir={slot.windDir} />
        <span className="text-sm font-semibold text-white shrink-0">
          {slot.isGusty ? `${slot.windSpeed}/${slot.windGust} kn` : `${slot.windSpeed} kn`}
        </span>
        <WindLabelBadge label={slot.windLabel} />
        <span className="flex gap-0.5 text-sm">
          {slot.precipitation >= 0.1 && <span title={`${slot.precipitation} mm/h`}>💧</span>}
          {slot.waveHeight >= 1.0 && <span title={`${slot.waveHeight}m waves`}>🌊</span>}
        </span>
        <span className="ml-auto">
          <ScoreBadge score={slot.score} />
        </span>
        <span className="text-slate-500 text-xs">{isExpanded ? '▲' : '▼'}</span>
      </button>

      {isExpanded && (
        <div className="px-4 pb-3 pt-1 bg-slate-700/30 space-y-2 text-sm">
          <div className="text-xl font-bold text-white">🪁 {slot.kiteSize}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-300">
            <div>
              <span className="text-slate-400 text-xs block">Waves</span>
              <span className="font-medium">{slot.waveHeight}m</span>
            </div>
            <div>
              <span className="text-slate-400 text-xs block">Wind dir</span>
              <span className="font-medium">{slot.windDir}°</span>
            </div>
            <div>
              <span className="text-slate-400 text-xs block">Current</span>
              <span className="font-medium">{slot.currentSpeed} kn</span>
            </div>
            <div>
              <span className="text-slate-400 text-xs block">Rain</span>
              <span className="font-medium">{slot.precipitation} mm/h</span>
            </div>
          </div>
          <div className="text-xs bg-slate-800 rounded px-2 py-1 text-slate-400">
            Current: {currentLabel}
          </div>
          <div className="text-xs text-slate-400 italic">{conditionsSummary()}</div>
        </div>
      )}
    </div>
  )
}

function DayCard({ day }: { day: DayGroup }) {
  const [expandedTime, setExpandedTime] = useState<string | null>(null)
  const toggle = (time: string) => setExpandedTime(prev => (prev === time ? null : time))

  return (
    <div className="rounded-xl bg-slate-800 border border-slate-700 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-750">
        <div>
          <span className="font-bold text-white">{day.dayName}</span>
          <span className="text-slate-400 text-sm ml-2">{day.shortDate}</span>
        </div>
        <ScoreBadge score={day.bestScore} large />
      </div>
      {day.slots.map(slot => (
        <SlotRow
          key={slot.time}
          slot={slot}
          isExpanded={expandedTime === slot.time}
          onToggle={() => toggle(slot.time)}
        />
      ))}
    </div>
  )
}

export default function Home() {
  const [data, setData] = useState<Forecast[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [guideOpen, setGuideOpen] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/forecast')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json)
      setLastUpdated(
        new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const days: DayGroup[] = data
    ? Object.values(
        data.reduce(
          (acc, slot) => {
            if (!acc[slot.date]) {
              acc[slot.date] = {
                date: slot.date,
                dayName: getDayName(slot.date),
                shortDate: getShortDate(slot.date),
                slots: [],
                bestScore: 0,
              }
            }
            acc[slot.date].slots.push(slot)
            acc[slot.date].bestScore = Math.max(acc[slot.date].bestScore, slot.score)
            return acc
          },
          {} as Record<string, DayGroup>,
        ),
      )
    : []

  return (
    <main className="max-w-lg mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Langevelderslag</h1>
          <p className="text-slate-400 text-sm">Kite Forecast</p>
          {lastUpdated && (
            <p className="text-slate-500 text-xs mt-0.5">Updated {lastUpdated}</p>
          )}
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="mt-1 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-medium transition-colors"
        >
          {loading ? '…' : '↻ Refresh'}
        </button>
      </div>

      <BeginnerGuide open={guideOpen} onToggle={() => setGuideOpen(o => !o)} />

      {error && (
        <div className="rounded-xl bg-red-900/50 border border-red-700 p-4 mb-4 text-center">
          <p className="text-red-300 font-medium mb-1">Failed to load forecast</p>
          <p className="text-red-400 text-sm mb-3">{error}</p>
          <button
            onClick={fetchData}
            className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-sm font-medium"
          >
            Retry
          </button>
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-3">
          {days.map(day => (
            <DayCard key={day.date} day={day} />
          ))}
        </div>
      )}
    </main>
  )
}
