import { sampleRoute } from '../map/routePath'
import { useAppStore } from '../store/appStore'
import type { RouteData, RouteDanger } from '../store/appStore'
import { useDriveStore } from '../store/driveStore'
import ElevationProfileChart from './ElevationProfileChart'

function stat(value: number, suffix = '') {
  return `${Math.round(value).toLocaleString()}${suffix}`
}

const DANGER_DOT: Record<RouteDanger['type'], string> = {
  steep: 'bg-yellow-400',
  rollover: 'bg-orange-500',
  cliff: 'bg-red-500',
}

export default function RoutePanel({ route }: { route: RouteData }) {
  const phase = useAppStore((state) => state.routePhase)
  const previewT = useAppStore((state) => state.previewT)
  const setPreviewT = useAppStore((state) => state.setPreviewT)
  const setRoutePhase = useAppStore((state) => state.setRoutePhase)
  const routeChoice = useAppStore((state) => state.routeChoice)
  const setRouteChoice = useAppStore((state) => state.setRouteChoice)
  const stopDrive = useDriveStore((state) => state.stop)
  const stopping = useDriveStore((state) => state.stopRequested)
  const crash = useDriveStore((state) => state.crash)

  // Everything below reflects the selected traverse: the safe (planner)
  // route by default, the hazardous direct route for comparison.
  const hazardous =
    routeChoice === 'hazardous' && route.hazardous ? route.hazardous : null
  const selected = hazardous ?? route
  const dangers = hazardous ? hazardous.dangers : (route.dangers ?? [])

  const sample = sampleRoute(selected, previewT)
  const headingDeg = Math.round(
    (((sample.bearing * 180) / Math.PI + 360) % 360),
  )

  return (
    <section className="rounded-xl border border-white/10 bg-black/65 p-4 shadow-2xl backdrop-blur-xl">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-orange-300/80">
            Traverse plan
          </p>
          <h2 className="text-sm font-semibold text-white">
            {route.start} <span className="text-orange-300">→</span> {route.end}
          </h2>
          <p className="text-[11px] text-neutral-500">
            Slope limit {route.slope_limit_deg}°
          </p>
        </div>
        <span
          className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-wider ${
            hazardous
              ? 'border-red-400/30 bg-red-400/10 text-red-300'
              : route.slope_compliant
                ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                : 'border-amber-400/30 bg-amber-400/10 text-amber-300'
          }`}
        >
          {hazardous
            ? 'Hazardous'
            : route.slope_compliant
              ? 'Within limit'
              : 'Over limit'}
        </span>
      </header>

      {route.hazardous ? (
        <div
          className="mt-3 grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1 text-[11px]"
          role="group"
          aria-label="Route comparison"
        >
          <button
            type="button"
            onClick={() => setRouteChoice('safe')}
            disabled={phase === 'simulating'}
            className={`rounded-md px-2 py-1.5 font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
              !hazardous
                ? 'bg-emerald-400/20 text-emerald-200'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Safe route · {route.distance_km.toFixed(1)} km
          </button>
          <button
            type="button"
            onClick={() => setRouteChoice('hazardous')}
            disabled={phase === 'simulating'}
            className={`rounded-md px-2 py-1.5 font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
              hazardous
                ? 'bg-red-400/20 text-red-200'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Direct · {route.hazardous.distance_km.toFixed(1)} km ·{' '}
            {route.hazardous.dangers.length} danger zone
            {route.hazardous.dangers.length === 1 ? '' : 's'}
          </button>
        </div>
      ) : null}

      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-md bg-white/[0.04] px-2.5 py-2">
          <dt className="text-[10px] uppercase tracking-wider text-neutral-500">
            Distance
          </dt>
          <dd className="mt-0.5 font-medium text-neutral-100">
            {selected.distance_km.toFixed(1)} km
          </dd>
        </div>
        <div className="rounded-md bg-white/[0.04] px-2.5 py-2">
          <dt className="text-[10px] uppercase tracking-wider text-neutral-500">
            Ascent
          </dt>
          <dd className="mt-0.5 font-medium text-neutral-100">
            {stat(selected.ascent_m, ' m')}
          </dd>
        </div>
        <div className="rounded-md bg-white/[0.04] px-2.5 py-2">
          <dt className="text-[10px] uppercase tracking-wider text-neutral-500">
            Descent
          </dt>
          <dd className="mt-0.5 font-medium text-neutral-100">
            {stat(selected.descent_m, ' m')}
          </dd>
        </div>
        <div className="rounded-md bg-white/[0.04] px-2.5 py-2">
          <dt className="text-[10px] uppercase tracking-wider text-neutral-500">
            Max grade
          </dt>
          <dd
            className={`mt-0.5 font-medium ${
              selected.max_grade_deg > route.slope_limit_deg
                ? 'text-red-300'
                : 'text-neutral-100'
            }`}
          >
            {selected.max_grade_deg.toFixed(1)}°
          </dd>
        </div>
        <div className="rounded-md bg-white/[0.04] px-2.5 py-2">
          <dt className="text-[10px] uppercase tracking-wider text-neutral-500">
            Mean grade
          </dt>
          <dd className="mt-0.5 font-medium text-neutral-100">
            {selected.mean_grade_deg.toFixed(1)}°
          </dd>
        </div>
        <div className="rounded-md bg-white/[0.04] px-2.5 py-2">
          <dt className="text-[10px] uppercase tracking-wider text-neutral-500">
            Scout ETA
          </dt>
          <dd className="mt-0.5 font-medium text-neutral-100">
            {hazardous ? '—' : `${route.eta_hours.toFixed(1)} h`}
          </dd>
        </div>
      </dl>

      <section className="mt-3 rounded-lg border border-cyan-400/25 bg-cyan-400/[0.05] px-3 pb-2.5 pt-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/90">
            Traceroute preview
          </p>
          {phase === 'simulating' ? (
            <button
              type="button"
              onClick={stopDrive}
              disabled={stopping}
              className="rounded-md border border-amber-400/40 bg-amber-400/15 px-2.5 py-1 text-[11px] font-medium text-amber-200 transition hover:bg-amber-400/25"
            >
              {stopping ? 'Braking…' : '■ Stop scout'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setRoutePhase('simulating')}
              className="rounded-md border border-cyan-400/40 bg-cyan-400/15 px-2.5 py-1 text-[11px] font-medium text-cyan-200 transition hover:bg-cyan-400/25"
            >
              ▶ {previewT > 0 && previewT < 1 ? 'Drive from here' : 'Start scout'}
            </button>
          )}
        </div>
        <input
          type="range"
          min={0}
          max={1000}
          step={1}
          value={Math.round(previewT * 1000)}
          onChange={(event) => setPreviewT(Number(event.target.value) / 1000)}
          disabled={phase === 'simulating'}
          aria-label="Position along the route"
          className="mt-2 w-full accent-cyan-400"
        />
        <div className="mt-1 flex items-center justify-between text-[11px] text-neutral-400">
          <span className="font-medium text-neutral-200">
            {sample.distanceKm.toFixed(1)} km ·{' '}
            {Math.round(sample.elevationM).toLocaleString()} m ·{' '}
            {sample.gradeDeg.toFixed(1)}° grade
          </span>
          <span>heading {headingDeg}°</span>
        </div>
      </section>

      <p className="mt-2 text-[10px] text-neutral-400">Fast traverse by default · roughly 90 seconds on flat terrain at 1× playback, longer on slopes. Switch to Real-time in the driving HUD for close terrain inspection.</p>

      <div className="mt-3">
        <ElevationProfileChart
          traverse={selected}
          dangers={dangers}
          previewT={previewT}
        />
      </div>

      {crash ? (
        <div className="mt-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] leading-relaxed text-red-200">
          <span className="font-semibold uppercase tracking-wider text-red-300">
            Scout lost · {crash.type === 'jet' ? 'training jet' : crash.type === 'fall' ? 'fall' : 'rollover'}
          </span>
          <span className="ml-2">{crash.detail}</span>
          {route.hazardous && crash.type !== 'jet' ? (
            <p className="mt-1 text-red-300/80">
              The planner's safe route avoids this danger zone.
            </p>
          ) : null}
        </div>
      ) : null}

      <section className="mt-2">
        <p className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">
          Danger zones · {hazardous ? 'direct route' : 'safe route'}
        </p>
        {dangers.length > 0 ? (
          <ul className="mt-1.5 space-y-1">
            {dangers.map((zone) => (
              <li
                key={`${zone.type}-${zone.distance_km}`}
                className="flex items-start gap-2 text-[11px] leading-snug text-neutral-300"
              >
                <span
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${DANGER_DOT[zone.type]}`}
                  aria-hidden="true"
                />
                <span>
                  km {zone.distance_km.toFixed(1)} — {zone.label}
                  <span className="block font-medium text-orange-200">
                    {zone.type === 'cliff' ? 'Critical · fall / impact' : zone.type === 'rollover' ? 'High · rollover / loss of traction' : 'Moderate · wheel slip'}
                    {' · peak '}{zone.max_grade_deg.toFixed(1)}° · {zone.span_km.toFixed(2)} km zone
                  </span>
                  {zone.over_limit ? (
                    <span className="text-red-400">
                      {' '}
                      · over the {route.slope_limit_deg}° limit
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-[11px] text-emerald-300/80">
            No danger zones above the 10° steep-grade threshold.
          </p>
        )}
      </section>

      <div className="mt-2 space-y-1 text-[10px] leading-relaxed text-neutral-500">
        <p>MOLA-derived slope hazards only. Geysers, loose soil and small obstacles cannot be inferred from this DEM. CO₂ jet training is hypothetical and separate from this route assessment.</p>
        {route.note ? <p>{route.note}</p> : null}
        {route.hazard_note ? (
          <p className="text-amber-200/80">{route.hazard_note}</p>
        ) : null}
        {route.eta_note ? <p>{route.eta_note}</p> : null}
        {route.resolution_note ? <p>{route.resolution_note}</p> : null}
        {route.source_url ? (
          <a
            href={route.source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-orange-300/80 underline-offset-2 hover:text-orange-200 hover:underline"
          >
            Source: NASA MOLA (MGS)
          </a>
        ) : null}
      </div>
    </section>
  )
}
