import { create } from 'zustand'

/** Crash outcome when the scout enters an over-stability danger zone. */
export type DriveCrash = {
  type: 'rollover' | 'fall' | 'jet'
  detail: string
  distanceKm: number
  gradeDeg: number
}

/** Live telemetry pushed from the scout simulation step loop. */
export type DriveTelemetry = {
  distanceKm: number
  totalKm: number
  gradeDeg: number
  elevationM: number
  headingDeg: number
  speedMult: number
  paused: boolean
  braking: boolean
  arriving: boolean
  loading: boolean
  speedMps: number
  travelMode: 'preview' | 'realtime'
  timeScale: number
  /** Mission slope limit of the driven route (for HUD color-coding). */
  limitDeg: number
}

type DriveState = DriveTelemetry & {
  active: boolean
  /** Transient hazard warning (slip risk zone), cleared next update. */
  warning: string | null
  crash: DriveCrash | null
  /** Set by the Stop button / failure recovery; ends the drive. */
  stopRequested: boolean
  jetRequested: boolean
  triggerJet: () => void
  start: () => void
  end: () => void
  stop: () => void
  togglePause: () => void
  setSpeed: (speed: number) => void
  setTravelMode: (mode: DriveTelemetry['travelMode']) => void
  update: (telemetry: Partial<DriveTelemetry>) => void
  warn: (warning: string | null) => void
  /** Report a crash, or pass null to clear the last report. */
  crashed: (crash: DriveCrash | null) => void
}

const EMPTY: DriveTelemetry = {
  distanceKm: 0,
  totalKm: 0,
  gradeDeg: 0,
  elevationM: 0,
  headingDeg: 0,
  speedMult: 1,
  paused: false,
  braking: false,
  arriving: false,
  loading: false,
  speedMps: 0,
  travelMode: 'preview',
  timeScale: 1,
  limitDeg: 0,
}

export const useDriveStore = create<DriveState>((set) => ({
  ...EMPTY,
  active: false,
  warning: null,
  crash: null,
  stopRequested: false,
  jetRequested: false,
  triggerJet: () => set({ jetRequested: true }),
  start: () =>
    set({ ...EMPTY, active: true, loading: true, warning: null, crash: null, stopRequested: false, jetRequested: false }),
  end: () =>
    set({ active: false, loading: false, paused: false, braking: false, arriving: false, speedMps: 0, warning: null, stopRequested: false, jetRequested: false }),
  stop: () => set((state) => ({ stopRequested: true, braking: state.speedMps > 0 })),
  togglePause: () => set((state) => state.stopRequested ? {} : ({ paused: !state.paused, braking: !state.paused && state.speedMps > 0 })),
  setSpeed: (speed) => set({ speedMult: Math.max(0.25, Math.min(4, speed)) }),
  setTravelMode: (travelMode) => set({ travelMode }),
  update: (telemetry) => set(telemetry),
  warn: (warning) => set({ warning }),
  crashed: (crash) => set({ crash }),
}))
