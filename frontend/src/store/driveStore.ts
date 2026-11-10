import { create } from 'zustand'

/** Crash outcome when the scout enters an over-stability danger zone. */
export type DriveCrash = {
  type: 'rollover' | 'fall'
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
  start: () => void
  end: () => void
  stop: () => void
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
  limitDeg: 0,
}

export const useDriveStore = create<DriveState>((set) => ({
  ...EMPTY,
  active: false,
  warning: null,
  crash: null,
  stopRequested: false,
  start: () =>
    set({ ...EMPTY, active: true, warning: null, crash: null, stopRequested: false }),
  end: () =>
    set({ active: false, paused: false, warning: null, stopRequested: false }),
  stop: () => set({ stopRequested: true }),
  update: (telemetry) => set(telemetry),
  warn: (warning) => set({ warning }),
  crashed: (crash) => set({ crash }),
}))
