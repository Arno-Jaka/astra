import type { BriefingData } from '../store/appStore'

function retrieved(iso: string) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

export default function SurvivalBriefingPanel({
  briefing,
}: {
  briefing: BriefingData
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-black/65 p-4 shadow-2xl backdrop-blur-xl">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-orange-300/80">
            Survival briefing
          </p>
          <h2 className="text-base font-semibold text-white">
            {briefing.location}
          </h2>
          <p className="text-[11px] text-neutral-400">{briefing.headline}</p>
        </div>
        <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-1 text-[10px] uppercase tracking-wider text-sky-300">
          Curated
        </span>
      </header>

      <p className="mt-3 text-xs leading-relaxed text-neutral-300">
        {briefing.summary}
      </p>

      <div className="mt-3">
        <h3 className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
          Why it matters
        </h3>
        <ul className="mt-1 space-y-1 text-[11px] leading-relaxed text-neutral-300">
          {briefing.why_it_matters.map((reason) => (
            <li key={reason} className="flex gap-2">
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-sky-300" />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3">
        <h3 className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
          Hazards
        </h3>
        <div className="mt-1 space-y-2">
          {briefing.hazards.map((hazard) => (
            <div
              key={hazard.label}
              className="rounded-md border border-amber-400/10 bg-amber-400/[0.05] px-2.5 py-2"
            >
              <p className="text-[11px] font-medium text-amber-200">
                {hazard.label}
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-400">
                {hazard.detail}
              </p>
              <a
                href={hazard.source_url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-[10px] text-amber-300/70 underline-offset-2 hover:text-amber-200 hover:underline"
              >
                Source
              </a>
            </div>
          ))}
        </div>
      </div>

      <details className="mt-3" open>
        <summary className="cursor-pointer text-[10px] uppercase tracking-[0.18em] text-neutral-500">
          Science targets ({briefing.science_targets.length})
        </summary>
        <ul className="mt-1 space-y-2">
          {briefing.science_targets.map((target) => (
            <li key={target.name} className="text-[11px] leading-relaxed">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-neutral-200">
                  {target.name}
                </span>
                <span className="shrink-0 text-[10px] text-neutral-500">
                  {target.kind}
                </span>
              </div>
              <p className="text-neutral-400">{target.note}</p>
              <a
                href={target.source_url}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-orange-300/70 underline-offset-2 hover:text-orange-200 hover:underline"
              >
                NASA source
              </a>
            </li>
          ))}
        </ul>
      </details>

      {briefing.landing ? (
        <p className="mt-3 border-t border-white/10 pt-2 text-[10px] text-neutral-500">
          Landing marker: {briefing.landing.name}
        </p>
      ) : null}

      <footer className="mt-2 space-y-1 text-[10px] leading-relaxed text-neutral-500">
        <p>{briefing.data_quality}</p>
        <p>Retrieved {retrieved(briefing.retrieved_at)}</p>
        <a
          href={briefing.source_url}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-orange-300/80 underline-offset-2 hover:text-orange-200 hover:underline"
        >
          Source: NASA mission overview
        </a>
      </footer>
    </section>
  )
}
