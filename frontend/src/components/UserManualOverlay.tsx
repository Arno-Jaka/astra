import { useEffect, useState } from 'react'

const KEY = 'astra-seen-manual-v1'

export default function UserManualOverlay() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setOpen(true)
    } catch {
      /* storage unavailable */
    }
  }, [])

  const close = () => {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      /* storage unavailable */
    }
    setOpen(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="ASTRA quick guide"
        className="w-full max-w-md rounded-2xl border border-white/15 bg-neutral-950/95 p-5 text-sm text-neutral-200 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-orange-300/80">Welcome</p>
            <h2 className="text-lg font-semibold text-white">ASTRA quick guide</h2>
          </div>
          <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium text-cyan-300">
            First launch
          </span>
        </div>

        <ol className="mt-4 space-y-2.5">
          <li className="flex gap-2">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-[11px] font-semibold text-cyan-300">1</span>
            <span><span className="font-medium text-cyan-200">Pick points:</span> click the map (or search) to set <span className="text-emerald-300">start</span> and <span className="text-orange-300">destination</span>.</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-500/20 text-[11px] font-semibold text-orange-300">2</span>
            <span><span className="font-medium text-orange-200">Check route:</span> review <span className="text-emerald-300">safe</span> vs <span className="text-red-300">hazardous</span> paths, slope, and warnings.</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-[11px] font-semibold text-violet-300">3</span>
            <span><span className="font-medium text-violet-200">Explore data:</span> use <span className="text-sky-300">Layers</span>, <span className="text-amber-200">Weather</span>, and panels for mission context.</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[11px] font-semibold text-emerald-300">4</span>
            <span><span className="font-medium text-emerald-200">Simulate:</span> preview/drive the traverse and follow on-screen mission prompts.</span>
          </li>
        </ol>

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-[11px] text-neutral-500">Tip: use <span className="text-neutral-300">Reset</span> anytime to refresh.</p>
          <button
            type="button"
            onClick={close}
            className="rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-4 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/25"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
