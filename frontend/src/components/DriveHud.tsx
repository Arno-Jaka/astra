import { useDriveStore } from '../store/driveStore'

/** Game-style driving telemetry bar shown while the scout simulation runs. */
export default function DriveHud() {
  const active = useDriveStore((state) => state.active)
  const distanceKm = useDriveStore((state) => state.distanceKm)
  const totalKm = useDriveStore((state) => state.totalKm)
  const gradeDeg = useDriveStore((state) => state.gradeDeg)
  const elevationM = useDriveStore((state) => state.elevationM)
  const headingDeg = useDriveStore((state) => state.headingDeg)
  const speedMult = useDriveStore((state) => state.speedMult)
  const paused = useDriveStore((state) => state.paused)
  const limitDeg = useDriveStore((state) => state.limitDeg)
  const warning = useDriveStore((state) => state.warning)
  const crash = useDriveStore((state) => state.crash)
  if (!active) return null

  const progress = totalKm > 0 ? Math.min(100, (distanceKm / totalKm) * 100) : 0

  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 w-[440px] max-w-[calc(100vw-2rem)] -translate-x-1/2">
      {crash ? (
        <div className="mb-1.5 rounded-lg border border-red-500/50 bg-red-950/85 px-3 py-2 text-center text-[11px] font-medium text-red-200 shadow-2xl backdrop-blur-xl">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-red-400">
            Scout lost ·{' '}
            {crash.type === 'fall' ? 'fall' : 'rollover'}
          </span>
          <span className="ml-1.5">{crash.detail}</span>
        </div>
      ) : warning ? (
        <div className="mb-1.5 rounded-lg border border-amber-400/50 bg-amber-950/85 px-3 py-2 text-center text-[11px] font-medium text-amber-200 shadow-2xl backdrop-blur-xl">
          ⚠ {warning}
        </div>
      ) : null}
      <div className="rounded-xl border border-white/10 bg-black/65 px-4 py-2.5 shadow-2xl backdrop-blur-xl">
        <div className="flex items-baseline justify-between font-mono text-[11px] tabular-nums text-neutral-200">
          <span>
            {distanceKm.toFixed(1)}
            <span className="text-neutral-500"> / {totalKm.toFixed(1)} km</span>
          </span>
          <span
            className={
              paused ? 'text-amber-300' : 'text-cyan-300'
            }
          >
            {paused ? '‖ paused' : `×${speedMult.toFixed(2)}`}
          </span>
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-300 transition-[width] duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-baseline justify-between font-mono text-[10px] tabular-nums text-neutral-400">
          <span>
            grade{' '}
            <span
              className={
                Math.abs(gradeDeg) > Math.max(limitDeg, 12)
                  ? 'text-red-300'
                  : Math.abs(gradeDeg) > 10
                    ? 'text-amber-300'
                    : 'text-neutral-200'
              }
            >
              {gradeDeg > 0 ? '+' : ''}
              {gradeDeg.toFixed(1)}°
            </span>
          </span>
          <span>
            elev{' '}
            <span className="text-neutral-200">
              {Math.round(elevationM).toLocaleString()} m
            </span>
          </span>
          <span>
            hdg{' '}
            <span className="text-neutral-200">
              {Math.round(headingDeg)
                .toString()
                .padStart(3, '0')}
              °
            </span>
          </span>
        </div>
      </div>
      <p className="mt-1 text-center text-[9px] uppercase tracking-[0.18em] text-neutral-500">
        drag orbit · scroll zoom · ↑↓ speed · space pause · C camera · esc end
      </p>
    </div>
  )
}
