// Sky for the Ascent scene: picks one of the 8 cloud sets from the time of day (relative to sunrise/sunset) and the weather.
// Weather comes from Open-Meteo (free, no key; sends only the house's city coordinates, no personal data), cached 30 min.
// Test overrides: ?weather=clear|partly|cloudy|fog|rain|snow|storm  and  ?now=2026-11-19T21:00
const LAT = 41.39, LON = 2.17; // Barcelona
const KEY = 'house-quest-weather-v1', TTL = 30 * 60000;
const LAYERS = { 1: 4, 2: 4, 3: 4, 4: 4, 5: 5, 6: 6, 7: 4, 8: 6 };
const layerUrls = (set) => Array.from({ length: LAYERS[set] }, (_, i) => `url(img/sky/s${set}-${LAYERS[set] - i}.png)`).join(',');

const cat = (code) => (code <= 1 ? 'clear' : code === 2 ? 'partly' : code === 3 ? 'cloudy' : code === 45 || code === 48 ? 'fog'
  : (code >= 51 && code <= 67) || (code >= 80 && code <= 82) ? 'rain' : (code >= 71 && code <= 77) || code === 85 || code === 86 ? 'snow' : code >= 95 ? 'storm' : 'partly');

let cache = null;
try { cache = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* none */ }

export async function refreshWeather(onChange) {
  if (new URLSearchParams(location.search).get('weather')) return;
  if (cache && Date.now() - cache.t < TTL) return;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=weather_code&daily=sunrise,sunset&timezone=auto&forecast_days=1`);
    if (!r.ok) return;
    const j = await r.json();
    cache = { t: Date.now(), code: j.current.weather_code, sunrise: j.daily.sunrise[0], sunset: j.daily.sunset[0] };
    localStorage.setItem(KEY, JSON.stringify(cache));
    onChange?.();
  } catch { /* offline: keep the last value or the defaults */ }
}

const mins = (iso, fallback) => { if (!iso) return fallback; const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };

/** { set, kind, phase, weather, tint, fx } for a moment in time. */
export function skyFor(now) {
  const forced = new URLSearchParams(location.search).get('weather');
  const weather = forced || (cache ? cat(cache.code) : 'clear');
  const m = now.getHours() * 60 + now.getMinutes();
  const rise = mins(cache?.sunrise, 7 * 60 + 30), set = mins(cache?.sunset, 18 * 60);
  const phase = m < rise - 45 || m >= set + 75 ? 'night' : m < rise + 60 ? 'dawn' : m < rise + 180 ? 'morning' : m < set - 90 ? 'day'
    : m < set - 5 ? 'golden' : m < set + 30 ? 'dusk' : 'twilight';
  const grey = ['cloudy', 'fog', 'rain', 'snow', 'storm'].includes(weather);
  let setN = { night: 3, dawn: 6, morning: 5, day: weather === 'partly' ? 5 : 1, golden: 7, dusk: 2, twilight: 8 }[phase];
  if (grey && phase !== 'night') setN = 4;
  const tint = !grey ? 0 : weather === 'storm' ? 0.55 : weather === 'rain' ? 0.4 : weather === 'fog' ? 0.3 : weather === 'snow' ? 0.2 : 0.25;
  // the ground follows the sky: a colour wash over everything below ground level, and a grass colour
  const wash = { night: '8,12,40,.5', dawn: '255,150,90,.16', morning: '255,230,180,.05', day: '0,0,0,0', golden: '255,140,40,.2', dusk: '120,60,140,.3', twilight: '30,30,90,.38' }[phase];
  const wet = weather === 'rain' || weather === 'storm' ? 'rgba(25,35,50,.22)' : weather === 'fog' ? 'rgba(200,205,210,.2)' : weather === 'cloudy' ? 'rgba(40,45,55,.1)' : '';
  const grass = weather === 'snow' ? '#f4f8ff' : phase === 'night' || phase === 'twilight' ? '#1f4d2a' : weather === 'rain' || weather === 'storm' ? '#2f7a3a' : '#3f8a3c';
  return { wash: `rgba(${wash})`, wet, grass, snow: weather === 'snow', set: setN, phase, weather, tint, fx: ['rain', 'snow', 'storm'].includes(weather) ? weather : '', image: layerUrls(setN), fog: weather === 'fog' };
}
