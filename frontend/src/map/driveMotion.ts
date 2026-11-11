/** Acceleration is in presentation seconds so time-compressed travel still
 * visibly brakes and pulls away. Nominal speed remains metres/s simulated.
 */
export const DRIVE_ACCELERATION = 0.3
export const DRIVE_BRAKING = 0.4
/** Gentler than an operator stop; begins before entering braking distance. */
export function arrivalSpeedLimit(remainingM: number, timeScale: number, speed: number, dt: number) {
  const available = Math.max(0, remainingM / timeScale - speed * dt)
  return Math.sqrt(2 * 0.18 * available)
}

export function advanceDrive(speed: number, target: number, dt: number) {
  if (dt <= 0) return { speed, distance: 0 }
  const rate = target < speed ? DRIVE_BRAKING : DRIVE_ACCELERATION
  const rampTime = Math.min(dt, Math.abs(target - speed) / rate)
  const next = speed + Math.sign(target - speed) * rate * rampTime
  // Integrate the ramp, then any constant-speed remainder exactly. This
  // avoids frame-rate-dependent stopping distance and a final-frame snap.
  const distance = (speed + next) * 0.5 * rampTime + target * (dt - rampTime)
  return { speed: Math.abs(next) < 1e-8 ? 0 : next, distance }
}
