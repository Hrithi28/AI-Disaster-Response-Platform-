import { CloudRain, Wind } from 'lucide-react';
import { useState } from 'react';
import { useLive } from '../context/LiveData';

/** Live Open-Meteo weather (falls back to "offline" when there is no internet). */
export default function WeatherCard() {
  const { weather } = useLive();
  const [open, setOpen] = useState(false);
  if (!weather) return null;
  const live = weather.summary && !String(weather.source).startsWith('unavailable');
  return (
    <button onClick={() => setOpen((o) => !o)} className="panel max-w-[280px] px-3 py-2 text-left text-[11px]">
      <div className="flex items-center gap-2 font-semibold text-slate-200">
        <CloudRain size={13} className="text-sky-400" /> Weather feed
        <span className={`ml-auto chip ${live ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-500/20 text-slate-400'}`}>{weather.source}</span>
      </div>
      {live ? (
        <div className="mt-1 text-slate-300">
          Next 24 h: <b className="font-mono">{weather.summary.max_rain_next_24h_mm} mm</b> ({weather.summary.imd_category}) ·{' '}
          <Wind size={11} className="inline" /> gusts <b className="font-mono">{weather.summary.max_gust_kmph} km/h</b>
        </div>
      ) : (
        <div className="mt-1 text-slate-500">No internet — severity uses the simulated scenario. Live data resumes automatically.</div>
      )}
      {open && live && (
        <table className="mt-2 w-full">
          <tbody>
            {weather.points.map((p) => (
              <tr key={p.name} className="border-t border-ink-700">
                <td className="py-0.5">{p.name}</td>
                <td className="text-right font-mono">{p.rain_next_24h_mm} mm</td>
                <td className="text-right font-mono">{p.gust_kmph} km/h</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </button>
  );
}
