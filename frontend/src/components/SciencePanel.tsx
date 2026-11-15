import { useMemo } from 'react'
import FloatingPanel from './FloatingPanel'
import { SCIENCE_META } from '../map/scienceExperiments'
import { distanceMeters, siteLabel, SCIENCE_NEARBY_M } from '../map/scienceSites'
import { useScienceStore, type SciencePhase } from '../store/scienceStore'

const PHASE_LABEL: Record<SciencePhase, string> = {
  off: 'No field stop',
  approach: 'SEV detouring to the science site',
  disembarking: 'Crew stepping out of the SEV',
  travelling: 'Crew walking to the target',
  working: 'Crew working on the experiment',
  done: 'Experiment complete',
  boarding: 'Crew returning to the SEV',
}

/** Field-science stop, nearby targets, work progress, and the downloadable log. */
export default function SciencePanel() {
  const sites = useScienceStore(state => state.sites)
  const activeSiteId = useScienceStore(state => state.activeSiteId)
  const phase = useScienceStore(state => state.phase)
  const canBoard = useScienceStore(state => state.canBoard)
  const workElapsed = useScienceStore(state => state.workElapsed)
  const workDuration = useScienceStore(state => state.workDuration)
  const logs = useScienceStore(state => state.logs)
  const requestMove = useScienceStore(state => state.requestMove)
  const requestBoard = useScienceStore(state => state.requestBoard)
  const downloadCsv = useScienceStore(state => state.downloadCsv)

  const active = sites.find(site => site.id === activeSiteId) ?? null
  const nearby = useMemo(
    () => active
      ? sites
          .filter(site =>
            site.id !== active.id &&
            !logs.some(entry => entry.siteId === site.id) &&
            distanceMeters(active, site) <= SCIENCE_NEARBY_M)
          .sort((a, b) => distanceMeters(active, a) - distanceMeters(active, b))
      : [],
    [active, sites, logs],
  )
  if (!active && logs.length === 0) return null

  const meta = active ? SCIENCE_META[active.kind] : null
  const duration = active && meta ? Math.max(0.5, workDuration || meta.durationS) : 0
  const progress = !active ? 0 : phase === 'done' ? 1 : Math.min(1, workElapsed / duration)
  const busy = phase === 'approach' || phase === 'disembarking' || phase === 'travelling' || phase === 'working' || phase === 'boarding'

  return (
    <FloatingPanel
      id="science"
      title={active ? 'Field science' : 'Field science log'}
      width={320}
      initial={{ left: 16, top: 140 }}
      avoidOverlap={false}
      maxHeight="calc(100dvh - 520px)"
    >
      {!active ? (
        <div className="p-3 text-xs text-neutral-300">
          <p className="text-[10px] uppercase tracking-widest text-cyan-200">{logs.length} experiment{logs.length === 1 ? '' : 's'} logged</p>
          <p className="mt-1 text-neutral-400">No active field stop. Detour prompts appear while driving the crew-safe traverse.</p>
          <button type="button" onClick={downloadCsv} className="mt-2 w-full rounded border border-cyan-300/40 px-3 py-1.5 text-cyan-200 hover:bg-cyan-300/10">
            Download field log (CSV)
          </button>
        </div>
      ) : (
        <div className="space-y-3 p-3 text-xs text-neutral-300">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-cyan-200">{meta!.category}</p>
            <p className="mt-0.5 text-sm font-semibold text-neutral-100">{meta!.label}</p>
            <p className="mt-0.5 text-[11px] text-neutral-400">{siteLabel(active)}</p>
            <p className="mt-1 text-[11px] leading-snug text-neutral-400">{meta!.blurb}</p>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-neutral-200">{PHASE_LABEL[phase]}</span>
              <span className={`rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wide ${active.safety === 'unsafe' ? 'border-red-400/40 text-red-200' : active.safety === 'caution' ? 'border-amber-400/40 text-amber-200' : 'border-emerald-400/40 text-emerald-200'}`}>
                {active.safety === 'unknown' ? 'unmapped' : active.safety}
              </span>
            </div>
            {phase === 'working' || phase === 'done' ? (
              <>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-300 transition-[width] duration-150" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
                <p className="mt-1 font-mono text-[10px] text-neutral-400">{Math.round(progress * 100)}% · {duration.toFixed(0)} s illustrative work</p>
              </>
            ) : (
              <p className="mt-1 text-[10px] text-neutral-500">{busy ? 'The vehicle stays parked until the crew return.' : 'Ready.'}</p>
            )}
          </div>

          <button
            type="button"
            onClick={requestBoard}
            disabled={!canBoard || phase === 'boarding'}
            className="w-full rounded border border-cyan-300/40 px-3 py-1.5 text-cyan-200 hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {phase === 'boarding' ? 'Crew boarding…' : 'Enter vehicle'}
          </button>
          {!canBoard && phase !== 'boarding' ? (
            <p className="text-center text-[10px] text-amber-200/80">Enter vehicle is available only after the current experiment is finished.</p>
          ) : null}

          <div className="border-t border-white/10 pt-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-widest text-neutral-400">Log · {logs.length}</span>
              <button type="button" onClick={downloadCsv} disabled={logs.length === 0} className="rounded border border-white/20 px-2 py-1 text-[10px] text-neutral-200 disabled:opacity-40">
                Download CSV
              </button>
            </div>
            {logs.length > 0 ? (
              <ul className="mt-1 space-y-1">
                {logs.slice(-3).reverse().map(entry => (
                  <li key={entry.id} className="rounded border border-white/5 bg-black/20 px-2 py-1">
                    <p className="truncate text-[10px] text-neutral-200">{entry.region} · {SCIENCE_META[entry.kind].short}</p>
                    <p className="truncate text-[9px] text-cyan-200/80">{entry.result.headline}</p>
                    <p className="font-mono text-[9px] text-neutral-500">{entry.startedAt.slice(11, 19)} UTC</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[11px] text-neutral-500">No experiments logged yet.</p>
            )}
          </div>

          {phase === 'done' ? (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-neutral-400">Nearby science · within {SCIENCE_NEARBY_M} m</p>
              {nearby.length === 0 ? (
                <p className="mt-1 text-[11px] text-neutral-500">No other science target in on-foot range. Board to resume the route.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {nearby.slice(0, 4).map(site => (
                    <li key={site.id}>
                      <button type="button" onClick={() => requestMove(site.id)} className="w-full rounded border border-white/10 bg-white/[0.02] px-2 py-1.5 text-left hover:border-cyan-300/40 hover:bg-cyan-300/5">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-[11px] text-neutral-100">{siteLabel(site)}</span>
                          <span className="shrink-0 font-mono text-[9px] text-neutral-400">{Math.round(distanceMeters(active, site))} m</span>
                        </span>
                        <span className="text-[9px] text-neutral-500">Move the crew here to work {SCIENCE_META[site.kind].short}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
          <p className="text-[9px] text-neutral-500">Illustrative simulation; results are deterministic per site. Click a nearby marker on the map to move the crew.</p>
        </div>
      )}
    </FloatingPanel>
  )
}
