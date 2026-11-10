import type { ConditionsData } from '../store/appStore'

function value(number: number | null | undefined, suffix = '') {
  if (number === null || number === undefined) return '—'
  return `${Math.round(number)}${suffix}`
}

function retrieved(iso: string) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

export default function ConditionsCard({
  conditions,
}: {
  conditions: ConditionsData
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-black/65 p-4 shadow-2xl backdrop-blur-xl">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-orange-300/80">
            Live conditions
          </p>
          <h2 className="text-base font-semibold text-white">
            {conditions.requested_location}
          </h2>
          <p className="text-[11px] text-neutral-500">
            Sol {conditions.sol} · {conditions.terrestrial_date ?? 'date unknown'}
            {conditions.season ? ` · ${conditions.season}` : ''}
          </p>
        </div>
        <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[10px] uppercase tracking-wider text-emerald-300">
          REMS
        </span>
      </header>

      {conditions.is_nearest_station ? (
        <p className="mt-3 rounded-md border border-amber-400/20 bg-amber-400/10 px-2.5 py-2 text-[11px] leading-relaxed text-amber-200">
          No live station at {conditions.requested_location}. Using{' '}
          {conditions.station_location}
          {conditions.distance_km ? ` (~${conditions.distance_km} km away)` : ''}.
        </p>
      ) : null}

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md bg-white/[0.04] px-2.5 py-2">
          <dt className="text-[10px] uppercase tracking-wider text-neutral-500">
            Air temp
          </dt>
          <dd className="mt-0.5 font-medium text-neutral-100">
            {value(conditions.min_temp_c)} / {value(conditions.max_temp_c, ' °C')}
          </dd>
        </div>
        <div className="rounded-md bg-white/[0.04] px-2.5 py-2">
          <dt className="text-[10px] uppercase tracking-wider text-neutral-500">
            Ground temp
          </dt>
          <dd className="mt-0.5 font-medium text-neutral-100">
            {value(conditions.min_ground_temp_c)} /{' '}
            {value(conditions.max_ground_temp_c, ' °C')}
          </dd>
        </div>
        <div className="rounded-md bg-white/[0.04] px-2.5 py-2">
          <dt className="text-[10px] uppercase tracking-wider text-neutral-500">
            Pressure
          </dt>
          <dd className="mt-0.5 font-medium text-neutral-100">
            {value(conditions.pressure_pa, ' Pa')}
          </dd>
        </div>
        <div className="rounded-md bg-white/[0.04] px-2.5 py-2">
          <dt className="text-[10px] uppercase tracking-wider text-neutral-500">
            Opacity
          </dt>
          <dd className="mt-0.5 font-medium text-neutral-100">
            {conditions.atmo_opacity ?? '—'}
          </dd>
        </div>
        <div className="rounded-md bg-white/[0.04] px-2.5 py-2">
          <dt className="text-[10px] uppercase tracking-wider text-neutral-500">
            UV index
          </dt>
          <dd className="mt-0.5 font-medium text-neutral-100">
            {conditions.uv_index ?? '—'}
          </dd>
        </div>
        <div className="rounded-md bg-white/[0.04] px-2.5 py-2">
          <dt className="text-[10px] uppercase tracking-wider text-neutral-500">
            Sunrise / sunset
          </dt>
          <dd className="mt-0.5 font-medium text-neutral-100">
            {conditions.sunrise ?? '—'} / {conditions.sunset ?? '—'}
          </dd>
        </div>
      </dl>

      <footer className="mt-3 border-t border-white/10 pt-2 text-[10px] leading-relaxed text-neutral-500">
        <p>
          {conditions.station} · retrieved {retrieved(conditions.retrieved_at)}
        </p>
        {conditions.data_note ? <p>{conditions.data_note}</p> : null}
        <a
          href={conditions.source_url}
          target="_blank"
          rel="noreferrer"
          className="text-orange-300/80 underline-offset-2 hover:text-orange-200 hover:underline"
        >
          Source: NASA/JPL REMS feed
        </a>
      </footer>
    </section>
  )
}
