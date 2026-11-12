import { useEffect, useState } from 'react'
import FloatingPanel from './FloatingPanel'
import { useMissionStore, type CrewProfile } from '../store/missionStore'
import { useAppStore } from '../store/appStore'
import { useLayerStore } from '../store/layerStore'
import { dispatchLocalCommand } from '../ws/commandChannel'

type Mission = { title: string; summary: string; tasks: string[]; source_url: string; image_url: string; image_credit: string; region: { lon: number; lat: number }; location_note: string }
type Weather = { sol: string | number; terrestrial_date: string | null; min_temp_c: number | null; max_temp_c: number | null; pressure_pa: number | null; source_url: string }
const fields: { key: keyof Omit<CrewProfile, 'objective' | 'high_physical_risk' | 'strict_contamination' | 'repetitive_work'>; label: string; min: number; max: number; step: number }[] = [
  { key: 'pace_m_s', label: 'Assumed walking pace (m/s)', min: 0.1, max: 2, step: 0.1 },
  { key: 'mobility_allowance_pct', label: 'Suit/equipment extra travel time (%)', min: 0, max: 300, step: 10 },
  { key: 'science_minutes', label: 'Science stop (minutes)', min: 0, max: 480, step: 5 },
  { key: 'reserve_minutes', label: 'Return reserve (minutes)', min: 0, max: 480, step: 5 },
  { key: 'budget_hours', label: 'Total EVA time budget (hours)', min: 0.5, max: 24, step: 0.5 },
]

export default function CrewMissionPanel() {
  const [mission, setMission] = useState<Mission | null>(null)
  const [weather, setWeather] = useState<Weather | null>(null)
  const [weatherError, setWeatherError] = useState('')
  const [weatherReceivedAt, setWeatherReceivedAt] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const crew = useMissionStore(s => s.crew)
  const slope = useMissionStore(s => s.slopeLimit)
  const update = useMissionStore(s => s.update)
  const setSlope = useMissionStore(s => s.setSlopeLimit)
  const phase = useAppStore(s => s.routePhase)
  const route = useAppStore(s => s.route)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/mission', { signal: controller.signal }).then(async r => {
      if (!r.ok) throw new Error('Mission context unavailable')
      setMission(await r.json())
    }).catch(e => { if (!controller.signal.aborted) setError(e.message) })
    return () => controller.abort()
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => { setWeatherError('REMS request timed out. Atmospheric context unavailable.'); controller.abort() }, 35000)
    fetch('/api/weather/station', { signal: controller.signal }).then(async r => {
      if (!r.ok) throw new Error('REMS unavailable. Atmospheric context is not loaded.')
      const data = await r.json()
      if (!controller.signal.aborted) { setWeather(data); setWeatherReceivedAt(Date.now()); setWeatherError('') }
    }).catch(e => { if (!controller.signal.aborted) setWeatherError(e.message) }).finally(() => window.clearTimeout(timer))
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [attempt])
  const command = async (name: string, payload: Record<string, unknown> = {}) => {
    setWorking(true); setError('')
    try { await dispatchLocalCommand(name, payload) } catch (e) { setError(e instanceof Error ? e.message : 'Map action failed') }
    finally { setWorking(false) }
  }
  const age = weather?.terrestrial_date ? Math.floor((weatherReceivedAt - Date.parse(weather.terrestrial_date)) / 86400000) : NaN
  return <FloatingPanel id="crew-mission" title="Astronaut science mission" width={340} initial={{ left: 16, top: 85 }}>
    <div className="max-h-[50vh] space-y-4 overflow-auto p-3 text-xs">
      {error && <p role="alert" className="text-red-300">{error}</p>}
      {mission ? <section className="space-y-2">
        <h2 className="font-semibold text-orange-200">{mission.title}</h2>
        <p>{mission.summary}</p>
        <img src={mission.image_url} alt="Curiosity Mastcam panorama of low boxwork ridges in Mount Sharp's foothills" className="w-full rounded" />
        <a href={mission.source_url} target="_blank" rel="noreferrer" className="block text-[10px] text-neutral-400 underline">{mission.image_credit}</a>
        <ol className="list-inside list-decimal space-y-1">{mission.tasks.map(task => <li key={task}>{task}</li>)}</ol>
        <button disabled={working || phase === 'simulating'} onClick={() => {
          useLayerStore.setState({ base: 'viking', slope: true })
          void command('fly_to', { ...mission.region, height: 150000, duration: 1.6 })
        }} className="rounded border border-orange-200/30 px-3 py-2 disabled:opacity-40">Explore science region · optical + slopes</button>
        <p className="text-neutral-400">{mission.location_note}</p>
      </section> : <p>Loading science mission…</p>}
      <section className="space-y-2 border-t border-white/10 pt-3">
        <h3 className="font-semibold">Three NASA data contexts</h3>
        <p><a href="https://trek.nasa.gov/mars/" target="_blank" rel="noreferrer" className="underline">Optical · Viking / Mars Trek</a>: regional surface context; Mastcam image above provides science context, not a georeferenced obstacle map.</p>
        <p><a href="https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/" target="_blank" rel="noreferrer" className="underline">Topographic · MGS/MOLA</a>: terrain, grades and slope-aware routing, ~1.9 km/pixel.</p>
        <p className="font-medium">Atmospheric · Curiosity REMS (Gale station only)</p>
        {weather ? <div><p>Sol {weather.sol} · {weather.terrestrial_date ?? 'observation date unavailable'}</p><p>{weather.min_temp_c ?? '—'} to {weather.max_temp_c ?? '—'} °C · {weather.pressure_pa ?? '—'} Pa</p><p className="text-amber-200">{Number.isFinite(age) ? `${Math.max(0, age)} days since observation. ` : ''}Latest available station report; not a forecast or local weather at your destination.</p><a href={weather.source_url} target="_blank" rel="noreferrer" className="underline">REMS source</a></div> : <p role="status">{weatherError || 'Requesting the latest available station report…'}</p>}
        <button className="underline" onClick={() => { setWeatherError(''); setAttempt(n => n + 1) }}>Refresh atmospheric data</button>
        {weather && weatherError && <p role="alert" className="text-amber-200">{weatherError} Showing the previously retrieved report.</p>}
      </section>
      <section className="space-y-2 border-t border-white/10 pt-3">
        <h3 className="font-semibold">Crew traverse assumptions</h3>
        <label className="block">Science objective<textarea aria-label="Science objective" maxLength={200} value={crew.objective} onChange={e => update('objective', e.target.value)} className="mt-1 w-full rounded bg-neutral-800 p-2" /></label>
        <fieldset className="space-y-2 rounded border border-white/15 p-2">
          <legend className="px-1 font-medium">Automatic task vehicle</legend>
          {([['high_physical_risk', 'High physical risk'], ['strict_contamination', 'Strict contamination limits'], ['repetitive_work', 'Tedious / repetitive work']] as const).map(([key, label]) => <label key={key} className="flex gap-2"><input type="checkbox" checked={crew[key]} onChange={e => update(key, e.target.checked)} />{label}</label>)}
          <p className="text-neutral-400">Any checked condition, or a severe/over-limit route hazard, assigns the rover. Otherwise use the Space Exploration Vehicle. Recalculate after changes.</p>
          <p className="text-neutral-400">Three astronauts travel aboard the SEV, exit at a terrain-based staging candidate, then approach on foot or hold while the rover deploys. Contamination is a task constraint, not a claim that the rover is sterile.</p>
        </fieldset>
        <p className="text-neutral-400">Start = departure/return point; destination = candidate science station. Defaults are illustrative scenario inputs, not NASA suit limits.</p>
        <label className="flex items-center justify-between gap-2">Maximum regional slope (°)<input aria-label="Crew slope limit" type="number" min={1} max={45} value={slope} onChange={e => { const value = Number(e.target.value); if (value >= 1 && value <= 45) setSlope(value) }} className="w-16 rounded bg-neutral-800 p-1" /></label>
        {fields.map(f => <label key={f.key} className="flex items-center justify-between gap-2">{f.label}<input aria-label={f.label} type="number" min={f.min} max={f.max} step={f.step} value={crew[f.key]} onChange={e => { const value = Number(e.target.value); if (Number.isFinite(value) && value >= f.min && value <= f.max) update(f.key, value) }} className="w-16 rounded bg-neutral-800 p-1" /></label>)}
        <button disabled={!route || working || phase === 'simulating' || !crew.objective.trim()} onClick={() => void command('replan_crew_route')} className="rounded border border-cyan-300/30 px-3 py-2 disabled:opacity-40">Recalculate selected crew route</button>
        <p className="text-neutral-400">Changes apply to the next calculation. Round trip = twice outbound travel + science stop + reserve; suit/equipment allowance increases travel time.</p>
      </section>
      <p className="rounded border border-amber-300/30 bg-amber-400/5 p-2 text-amber-100">Assessment gaps: local rocks/cliffs, soil traction, radiation, suit consumables and forecast weather are not modeled. A compliant regional slope and time budget do not establish EVA safety.</p>
    </div>
  </FloatingPanel>
}
