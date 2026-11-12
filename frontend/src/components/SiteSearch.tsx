import { useEffect, useState } from 'react'
import type { Point } from './MapExplorer'

type Site = Point & { name: string; kind: string; description: string; source_url: string }
type Details = {
  elevation_m: number | null; image_url: string
  background: { title: string; text: string; source_url: string }
}
const caption = (point: Point | null) => point ? point.name ?? point.relative ?? `${point.lat.toFixed(3)}°, ${point.lon.toFixed(3)}°` : 'Not selected'
const same = (a: Point | null, b: Point) => !!a && Math.abs(a.lat - b.lat) < 0.0001 && Math.abs(((a.lon - b.lon + 540) % 360) - 180) < 0.0001

export default function SiteSearch({ endpoints, busy, onSelect, onReset }: {
  endpoints: { start: Point | null; end: Point | null }
  busy: boolean
  onSelect: (point: Point, role: 'start' | 'end') => void
  onReset: () => void
}) {
  const [sites, setSites] = useState<Site[]>([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [site, setSite] = useState<Site | null>(null)
  const [details, setDetails] = useState<Details | null>(null)
  const [error, setError] = useState('')
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
  const matches = sites.filter(s => `${s.name} ${s.kind} ${s.description}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <section aria-label="Site search and route selection" className="fixed left-1/2 top-3 z-30 w-[420px] max-w-[calc(100vw-24px)] -translate-x-1/2 rounded-xl border border-white/15 bg-neutral-950/95 text-xs shadow-xl">
    <div className="flex items-center gap-2 px-3 py-2">
      <input aria-label="Search Mars sites" placeholder="Search Mars sites…" value={query} onFocus={() => setOpen(true)} onChange={e => { setQuery(e.target.value); setSite(null); setDetails(null); setOpen(true) }} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }} className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none" />
      {open && <button aria-label="Close site search" onClick={() => setOpen(false)}>✕</button>}
    </div>
    <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2">
      <span className="min-w-0 flex-1 text-cyan-300" title={endpoints.start ? `${endpoints.start.lat.toFixed(3)}°, ${endpoints.start.lon.toFixed(3)}° · Bearing from nearest mapped site to point` : ''}>Start: {caption(endpoints.start)}</span>
      <span className="min-w-0 flex-1 text-orange-300" title={endpoints.end ? `${endpoints.end.lat.toFixed(3)}°, ${endpoints.end.lon.toFixed(3)}° · Bearing from nearest mapped site to point` : ''}>Destination: {caption(endpoints.end)}</span>
      {(endpoints.start || endpoints.end) && <button onClick={onReset} disabled={busy} className="underline disabled:opacity-40">Clear</button>}
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
        <p className="text-neutral-400">Choose distinct sites 1–400 km apart. Routes are compared automatically using a 15° slope limit.</p>
        <p className="text-neutral-400">Or click anywhere on Mars. Off-site points show their distance and bearing from the nearest mapped site (north = 0°, east = 90°).</p>
      </div>}
    </div>}
  </section>
}
