import type { RouteData } from '../store/appStore'
import ElevationProfileChart from './ElevationProfileChart'

function stat(value: number, suffix = '') {
  return `${Math.round(value).toLocaleString()}${suffix}`
}

export default function RoutePanel({ route }: { route: RouteData }) {
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
            route.slope_compliant
              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
              : 'border-amber-400/30 bg-amber-400/10 text-amber-300'
          }`}
        >
          {route.slope_compliant ? 'Within limit' : 'Over limit'}
        </span>
      </header>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-md bg-white/[0.04] px-2.5 py-2">
          <dt className="text-[10px] uppercase tracking-wider text-neutral-500">
            Distance
          </dt>
          <dd className="mt-0.5 font-medium text-neutral-100">
            {route.distance_km.toFixed(1)} km
          </dd>
        </div>
        <div className="rounded-md bg-white/[0.04] px-2.5 py-2">
          <dt className="text-[10px] uppercase tracking-wider text-neutral-500">
            Ascent
          </dt>
          <dd className="mt-0.5 font-medium text-neutral-100">
            {stat(route.ascent_m, ' m')}
          </dd>
        </div>
        <div className="rounded-md bg-white/[0.04] px-2.5 py-2">
          <dt className="text-[10px] uppercase tracking-wider text-neutral-500">
            Descent
          </dt>
          <dd className="mt-0.5 font-medium text-neutral-100">
            {stat(route.descent_m, ' m')}
          </dd>
        </div>
        <div className="rounded-md bg-white/[0.04] px-2.5 py-2">
          <dt className="text-[10px] uppercase tracking-wider text-neutral-500">
            Max grade
          </dt>
          <dd className="mt-0.5 font-medium text-neutral-100">
            {route.max_grade_deg.toFixed(1)}°
          </dd>
        </div>
        <div className="rounded-md bg-white/[0.04] px-2.5 py-2">
          <dt className="text-[10px] uppercase tracking-wider text-neutral-500">
            Mean grade
          </dt>
          <dd className="mt-0.5 font-medium text-neutral-100">
            {route.mean_grade_deg.toFixed(1)}°
          </dd>
        </div>
        <div className="rounded-md bg-white/[0.04] px-2.5 py-2">
          <dt className="text-[10px] uppercase tracking-wider text-neutral-500">
            Scout ETA
          </dt>
          <dd className="mt-0.5 font-medium text-neutral-100">
            {route.eta_hours.toFixed(1)} h
          </dd>
        </div>
      </dl>

      <div className="mt-3">
        <ElevationProfileChart route={route} />
      </div>

      <div className="mt-2 space-y-1 text-[10px] leading-relaxed text-neutral-500">
        {route.note ? <p>{route.note}</p> : null}
        {route.eta_note ? <p>{route.eta_note}</p> : null}
        {route.resolution_note ? <p>{route.resolution_note}</p> : null}
        {route.source_url ? (
          <a
            href={route.source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-orange-300/80 underline-offset-2 hover:text-orange-200 hover:underline"
          >
            Source: NASA MOLA 16 ppd
          </a>
        ) : null}
      </div>
    </section>
  )
}
