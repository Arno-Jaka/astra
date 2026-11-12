import { useDriveStore } from '../store/driveStore'
import FloatingPanel from './FloatingPanel'

/** Game-style driving telemetry bar shown while the scout simulation runs. */
export default function DriveHud() {
  const active = useDriveStore((state) => state.active)
  const vehicle = useDriveStore(state => state.vehicle)
  const missionPhase = useDriveStore(state => state.missionPhase)
  const onFoot = missionPhase === 'crew-approach' || missionPhase === 'disembarking'
  const jump = useDriveStore(state => state.jump)
  const vehicleName = onFoot ? 'Crew of 3 · Mars surface' : vehicle === 'sev' ? 'Space Exploration Vehicle' : 'Robotic rover'
  const distanceKm = useDriveStore((state) => state.distanceKm)
  const totalKm = useDriveStore((state) => state.totalKm)
  const gradeDeg = useDriveStore((state) => state.gradeDeg)
  const elevationM = useDriveStore((state) => state.elevationM)
  const headingDeg = useDriveStore((state) => state.headingDeg)
  const speedMult = useDriveStore((state) => state.speedMult)
  const paused = useDriveStore((state) => state.paused)
  const braking = useDriveStore((state) => state.braking)
  const stopping = useDriveStore((state) => state.stopRequested)
  const arriving = useDriveStore((state) => state.arriving)
  const triggerJet = useDriveStore((state) => state.triggerJet)
  const limitDeg = useDriveStore((state) => state.limitDeg)
  const warning = useDriveStore((state) => state.warning)
  const crash = useDriveStore((state) => state.crash)
  const loading = useDriveStore((state) => state.loading)
  const speedMps = useDriveStore((state) => state.speedMps)
  const travelMode = useDriveStore((state) => state.travelMode)
  const timeScale = useDriveStore((state) => state.timeScale)
  const setTravelMode = useDriveStore((state) => state.setTravelMode)
  const togglePause = useDriveStore((state) => state.togglePause)
  const setSpeed = useDriveStore((state) => state.setSpeed)
  const stop = useDriveStore((state) => state.stop)
  if (!active) return null

  const progress = totalKm > 0 ? Math.min(100, (distanceKm / totalKm) * 100) : 0

  return (
    <FloatingPanel id="drive" title={vehicleName} width={600} initial={{ left: 'calc(50% - 300px)', bottom: 20 }}>
    <div className="p-2 text-sm [&_p]:text-xs [&_select]:text-sm [&_button]:text-sm">
      {crash ? (
        <div className="mb-1.5 rounded-lg border border-red-500/50 bg-red-950/85 px-3 py-2 text-center text-[11px] font-medium text-red-200 shadow-2xl backdrop-blur-xl">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-red-400">
            Scout lost ·{' '}
            {crash.type === 'jet' ? 'CO₂ jet drill' : crash.type === 'fall' ? 'fall' : 'rollover'}
          </span>
          <span className="ml-1.5">{crash.detail}</span>
        </div>
      ) : warning ? (
        <div className="mb-1.5 rounded-lg border border-amber-400/50 bg-amber-950/85 px-3 py-2 text-center text-[11px] font-medium text-amber-200 shadow-2xl backdrop-blur-xl">
          ⚠ {warning}
        </div>
      ) : null}
      <div className="rounded-xl border border-white/10 bg-black/65 px-4 py-2.5 shadow-2xl backdrop-blur-xl">
        <p className="mb-2 text-[10px] uppercase tracking-widest text-cyan-200" role="status">
          {loading ? `Preparing terrain & ${vehicleName}…` : crash ? 'Rover failure · simulated dynamics' : braking ? stopping ? 'Braking · ending traverse' : 'Braking · pausing' : paused ? `${vehicleName} · paused` : arriving ? 'Approaching destination · decelerating' : `${vehicleName} · following route`}
        </p>
        <p className="mb-2 text-cyan-200">{missionPhase === 'aboard' ? '3 crew aboard · driving to staging' : missionPhase === 'disembarking' ? 'Finn, Rae & Fernando · exiting SEV' : missionPhase === 'crew-approach' ? 'Crew final approach · SEV parked' : missionPhase === 'rover-approach' ? 'Rover deployed · 3 crew hold at SEV' : missionPhase}</p>
        <div className="flex items-baseline justify-between font-mono text-sm tabular-nums text-neutral-200">
          <span>
            {distanceKm.toFixed(3)}
            <span className="text-neutral-500"> / {totalKm.toFixed(1)} km</span>
          </span>
          <span
            className={
              paused ? 'text-amber-300' : 'text-cyan-300'
            }
          >
            {speedMps.toFixed(2)} m/s · {(speedMult * timeScale).toFixed(timeScale > 1 ? 0 : 2)}× time
          </span>
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-300 transition-[width] duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-baseline justify-between font-mono text-xs tabular-nums text-neutral-400">
          <span>
            grade{' '}
            <span
              className={
                Math.abs(gradeDeg) > Math.max(limitDeg, 12)
                  ? 'text-red-300'
                  : Math.abs(gradeDeg) > 10
                    ? 'text-amber-300'
                    : 'text-neutral-200'
              }
            >
              {gradeDeg > 0 ? '+' : ''}
              {gradeDeg.toFixed(1)}°
            </span>
          </span>
          <span>
            elev{' '}
            <span className="text-neutral-200">
              {Math.round(elevationM).toLocaleString()} m
            </span>
          </span>
          <span>
            hdg{' '}
            <span className="text-neutral-200">
              {Math.round(headingDeg)
                .toString()
                .padStart(3, '0')}
              °
            </span>
          </span>
        </div>
        <div className="pointer-events-auto mt-3 flex items-center gap-2 text-[11px] text-neutral-300">
          <label htmlFor="scout-travel-mode">Travel</label>
          <select id="scout-travel-mode" value={travelMode} disabled={onFoot || loading || braking || stopping || !!crash} onChange={(event) => setTravelMode(event.target.value as 'preview' | 'realtime')} className="min-w-0 flex-1 rounded bg-neutral-900 p-1.5">
            <option value="preview">Fast traverse · time-compressed</option>
            <option value="realtime">Real-time · close terrain inspection</option>
          </select>
        </div>
        {missionPhase === 'crew-approach' && <button type="button" onClick={jump} disabled={paused || stopping} className="mt-2 rounded border border-cyan-300/40 px-3 py-1.5 text-cyan-200 disabled:opacity-40">Crew hop · Mars gravity</button>}
        <div className="pointer-events-auto mt-2 flex items-center justify-between gap-2 text-[11px]">
          <button type="button" onClick={togglePause} disabled={loading || stopping || !!crash} className="rounded border border-white/20 px-3 py-1.5 text-white disabled:opacity-40">
            {paused ? 'Resume' : 'Pause'}
          </button>
          <label className="flex items-center gap-2 text-neutral-300">
            Playback
            <select aria-label="Simulation playback speed" value={speedMult} disabled={loading || braking || stopping || !!crash} onChange={(event) => setSpeed(Number(event.target.value))} className="rounded bg-neutral-900 p-1.5">
              {[...new Set([0.25, 0.5, 1, 2, 4, speedMult])].sort((a, b) => a - b).map((speed) => <option key={speed} value={speed}>{speed.toFixed(2)}×</option>)}
            </select>
          </label>
          <button type="button" onClick={stop} disabled={stopping} className="rounded border border-amber-300/40 px-3 py-1.5 text-amber-200 disabled:opacity-50">{stopping ? 'Stopping…' : 'Stop'}</button>
        </div>
        {vehicle === 'rover' && <details className="pointer-events-auto mt-3 border-t border-white/10 pt-2 text-xs text-neutral-400">
          <summary className="cursor-pointer">Optional hazard training · CO₂ jet</summary>
          <p className="mt-2">NASA observes seasonal CO₂ jets at the south pole. No jets are identified along this route. The launch impulse and vehicle response below are hypothetical training.</p>
          <a href="https://images.nasa.gov/details/PIA22587" target="_blank" rel="noreferrer" className="text-cyan-300 underline">NASA MRO / HiRISE · PIA22587</a>
          <button type="button" disabled={loading || !!crash || stopping} onClick={triggerJet} className="ml-3 rounded border border-amber-400/40 px-3 py-2 text-amber-200 disabled:opacity-40">Trigger jet drill</button>
        </details>}
        <p className="mt-2 text-[9px] text-neutral-400">NASA MOLA hills · illustrative texture, dust, trails & vehicle dynamics</p>
      </div>
      <p className="mt-1 text-center text-[9px] uppercase tracking-[0.18em] text-neutral-500">
        drag orbit · scroll zoom · ↑↓ speed · space pause · C camera · esc end
      </p>
    </div>
    </FloatingPanel>
  )
}
