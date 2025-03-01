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

export default function Home() {
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchForecast();
  }, []);

  const fetchForecast = async () => {
    try {
      const response = await fetch('https://trondur78.pythonanywhere.com/api/forecast');
      if (!response.ok) throw new Error('Failed to fetch forecast');
      const data = await response.json();
      setForecasts(data);
    } catch (err) {
      setError('Could not load forecast data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    if (score >= 40) return 'text-orange-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-900 text-white">
        <p className="text-lg">Loading forecast data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-900 text-white">
        <p className="text-lg text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-900 p-4">
      <h1 className="text-2xl font-bold text-center mb-4 text-white">
        Claudia Kite Predictor
      </h1>

      <div className="space-y-4">
        {forecasts.map((forecast, index) => (
          <div key={index} className="bg-gray-800 rounded-lg shadow-lg p-4 border border-gray-700">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg font-semibold text-white">
                {forecast.date} - {forecast.time}
              </h2>
              <span className={`text-xl font-bold ${getScoreColor(forecast.score)}`}>
                {forecast.score}/100
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-3">
              <div className="bg-gray-700 p-3 rounded-md">
                <p className="font-semibold text-gray-300 mb-1">Wind</p>
                <p className="text-white text-lg">{forecast.wind_speed} knots</p>
                <p className="text-white text-lg">{forecast.wind_direction}°</p>
              </div>
              <div className="bg-gray-700 p-3 rounded-md">
                <p className="font-semibold text-gray-300 mb-1">Tide</p>
                <p className="text-white text-lg">{forecast.tide_state}</p>
                <p className="text-white text-lg">
                  {forecast.current_direction} ({forecast.current_strength}%)
                </p>
              </div>
            </div>

            <div className="bg-gray-700 p-3 rounded-md">
              <p className="font-semibold text-gray-300 mb-1">Conditions</p>
              <p className="text-white">{forecast.conditions}</p>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}