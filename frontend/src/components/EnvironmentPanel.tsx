import { useEffect, useMemo } from 'react'
import {
  ENVIRONMENT_CHIP,
  ENVIRONMENT_COLORS,
  ENVIRONMENT_LABELS,
  ENVIRONMENT_LEVELS,
} from '../store/environmentMeta'
import {
  useEnvironmentStore,
  type EnvironmentLevel,
  type EnvironmentZone,
} from '../store/environmentStore'

function Chip({ level }: { level: EnvironmentLevel }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${ENVIRONMENT_CHIP[level]}`}
    >
      {ENVIRONMENT_LABELS[level]}
    </span>
  )
}

function ZoneButton({
  zone,
  selected,
  onSelect,
}: {
  zone: EnvironmentZone
  selected: boolean
  onSelect: () => void
}) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={`w-full rounded border px-2 py-1.5 text-left transition ${
          selected
            ? 'border-white/30 bg-white/[0.08]'
            : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]'
        }`}
      >
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: ENVIRONMENT_COLORS[zone.classification] }}
          />
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-neutral-100">
            {zone.name}
          </span>
          <Chip level={zone.classification} />
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 pl-3.5 text-[9px] text-neutral-500">
          <span>weather {zone.weather.classification}</span>
          <span aria-hidden="true">·</span>
          <span>radiation {zone.radiation.classification}</span>
          {zone.science_value === 'high' ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-cyan-300/80">high science</span>
            </>
          ) : null}
        </span>
      </button>
    </li>
  )
}

function SelectedZone({ zone }: { zone: EnvironmentZone }) {
  return (
    <section aria-label="Selected region screening" className="mt-3 rounded border border-white/15 bg-black/30 p-2.5">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-xs font-semibold text-white">{zone.name}</h3>
          <p className="text-[9px] uppercase tracking-wider text-neutral-500">
            Regional screening · derived
          </p>
        </div>
        <Chip level={zone.classification} />
      </header>

      <p className="mt-1.5 text-[11px] italic leading-snug text-neutral-300">
        {zone.scenic}
      </p>

      <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px]">
        <div className="rounded border border-white/10 bg-white/[0.03] p-1.5">
          <p className="text-[8px] uppercase tracking-wider text-neutral-500">Weather</p>
          <div className="mt-0.5 flex items-center gap-1">
            <Chip level={zone.weather.classification} />
            <span className="text-neutral-300">
              {Math.round(zone.weather.min_temp_c)}…{Math.round(zone.weather.max_temp_c)} °C
            </span>
          </div>
          <p className="mt-0.5 text-neutral-500">dust index {zone.weather.dust_index.toFixed(2)}</p>
        </div>
        <div className="rounded border border-white/10 bg-white/[0.03] p-1.5">
          <p className="text-[8px] uppercase tracking-wider text-neutral-500">Radiation</p>
          <div className="mt-0.5 flex items-center gap-1">
            <Chip level={zone.radiation.classification} />
            <span className="text-neutral-300">
              {zone.radiation.surface_dose_msv_day.toFixed(2)} mSv/day
            </span>
          </div>
          <p className="mt-0.5 text-neutral-500">derived surface dose</p>
        </div>
      </div>

      <dl className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
        <div className="flex justify-between gap-2">
          <dt className="text-neutral-500">Science</dt>
          <dd className="text-neutral-200">{zone.science_value}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-neutral-500">Elevation</dt>
          <dd className="text-neutral-200">{zone.elevation_m.toLocaleString()} m</dd>
        </div>
      </dl>

      <div className="mt-2 space-y-1 border-t border-white/10 pt-1.5 text-[9px] leading-relaxed text-neutral-500">
        <p>{zone.weather.note}</p>
        <p>{zone.radiation.note}</p>
        <p>{zone.note}</p>
      </div>
      <a
        href={zone.source_url}
        target="_blank"
        rel="noreferrer"
        className="mt-1 inline-block text-[9px] text-cyan-300 underline decoration-cyan-300/40"
      >
        NASA source
      </a>
    </section>
  )
}

/**
 * Regional weather + radiation screening. Areas are classified safe, caution
 * or unsafe from derived weather and radiation estimates; scenic value and
 * science value are shown alongside so a safe-but-beautiful stop is visible.
 * Every number here is derived and labelled, not a measured dose or forecast.
 */
export default function EnvironmentPanel() {
  const zones = useEnvironmentStore((state) => state.zones)
  const loading = useEnvironmentStore((state) => state.loading)
  const error = useEnvironmentStore((state) => state.error)
  const note = useEnvironmentStore((state) => state.note)
  const radiationSourceUrl = useEnvironmentStore((state) => state.radiationSourceUrl)
  const weatherSourceUrl = useEnvironmentStore((state) => state.weatherSourceUrl)
  const selectedId = useEnvironmentStore((state) => state.selectedId)
  const select = useEnvironmentStore((state) => state.select)
  const load = useEnvironmentStore((state) => state.load)

  useEffect(() => {
    void load()
  }, [load])

  const counts = useMemo(() => {
    const byLevel: Record<EnvironmentLevel, number> = { safe: 0, caution: 0, unsafe: 0 }
    for (const zone of zones) byLevel[zone.classification] += 1
    return byLevel
  }, [zones])

  const selected = zones.find((zone) => zone.id === selectedId) ?? null

  return (
    <aside className="p-3">
      <div className="flex flex-wrap items-center gap-2">
        {ENVIRONMENT_LEVELS.map((level) => (
          <span key={level} className="flex items-center gap-1">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: ENVIRONMENT_COLORS[level] }}
            />
            <span className="text-[10px] text-neutral-300">
              {ENVIRONMENT_LABELS[level]}
            </span>
            <span className="text-[9px] text-neutral-500">({counts[level]})</span>
          </span>
        ))}
      </div>

      <p className="mt-1.5 text-[9px] leading-relaxed text-neutral-500">
        {note || 'Regional weather + radiation screening. Derived planning aid, not a measured dose or dust forecast.'}
      </p>

      {loading && !zones.length ? (
        <p role="status" className="mt-2 text-[11px] text-neutral-400">
          Loading regional screening…
        </p>
      ) : null}
      {error ? (
        <div role="alert" className="mt-2 rounded border border-red-400/30 bg-red-500/10 p-2 text-[10px] text-red-200">
          Screening unavailable ({error}).
          <button
            type="button"
            onClick={() => void load(true)}
            className="ml-2 rounded border border-red-300/40 px-1.5 py-0.5"
          >
            Retry
          </button>
        </div>
      ) : null}

      {zones.length ? (
        <div className="mt-2 space-y-2">
          {ENVIRONMENT_LEVELS.map((level) => {
            const group = zones.filter((zone) => zone.classification === level)
            if (!group.length) return null
            return (
              <div key={level}>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">
                  {ENVIRONMENT_LABELS[level]} · {group.length}
                </p>
                <ul className="mt-1 space-y-1">
                  {group.map((zone) => (
                    <ZoneButton
                      key={zone.id}
                      zone={zone}
                      selected={zone.id === selectedId}
                      onSelect={() => select(zone.id === selectedId ? null : zone.id)}
                    />
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      ) : null}

      {selected ? <SelectedZone zone={selected} /> : null}

      {zones.length ? (
        <p className="mt-2 border-t border-white/10 pt-1.5 text-[8px] leading-relaxed text-neutral-600">
          Radiation basis:{' '}
          <a
            href={radiationSourceUrl}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-neutral-600"
          >
            Curiosity RAD
          </a>{' '}
          · weather basis:{' '}
          <a
            href={weatherSourceUrl}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-neutral-600"
          >
            REMS
          </a>
          . Terrain/slope safety is assessed separately by the route planner.
        </p>
      ) : null}
    </aside>
  )
}
