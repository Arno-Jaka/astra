import { useEffect, useState } from 'react'

type StationWeather = {
  ok?: boolean
  station_name?: string
  site_name?: string
  sol?: string | number
  terrestrial_date?: string
  min_temp_c?: number | null
  max_temp_c?: number | null
  pressure_pa?: number | null
  atmo_opacity?: string | null
  source_url?: string
  data_note?: string
  retrieved_at?: string
  instrument?: string
  data_status?: 'live' | 'cached'
}

function fmtTemp(min?: number | null, max?: number | null) {
  if (min == null && max == null) return '—'
  const lo = min == null ? '—' : `${Math.round(min)}°C`
  const hi = max == null ? '—' : `${Math.round(max)}°C`
  return `${lo} / ${hi}`
}

export default function WeatherCard() {
  const [data, setData] = useState<StationWeather | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/weather/station')
        if (!res.ok) throw new Error('unavailable')
        const json = (await res.json()) as StationWeather
        if (!cancelled) { setData(json); setError('') }
      } catch {
        if (!cancelled) setError('Weather data unavailable')
      }
    }
    load()
    const id = window.setInterval(load, 30 * 60 * 1000)
    return () => { cancelled = true; window.clearInterval(id) }
  }, [])

  return (
    <aside className="w-[240px] max-w-[calc(100vw-24px)] rounded-xl border border-white/15 bg-neutral-950/95 p-3 text-xs shadow-xl">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-orange-300/80">Mars weather</p>
          <h2 className="text-sm font-semibold text-white">
            {data?.data_status === 'cached' ? 'Last observed' : 'Realtime conditions'}
          </h2>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
          data?.data_status === 'cached'
            ? 'border-amber-400/30 bg-amber-400/10 text-amber-300'
            : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
        }`}>
          {data?.data_status === 'cached' ? 'Cached' : 'Live'}
        </span>
      </div>
      {error && <p className="mt-2 text-red-300">{error}</p>}
      {!error && !data && <p className="mt-2 text-neutral-400">Loading…</p>}
      {data && (
        <div className="mt-2 space-y-1.5">
          <p className="text-neutral-300">
            <span className="text-neutral-500">Station:</span> {data.station_name ?? 'Curiosity'} · {data.site_name ?? 'Gale Crater'}
          </p>
          <p className="text-neutral-300">
            <span className="text-neutral-500">Sol:</span> {data.sol ?? '—'}
            {data.terrestrial_date ? <span className="text-neutral-500"> · {data.terrestrial_date}</span> : null}
          </p>
          <p className="text-neutral-300">
            <span className="text-neutral-500">Air temp:</span> {fmtTemp(data.min_temp_c, data.max_temp_c)}
          </p>
          <p className="text-neutral-300">
            <span className="text-neutral-500">Pressure:</span> {data.pressure_pa != null ? `${Math.round(data.pressure_pa)} Pa` : '—'}
          </p>
          <p className="text-neutral-300">
            <span className="text-neutral-500">Opacity:</span> {data.atmo_opacity ?? '—'}
          </p>
          {data.retrieved_at && (
            <p className="text-[10px] text-neutral-500">
              {data.data_status === 'cached' ? 'Last retrieved' : 'Retrieved'}{' '}
              {new Date(data.retrieved_at).toLocaleString()}
            </p>
          )}
          <p className="text-[10px] leading-relaxed text-neutral-500">{data.data_note}</p>
          {data.source_url && (
            <a href={data.source_url} target="_blank" rel="noreferrer" className="inline-block text-[10px] text-orange-300/80 underline-offset-2 hover:text-orange-200 hover:underline">
              Source: NASA/JPL REMS (Curiosity)
            </a>
          )}
        </div>
      )}
    </aside>
  )
}
