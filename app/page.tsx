'use client';

import { useEffect, useState } from 'react';

interface Forecast {
  date: string;
  time: string;
  wind_speed: number;
  wind_direction: number;
  wind_gust: number;
  wave_height: number;
  is_gusty: boolean;
  wind_label: string;
  kite_size: string;
  tide_state: string;
  current_direction: string;
  current_strength: number;
  precipitation: number;
  score: number;
  conditions: string;
}

interface DayGroup {
  date: string;
  label: string;
  slots: Forecast[];
  bestScore: number;
  bestWindow: string | null;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
}

function getBestWindow(slots: Forecast[]): string | null {
  const good = slots.filter(s => s.score >= 60);
  if (good.length === 0) return null;
  if (good.length === 1) return good[0].time;
  // Find longest consecutive run
  let bestRun: Forecast[] = [];
  let currentRun: Forecast[] = [good[0]];
  for (let i = 1; i < good.length; i++) {
    const prevIdx = slots.indexOf(good[i - 1]);
    const currIdx = slots.indexOf(good[i]);
    if (currIdx === prevIdx + 1) {
      currentRun.push(good[i]);
    } else {
      if (currentRun.length > bestRun.length) bestRun = currentRun;
      currentRun = [good[i]];
    }
  }
  if (currentRun.length > bestRun.length) bestRun = currentRun;
  if (bestRun.length === 1) return bestRun[0].time;
  return `${bestRun[0].time}–${bestRun[bestRun.length - 1].time}`;
}

function ScoreBadge({ score }: { score: number }) {
  let bg = 'bg-gray-700';
  let text = 'text-gray-400';
  if (score >= 80) { bg = 'bg-green-600'; text = 'text-white'; }
  else if (score >= 60) { bg = 'bg-yellow-500'; text = 'text-gray-900'; }
  else if (score >= 40) { bg = 'bg-orange-500'; text = 'text-white'; }
  else if (score > 0) { bg = 'bg-red-700'; text = 'text-white'; }
  return (
    <span className={`${bg} ${text} text-xs font-bold px-2 py-1 rounded-full min-w-[38px] text-center inline-block`}>
      {score === 0 ? '—' : score}
    </span>
  );
}

function WindArrow({ direction }: { direction: number }) {
  return (
    <span
      style={{ display: 'inline-block', transform: `rotate(${direction + 180}deg)`, fontSize: '0.9rem', lineHeight: 1 }}
      title={`${direction}°`}
    >
      ↑
    </span>
  );
}

function WindLabelBadge({ label }: { label: string }) {
  let color = 'text-gray-500';
  if (label === 'cross-offshore') color = 'text-green-400';
  else if (label === 'offshore') color = 'text-red-400';
  else if (label === 'cross-shore') color = 'text-yellow-400';
  else if (label === 'onshore') color = 'text-orange-400';
  return <span className={`${color} text-xs`}>{label}{label === 'offshore' ? ' ⚠️' : ''}</span>;
}

function TideIcon({ state }: { state: string }) {
  if (state === 'rising') return <span title="Rising tide" className="text-blue-300">↑</span>;
  if (state === 'falling') return <span title="Falling tide" className="text-blue-300">↓</span>;
  return <span className="text-gray-500">~</span>;
}

function SkeletonCard() {
  return (
    <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 animate-pulse">
      <div className="h-5 bg-gray-700 rounded w-1/3 mb-3" />
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="h-10 bg-gray-700 rounded mb-2" />
      ))}
    </div>
  );
}

function BeginnerGuide() {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-teal-900/40 border border-teal-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-teal-300 font-semibold text-sm">What do the scores mean?</span>
        <span className="text-teal-500 text-xs">{open ? '▲ hide' : '▼ show'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 text-sm">
          <div className="space-y-1">
            <p className="text-gray-300 font-medium mb-1">Score guide</p>
            <div className="flex items-center gap-2"><span className="bg-green-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">80+</span><span className="text-gray-300">Perfect — ideal conditions for beginners</span></div>
            <div className="flex items-center gap-2"><span className="bg-yellow-500 text-gray-900 text-xs font-bold px-2 py-0.5 rounded-full">60–79</span><span className="text-gray-300">Good — enjoyable with minor compromises</span></div>
            <div className="flex items-center gap-2"><span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">40–59</span><span className="text-gray-300">OK — manageable but not ideal</span></div>
            <div className="flex items-center gap-2"><span className="bg-red-700 text-white text-xs font-bold px-2 py-0.5 rounded-full">1–39</span><span className="text-gray-300">Poor — not recommended for beginners</span></div>
            <div className="flex items-center gap-2"><span className="bg-gray-700 text-gray-400 text-xs font-bold px-2 py-0.5 rounded-full">—</span><span className="text-gray-300">Not kiteable — wrong wind direction</span></div>
          </div>

          <div>
            <p className="text-gray-300 font-medium mb-1">Perfect beginner session</p>
            <ul className="text-gray-400 space-y-0.5 list-disc list-inside">
              <li>Wind 16–22 knots, steady (no gusts)</li>
              <li>SW direction — cross-offshore is safest</li>
              <li>Wave height under 0.5m — flat water</li>
              <li>Dry weather</li>
            </ul>
          </div>

          <div className="bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">
            <p className="text-red-300 text-xs font-medium">Safety: offshore wind ⚠️</p>
            <p className="text-gray-400 text-xs mt-0.5">If the wind label says "offshore", the wind blows straight out to sea. If you fall or lose your kite, you drift away from shore. Beginners should avoid offshore days entirely.</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    fetchForecast();
  }, []);

  const fetchForecast = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/forecast');
      if (!response.ok) throw new Error('Failed to fetch forecast');
      const data = await response.json();
      setForecasts(data);
      setUpdatedAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      setError('Could not load forecast data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Group by day
  const days: DayGroup[] = [];
  for (const f of forecasts) {
    let day = days.find(d => d.date === f.date);
    if (!day) {
      day = { date: f.date, label: formatDate(f.date), slots: [], bestScore: 0, bestWindow: null };
      days.push(day);
    }
    day.slots.push(f);
    if (f.score > day.bestScore) day.bestScore = f.score;
  }
  for (const day of days) {
    day.bestWindow = getBestWindow(day.slots);
  }

  const toggleSlot = (key: string) => {
    setExpanded(prev => prev === key ? null : key);
  };

  return (
    <main className="min-h-screen bg-gray-900 pb-8">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-4 mb-4 sticky top-0 z-10">
        <h1 className="text-xl font-bold text-white tracking-tight">Langevelderslag</h1>
        <p className="text-gray-400 text-sm">
          Kite Forecast
          {updatedAt && <span className="ml-2 text-gray-500">· Updated {updatedAt}</span>}
        </p>
      </div>

      <div className="px-4 space-y-4 max-w-lg mx-auto">
        {/* Beginner guide */}
        {!loading && !error && <BeginnerGuide />}

        {loading && (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}

        {error && (
          <div className="bg-red-900/40 border border-red-700 rounded-xl p-4 text-center">
            <p className="text-red-300 mb-3">{error}</p>
            <button
              onClick={fetchForecast}
              className="bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && days.map(day => (
          <div key={day.date} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            {/* Day header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <div>
                <span className="text-white font-semibold">{day.label}</span>
                {day.bestWindow && day.bestScore >= 60 && (
                  <span className="ml-2 text-gray-400 text-xs">{day.bestWindow}</span>
                )}
              </div>
              <ScoreBadge score={day.bestScore} />
            </div>

            {/* Time slots */}
            <div className="divide-y divide-gray-700">
              {day.slots.map(slot => {
                const key = `${slot.date}-${slot.time}`;
                const isExpanded = expanded === key;
                return (
                  <div key={key}>
                    <button
                      onClick={() => toggleSlot(key)}
                      className="w-full text-left px-4 py-3 flex items-center gap-2 active:bg-gray-700 transition-colors"
                    >
                      {/* Time */}
                      <span className="text-gray-400 text-sm w-11 shrink-0">{slot.time}</span>

                      {/* Wind speed + arrow */}
                      <div className="w-20 shrink-0">
                        <div className="text-white text-sm font-medium">
                          <WindArrow direction={slot.wind_direction} />
                          {' '}{slot.wind_speed} kn
                        </div>
                        <WindLabelBadge label={slot.wind_label} />
                      </div>

                      {/* Tide */}
                      <span className="text-sm w-4 shrink-0">
                        <TideIcon state={slot.tide_state} />
                      </span>

                      {/* Indicators */}
                      <div className="flex items-center gap-1 shrink-0">
                        {slot.is_gusty && (
                          <span className="text-xs bg-orange-900/60 text-orange-300 px-1.5 py-0.5 rounded">💨</span>
                        )}
                        {slot.precipitation >= 0.1 && (
                          <span className="text-xs text-blue-400" title={`${slot.precipitation}mm`}>💧</span>
                        )}
                        {slot.wave_height >= 1.0 && (
                          <span className="text-xs text-yellow-400" title={`${slot.wave_height}m waves`}>🌊</span>
                        )}
                      </div>

                      <span className="flex-1" />

                      {/* Score */}
                      <ScoreBadge score={slot.score} />

                      {/* Expand chevron */}
                      <span className="text-gray-500 text-xs ml-1">{isExpanded ? '▲' : '▼'}</span>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-4 pb-3 pt-2 border-t border-gray-700 bg-gray-850">
                        <p className="text-gray-300 text-sm mb-3">{slot.conditions}</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-400">
                          <span>Wind: {slot.wind_speed} kn ({slot.wind_direction}°)</span>
                          <span>Gusts: {slot.wind_gust} kn{slot.is_gusty ? ' ⚠️' : ''}</span>
                          <span>Kite size: {slot.kite_size}</span>
                          <span>Waves: {slot.wave_height}m{slot.wave_height >= 1.0 ? ' ⚠️' : ''}</span>
                          <span>Tide: {slot.tide_state}</span>
                          <span>Current: {slot.current_direction} ({slot.current_strength}%)</span>
                          {slot.precipitation >= 0.1 && <span>Rain: {slot.precipitation} mm/h</span>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
