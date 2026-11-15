import { useEffect, useState } from 'react'
import type { Point } from './MapExplorer'
import { useMissionStore } from '../store/missionStore'

type Site = Point & { name: string; kind: string; description: string; source_url: string }
type Details = {
  elevation_m: number | null; image_url: string
  background: { title: string; text: string; source_url: string }
}
type PointWeather = {
  station?: { site_name?: string; sol?: string | number; min_temp_c?: number | null; max_temp_c?: number | null; pressure_pa?: number | null; atmo_opacity?: string | null; distance_km?: number; source_url?: string }
  regional?: { nearest?: { name?: string; distance_km?: number; weather?: { min_temp_c?: number; max_temp_c?: number; dust_index?: number; classification?: string } } }
}
const caption = (point: Point | null) => point ? point.name ?? point.relative ?? `${point.lat.toFixed(3)}°, ${point.lon.toFixed(3)}°` : 'Not selected'
const same = (a: Point | null, b: Point) => !!a && Math.abs(a.lat - b.lat) < 0.0001 && Math.abs(((a.lon - b.lon + 540) % 360) - 180) < 0.0001
const pointKey = (p: Point | null) => p ? `${p.lat.toFixed(4)},${p.lon.toFixed(4)}` : ''

function weatherText(data: PointWeather | null | undefined): string {
  if (!data) return 'Weather: loading…'
  const st = data.station
  const reg = data.regional?.nearest
  const parts: string[] = []
  if (st) {
    const t = st.min_temp_c != null && st.max_temp_c != null ? `${Math.round(st.min_temp_c)}/${Math.round(st.max_temp_c)}°C` : 'temp —'
    const p = st.pressure_pa != null ? `${Math.round(st.pressure_pa)} Pa` : 'pressure —'
    const dist = st.distance_km != null && st.distance_km > 5 ? `, ${Math.round(st.distance_km)} km away` : ''
    parts.push(`REMS ${st.site_name ?? 'Gale'}${dist}: Sol ${st.sol ?? '—'}, ${t}, ${p}, opacity ${st.atmo_opacity ?? '—'}`)
  }
  if (reg?.weather) {
    const w = reg.weather
    parts.push(`Regional (${reg.name ?? 'nearest'}): ${w.min_temp_c != null && w.max_temp_c != null ? `${Math.round(w.min_temp_c)}/${Math.round(w.max_temp_c)}°C` : '—'}, dust ${w.dust_index != null ? w.dust_index.toFixed(2) : '—'}${w.classification ? ` (${w.classification})` : ''}`)
  }
  return parts.length ? parts.join(' · ') : 'Weather data unavailable'
}

export default function SiteSearch({ endpoints, busy, onSelect, onReset }: {
  endpoints: { start: Point | null; end: Point | null }
  busy: boolean
  onSelect: (point: Point, role: 'start' | 'end') => void
  onReset: () => void
}) {
  const [sites, setSites] = useState<Site[]>([])
  const slopeLimit = useMissionStore(s => s.slopeLimit)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [site, setSite] = useState<Site | null>(null)
  const [details, setDetails] = useState<Details | null>(null)
  const [error, setError] = useState('')
  const [pointWeather, setPointWeather] = useState<{ start?: PointWeather | null; end?: PointWeather | null }>({})
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/sites', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Site search is unavailable')
      const data: Site[] = await response.json()
      setSites(data.map(s => ({ ...s, lon: ((s.lon + 180) % 360 + 360) % 360 - 180 })))
    }).catch(e => { if (!controller.signal.aborted) setError(e.message) })
    return () => controller.abort()
  }, [])
  useEffect(() => {
    if (!site) return
    const controller = new AbortController()
    fetch(`/api/locations/inspect?lon=${site.lon}&lat=${site.lat}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Site information is unavailable')
      const data = await response.json()
      if (!controller.signal.aborted) setDetails(data)
    }).catch(e => { if (!controller.signal.aborted) setError(e.message) })
    return () => controller.abort()
  }, [site])
  const startKey = pointKey(endpoints.start)
  const endKey = pointKey(endpoints.end)
  useEffect(() => {
    const start = endpoints.start
    const end = endpoints.end
    const controllers: AbortController[] = []
    const load = (role: 'start' | 'end', point: Point | null) => {
      if (!point) { setPointWeather(p => ({ ...p, [role]: null })); return }
      const c = new AbortController(); controllers.push(c)
      setPointWeather(p => ({ ...p, [role]: undefined }))
      fetch(`/api/weather/point?lon=${point.lon}&lat=${point.lat}`, { signal: c.signal })
        .then(async r => r.ok ? r.json() : Promise.reject(new Error('weather unavailable')))
        .then(data => { if (!c.signal.aborted) setPointWeather(p => ({ ...p, [role]: data })) })
        .catch(() => { if (!c.signal.aborted) setPointWeather(p => ({ ...p, [role]: null })) })
    }
    load('start', start)
    load('end', end)
    return () => controllers.forEach(c => c.abort())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startKey, endKey])
  const matches = sites.filter(s => `${s.name} ${s.kind} ${s.description}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <section aria-label="Site search and route selection" className="w-[420px] max-w-[calc(100vw-24px)] rounded-xl border border-white/15 bg-neutral-950/95 text-xs shadow-xl">
    <div className="flex items-center gap-2 px-3 py-2">
      <input aria-label="Search Mars sites" placeholder="Search Mars sites…" value={query} onFocus={() => setOpen(true)} onChange={e => { setQuery(e.target.value); setSite(null); setDetails(null); setOpen(true) }} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }} className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none" />
      {open && <button aria-label="Close site search" onClick={() => setOpen(false)}>✕</button>}
    </div>
    <div className="space-y-1.5 border-t border-white/10 px-3 py-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <span className="block text-cyan-300" title={endpoints.start ? `${endpoints.start.lat.toFixed(3)}°, ${endpoints.start.lon.toFixed(3)}° · Bearing from nearest mapped site to point` : ''}>Start: {caption(endpoints.start)}</span>
          {endpoints.start && <p className="mt-0.5 text-[10px] leading-snug text-neutral-400">{weatherText(pointWeather.start)}</p>}
        </div>
        <div className="min-w-0 flex-1">
          <span className="block text-orange-300" title={endpoints.end ? `${endpoints.end.lat.toFixed(3)}°, ${endpoints.end.lon.toFixed(3)}° · Bearing from nearest mapped site to point` : ''}>Destination: {caption(endpoints.end)}</span>
          {endpoints.end && <p className="mt-0.5 text-[10px] leading-snug text-neutral-400">{weatherText(pointWeather.end)}</p>}
        </div>
        {(endpoints.start || endpoints.end) && <button onClick={onReset} disabled={busy} className="shrink-0 underline disabled:opacity-40">Clear</button>}
      </div>
      {(endpoints.start || endpoints.end) && (
        <p className="text-[10px] text-neutral-500">
          Weather: realtime NASA/JPL REMS (Curiosity, Gale Crater) + regional screening. <a href="https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json" target="_blank" rel="noreferrer" className="underline text-orange-300/80">REMS source</a>
        </p>
      )}
    </div>
    {open && <div className="max-h-[65vh] overflow-y-auto border-t border-white/10 p-3">
      {error && <p role="alert" className="mb-2 text-red-300">{error}</p>}
      {!site ? <ul className="space-y-1" aria-label="Matching sites">
        {matches.map(s => <li key={s.name}><button className="w-full rounded p-2 text-left hover:bg-white/10 focus:bg-white/10" onClick={() => { setSite(s); setDetails(null); setError('') }}><span className="block font-medium">{s.name}</span><span className="text-neutral-400">{s.kind} · {s.description}</span></button></li>)}
        {!matches.length && <li>No matching sites.</li>}
      </ul> : <div className="space-y-3">
        <button onClick={() => setSite(null)} className="text-neutral-400 underline">← Results</button>
        <h2 className="text-sm font-semibold">{site.name}</h2>
        <p>{site.description} · {site.lat.toFixed(3)}°, {site.lon.toFixed(3)}°</p>
        {details ? <><img src={details.image_url} alt={`NASA Viking orbital imagery near ${site.name}`} className="mx-auto h-36 w-36 rounded" /><p className="font-medium text-orange-200">{details.background.title}</p><p>{details.background.text}</p><p>MOLA elevation: {details.elevation_m === null ? 'unavailable' : `${Math.round(details.elevation_m)} m`}</p><a href={details.background.source_url} target="_blank" rel="noreferrer" className="inline-block underline">Background source</a></> : <p role="status">{error ? 'Information could not be loaded.' : 'Loading site information…'}</p>}
        <div className="flex gap-2">
          <button disabled={busy || same(endpoints.end, site)} onClick={() => onSelect(site, 'start')} className="rounded border border-cyan-300/40 bg-cyan-400/10 px-3 py-2 text-cyan-200 disabled:opacity-30">Set start</button>
          <button disabled={busy || same(endpoints.start, site)} onClick={() => onSelect(site, 'end')} className="rounded border border-orange-300/40 bg-orange-400/10 px-3 py-2 text-orange-200 disabled:opacity-30">Set destination</button>
        </div>
        <p className="text-neutral-400">Choose distinct sites at least 1 km apart. Long traverses are regional previews, not certified drive plans. Routes are compared automatically using a {slopeLimit}° slope limit and the crew mission assumptions.</p>
        <p className="text-neutral-400">Or click anywhere on Mars. Off-site points show their distance and bearing from the nearest mapped site (north = 0°, east = 90°).</p>
      </div>}
    </div>}
  </section>
}
