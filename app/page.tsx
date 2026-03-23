'use client';

import { useEffect, useState } from 'react';

interface Forecast {
  date: string;
  time: string;
  wind_speed: number;
  wind_direction: number;
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
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
}

function ScoreBadge({ score }: { score: number }) {
  let bg = 'bg-gray-600';
  let text = 'text-gray-200';
  if (score === 0) { bg = 'bg-gray-700'; text = 'text-gray-400'; }
  else if (score >= 80) { bg = 'bg-green-600'; text = 'text-white'; }
  else if (score >= 60) { bg = 'bg-yellow-500'; text = 'text-gray-900'; }
  else if (score >= 40) { bg = 'bg-orange-500'; text = 'text-white'; }
  else { bg = 'bg-red-700'; text = 'text-white'; }
  return (
    <span className={`${bg} ${text} text-xs font-bold px-2 py-1 rounded-full min-w-[38px] text-center`}>
      {score === 0 ? '—' : score}
    </span>
  );
}

function WindArrow({ direction }: { direction: number }) {
  // Arrow points in the direction wind is coming FROM, so rotate 180deg offset
  return (
    <span
      style={{ display: 'inline-block', transform: `rotate(${direction}deg)`, fontSize: '1rem', lineHeight: 1 }}
      title={`${direction}°`}
    >
      ↑
    </span>
  );
}

function TideIcon({ state }: { state: string }) {
  if (state === 'rising') return <span title="Rising tide">↑</span>;
  if (state === 'falling') return <span title="Falling tide">↓</span>;
  return <span title="Unknown">~</span>;
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
      day = { date: f.date, label: formatDate(f.date), slots: [], bestScore: 0 };
      days.push(day);
    }
    day.slots.push(f);
    if (f.score > day.bestScore) day.bestScore = f.score;
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
              <span className="text-white font-semibold">{day.label}</span>
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
                      className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-750 active:bg-gray-700 transition-colors"
                    >
                      {/* Time */}
                      <span className="text-gray-400 text-sm w-12 shrink-0">{slot.time}</span>

                      {/* Wind */}
                      <span className="text-white text-sm font-medium w-16 shrink-0">
                        <WindArrow direction={slot.wind_direction} />
                        {' '}{slot.wind_speed} kn
                      </span>

                      {/* Tide */}
                      <span className="text-gray-400 text-sm w-6 shrink-0">
                        <TideIcon state={slot.tide_state} />
                      </span>

                      {/* Rain dot */}
                      <span className="w-4 shrink-0">
                        {slot.precipitation >= 0.1 && (
                          <span className="text-blue-400 text-xs" title={`${slot.precipitation}mm`}>💧</span>
                        )}
                      </span>

                      {/* Spacer */}
                      <span className="flex-1" />

                      {/* Score */}
                      <ScoreBadge score={slot.score} />

                      {/* Expand chevron */}
                      <span className="text-gray-500 text-xs ml-1">{isExpanded ? '▲' : '▼'}</span>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-4 pb-3 pt-1 bg-gray-750 border-t border-gray-700">
                        <p className="text-gray-300 text-sm mb-2">{slot.conditions}</p>
                        <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
                          <span>Direction: {slot.wind_direction}°</span>
                          <span>Tide: {slot.tide_state}</span>
                          <span>Current: {slot.current_direction}</span>
                          <span>Current strength: {slot.current_strength}%</span>
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
