import { create } from 'zustand'
import type { EnvironmentLevel } from './environmentStore'
import {
  nextSeed,
  pickWeather,
  WEATHER_PROFILES,
  type WeatherKind,
} from './weatherEngine'

/**
 * Runtime state for the simulated surface-weather layer.
 *
 * This store is deliberately separate from the derived weather/radiation
 * screening: the screening picks a region's planning class, while this store
 * runs the visible, illustrative weather events on top of the 3D assets.
 * The events are a dramatization, not a forecast.
 */
type WeatherState = {
  /** Mapped environment zone currently driving the event bias. */
  focusId: string | null
  /** Screening class of the focused region (or a neutral default). */
  classification: EnvironmentLevel
  kind: WeatherKind
  /** Monotonic timestamp of the event's first frame. */
  startedAt: number
  seed: number
  /** When true, the event advances automatically at the end of its run. */
  auto: boolean
  /** Advance to the next event immediately (also rolls a fresh seed). */
  next: (now?: number) => void
  /** Point the event bias at a mapped region's screening class. */
  setFocus: (
    id: string | null,
    classification?: EnvironmentLevel,
    now?: number,
  ) => void
  setAuto: (auto: boolean) => void
  /** Advance automatically once the current event has run its course. */
  tick: (now?: number) => void
}

/** A fixed seed keeps the opening event and each region's sequence repeatable. */
const INITIAL_SEED = 0x5eed1234

const clock = () =>
  typeof performance !== 'undefined' ? performance.now() : Date.now()

/** Small deterministic string hash so different regions get different sequences. */
const hashId = (id: string) => {
  let hash = 0x811c9dc5
  for (let index = 0; index < id.length; index++) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 0x01000193)
  }
  return hash >>> 0
}

export const weatherElapsedS = (startedAt: number, now: number) =>
  Math.max(0, (now - startedAt) / 1000)

export const useWeatherStore = create<WeatherState>((set, get) => ({
  focusId: null,
  classification: 'caution',
  // Open on a dramatic event so the layer is visible as soon as the camera
  // drops to the surface; auto-cycle then moves through the profile set.
  kind: 'sandstorm',
  startedAt: clock(),
  seed: INITIAL_SEED,
  auto: true,
  next: (now = clock()) => {
    set((state) => {
      let seed = nextSeed(state.seed)
      let kind = pickWeather(state.classification, seed)
      // Never replay the same event back-to-back when other options exist.
      if (kind === state.kind) {
        seed = nextSeed(seed)
        kind = pickWeather(state.classification, seed)
      }
      return { seed, kind, startedAt: now }
    })
  },
  setFocus: (id, classification, now = clock()) => {
    set((state) => {
      if (id === state.focusId && (!classification || classification === state.classification)) {
        return state
      }
      const level = classification ?? state.classification
      const seed = nextSeed(state.seed ^ (id ? hashId(id) : 0))
      return {
        focusId: id,
        classification: level,
        kind: pickWeather(level, seed),
        seed,
        startedAt: now,
      }
    })
  },
  setAuto: (auto) => set({ auto }),
  tick: (now = clock()) => {
    const state = get()
    if (!state.auto) return
    if (weatherElapsedS(state.startedAt, now) >= WEATHER_PROFILES[state.kind].durationS) {
      state.next(now)
    }
  },
}))
