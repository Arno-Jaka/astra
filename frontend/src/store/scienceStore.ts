import { create } from 'zustand'
import {
  SCIENCE_META,
  scienceCsv,
  scienceResult,
  type ScienceKind,
  type ScienceLogEntry,
  type ScienceResult,
} from '../map/scienceExperiments'
import type { ScienceSite } from '../map/scienceSites'

export type SciencePhase = 'off' | 'approach' | 'disembarking' | 'travelling' | 'working' | 'done' | 'boarding'

export type ScienceToastKind = 'info' | 'success' | 'warn'

export type ScienceToast = {
  id: number
  kind: ScienceToastKind
  text: string
}

type ScienceState = {
  sites: ScienceSite[]
  activeSiteId: string | null
  phase: SciencePhase
  /** Site accepted for a vehicle detour; the drive loop consumes this. */
  detourSiteId: string | null
  /** Site the crew should walk to from the current field stop. */
  moveRequestId: string | null
  /** Detour suggestion currently on screen. */
  promptSiteId: string | null
  boardRequested: boolean
  canBoard: boolean
  workElapsed: number
  workDuration: number
  toasts: ScienceToast[]
  logs: ScienceLogEntry[]
  loadSites: (sites: ScienceSite[]) => void
  reset: () => void
  prompt: (siteId: string) => void
  dismissPrompt: () => void
  acceptDetour: (siteId: string) => void
  consumeDetour: () => void
  beginSite: (siteId: string) => void
  travelToSite: (siteId: string) => void
  cancelDetour: () => void
  endScience: () => void
  setPhase: (phase: SciencePhase) => void
  setWork: (elapsed: number, duration: number) => void
  finishSite: (site: ScienceSite, startedAt: string, durationS: number, result?: ScienceResult) => void
  requestMove: (siteId: string) => void
  consumeMove: () => void
  requestBoard: () => void
  consumeBoard: () => boolean
  setCanBoard: (canBoard: boolean) => void
  toast: (kind: ScienceToastKind, text: string, ttlMs?: number) => void
  dismissToast: (id: number) => void
  downloadCsv: () => void
}

let toastId = 0
let siteSequence = 0

const EMPTY = {
  sites: [],
  activeSiteId: null,
  phase: 'off' as SciencePhase,
  detourSiteId: null,
  moveRequestId: null,
  promptSiteId: null,
  boardRequested: false,
  canBoard: false,
  workElapsed: 0,
  workDuration: 0,
  toasts: [],
  logs: [],
}

export const useScienceStore = create<ScienceState>((set, get) => ({
  ...EMPTY,
  /** A new route replaces the sites and resets every transient flag, but the
   *  session's experiment log survives so the CSV stays a field log. */
  loadSites: (sites) => set(state => ({ ...EMPTY, sites, logs: state.logs })),
  reset: () => set({ ...EMPTY }),
  prompt: (siteId) => {
    if (get().phase !== 'off' || get().promptSiteId === siteId) return
    set({ promptSiteId: siteId })
  },
  dismissPrompt: () => set({ promptSiteId: null }),
  acceptDetour: (siteId) => set(state => {
    if (state.phase !== 'off') return {}
    const site = state.sites.find(candidate => candidate.id === siteId)
    if (!site || site.safety === 'unsafe') return {}
    return { detourSiteId: siteId, promptSiteId: null, activeSiteId: siteId, phase: 'approach' as const }
  }),
  consumeDetour: () => set({ detourSiteId: null }),
  cancelDetour: () => set({ detourSiteId: null, promptSiteId: null, activeSiteId: null, phase: 'off', canBoard: false }),
  beginSite: (siteId) => set({ activeSiteId: siteId, phase: 'disembarking', workElapsed: 0, workDuration: 0 }),
  travelToSite: (siteId) => set({ activeSiteId: siteId, moveRequestId: null, phase: 'travelling', canBoard: false, workElapsed: 0, workDuration: 0 }),
  endScience: () => set({
    activeSiteId: null,
    phase: 'off',
    moveRequestId: null,
    detourSiteId: null,
    promptSiteId: null,
    boardRequested: false,
    canBoard: false,
    workElapsed: 0,
    workDuration: 0,
  }),
  setPhase: (phase) => set({ phase }),
  setWork: (workElapsed, workDuration) => set({ workElapsed, workDuration }),
  finishSite: (site, startedAt, durationS, result) => set(state => {
    if (state.logs.some(entry => entry.siteId === site.id)) return { phase: 'done', canBoard: true }
    const entry: ScienceLogEntry = {
      id: `log-${++siteSequence}`,
      siteId: site.id,
      siteName: SCIENCE_META[site.kind].label,
      region: site.region,
      kind: site.kind,
      lat: site.lat,
      lon: site.lon,
      startedAt,
      durationS,
      result: result ?? scienceResult(site.kind, site.seed),
    }
    return {
      logs: [...state.logs, entry],
      phase: 'done',
      canBoard: true,
      workElapsed: state.workDuration,
    }
  }),
  requestMove: (siteId) => set(state => state.phase === 'done' ? { moveRequestId: siteId, canBoard: false } : {}),
  consumeMove: () => set({ moveRequestId: null }),
  requestBoard: () => set(state => state.canBoard ? { boardRequested: true, phase: 'boarding' } : {}),
  consumeBoard: () => {
    const requested = get().boardRequested
    if (requested) set({ boardRequested: false })
    return requested
  },
  setCanBoard: (canBoard) => set({ canBoard }),
  toast: (kind, text, ttlMs = 4800) => {
    const id = ++toastId
    set(state => ({ toasts: [...state.toasts.slice(-2), { id, kind, text }] }))
    if (ttlMs > 0) {
      window.setTimeout(() => set(state => ({ toasts: state.toasts.filter(toast => toast.id !== id) })), ttlMs)
    }
  },
  dismissToast: (id) => set(state => ({ toasts: state.toasts.filter(toast => toast.id !== id) })),
  downloadCsv: () => {
    const csv = scienceCsv(get().logs)
    if (!csv) return
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `astra-science-log-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  },
}))

export type ScienceExperiment = ScienceKind
