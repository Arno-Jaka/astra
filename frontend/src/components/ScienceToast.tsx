import { SCIENCE_META } from '../map/scienceExperiments'
import { useScienceStore } from '../store/scienceStore'

const TOAST_STYLE = {
  info: 'border-cyan-300/40 bg-cyan-950/90 text-cyan-100',
  success: 'border-emerald-300/40 bg-emerald-950/90 text-emerald-100',
  warn: 'border-amber-300/40 bg-amber-950/90 text-amber-100',
} as const

/**
 * Detour suggestion (top centre) and work/completion toasts (above the HUD).
 * The detour card disappears on its own when the vehicle passes the site; the
 * user can accept or dismiss it explicitly too.
 */
export default function ScienceToast() {
  const toasts = useScienceStore(state => state.toasts)
  const promptSiteId = useScienceStore(state => state.promptSiteId)
  const sites = useScienceStore(state => state.sites)
  const dismissToast = useScienceStore(state => state.dismissToast)
  const dismissPrompt = useScienceStore(state => state.dismissPrompt)
  const acceptDetour = useScienceStore(state => state.acceptDetour)
  const prompt = sites.find(site => site.id === promptSiteId) ?? null

  return (
    <>
      {prompt ? (
        <div className="pointer-events-auto fixed left-1/2 top-4 z-40 w-[min(440px,calc(100vw-24px))] -translate-x-1/2 rounded-xl border border-white/20 bg-neutral-950/92 p-3 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start gap-2">
            <span className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: SCIENCE_META[prompt.kind].color }} />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-200">Science detour · {prompt.region}</p>
              <p className="mt-0.5 text-sm font-semibold text-neutral-100">{SCIENCE_META[prompt.kind].label}</p>
              <p className="mt-1 text-[11px] leading-snug text-neutral-300">{SCIENCE_META[prompt.kind].blurb}</p>
              <p className="mt-1 text-[10px] text-neutral-500">The SEV will park a few metres off-route; the crew work only if the regional screening is crew-safe.</p>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-end gap-2">
            <button type="button" onClick={dismissPrompt} className="rounded border border-white/20 px-3 py-1.5 text-[11px] text-neutral-200 hover:bg-white/5">
              Keep driving
            </button>
            <button type="button" onClick={() => acceptDetour(prompt.id)} className="rounded border border-cyan-300/50 bg-cyan-300/10 px-3 py-1.5 text-[11px] font-medium text-cyan-100 hover:bg-cyan-300/20">
              Detour · {SCIENCE_META[prompt.kind].short}
            </button>
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none fixed bottom-40 left-1/2 z-40 flex w-[min(460px,calc(100vw-24px))] -translate-x-1/2 flex-col items-stretch gap-1.5">
        {toasts.map(toast => (
          <button
            key={toast.id}
            type="button"
            onClick={() => dismissToast(toast.id)}
            className={`pointer-events-auto rounded-lg border px-3 py-2 text-left text-[11px] shadow-2xl backdrop-blur-xl ${TOAST_STYLE[toast.kind]}`}
          >
            {toast.text}
          </button>
        ))}
      </div>
    </>
  )
}
