export const MARS_GRAVITY = 3.71
export type CrashBody = {
  x: number; z: number; vx: number; vz: number
  pitch: number; spin: number; elapsed: number; settledFor: number; impacts: number
}
export function bodySupport(pitch: number) {
  return Math.abs(Math.sin(pitch)) * 1.45 + Math.abs(Math.cos(pitch)) * 1.0
}
export function terrainSupport(x: number, pitch: number, groundAt: (x: number) => number) {
  let floor = -Infinity
  for (const along of [-1.45, 0, 1.45]) {
    for (const up of [-1, 1]) {
      const dx = along * Math.cos(pitch) + up * Math.sin(pitch)
      const dz = -along * Math.sin(pitch) + up * Math.cos(pitch)
      floor = Math.max(floor, groundAt(x + dx) - dz)
    }
  }
  return floor
}

/** Danger-zone shape the topple policy needs (a subset of a route danger). */
export type CliffZone = { type: string; distance_km: number; span_km: number }

/** A deployed rover tolerates ordinary over-limit grades; it only topples
 * against a genuine landform: a planner-classified `cliff` zone (a
 * near-vertical MOLA drop it can fall off or smash into) or terrain that has
 * become cliff-steep (>= fallGradeDeg). A bare over-limit grade is not a
 * topple cause. */
export function topplesAtCliff(
  absGradeDeg: number,
  distanceKm: number,
  dangers: CliffZone[],
  fallGradeDeg: number,
): boolean {
  return (
    absGradeDeg >= fallGradeDeg ||
    dangers.some(
      (zone) =>
        zone.type === 'cliff' &&
        Math.abs(distanceKm - zone.distance_km) <= zone.span_km / 2 + 0.05,
    )
  )
}

/** 2-D rigid-body approximation in the along-route vertical plane.
 * Fixed substeps, ballistic flight, terrain contact, inelastic impulses and
 * Coulomb friction replace the former timed sine-wave bounce/slide script.
 */
export function advanceCrash(body: CrashBody, dt: number, groundAt: (x: number) => number) {
  const steps = Math.max(1, Math.ceil(dt * 120))
  const h = dt / steps
  for (let i = 0; i < steps; i++) {
    const slope = Math.atan2(groundAt(body.x + 0.5) - groundAt(body.x - 0.5), 1)
    const supported = body.z <= terrainSupport(body.x, body.pitch, groundAt) + 0.005 && body.vz <= 0.1
    if (supported) {
      const gravityAlong = -MARS_GRAVITY * Math.sin(slope) * Math.cos(slope)
      const friction = 0.65 * MARS_GRAVITY * Math.cos(slope) ** 2
      const desired = body.vx + gravityAlong * h
      body.vx = Math.sign(desired) * Math.max(0, Math.abs(desired) - friction * h)
      // Gravity torques the hull about its current support edge. A box
      // cannot freeze balanced on a corner just because its spin damped.
      const relativePitch = body.pitch + slope
      const derivative = (1.45 * Math.cos(relativePitch) * Math.sign(Math.sin(relativePitch))
        - Math.sin(relativePitch) * Math.sign(Math.cos(relativePitch))) / Math.max(0.1, Math.cos(slope))
      body.spin -= MARS_GRAVITY * derivative / 1.1 * h
      body.spin *= Math.exp(-1.4 * h)
      const restingAngle = Math.round(relativePitch / (Math.PI / 2)) * Math.PI / 2 - slope
      if (Math.abs(body.pitch - restingAngle) < 0.025 && Math.abs(body.spin) < 0.2) {
        body.pitch = restingAngle; body.spin = 0
      }
    }
    body.vz -= MARS_GRAVITY * h
    body.x += body.vx * h
    body.z += body.vz * h
    body.pitch += body.spin * h
    const floor = terrainSupport(body.x, body.pitch, groundAt)
    if (body.z < floor) {
      const impact = Math.max(0, -body.vz)
      body.z = floor
      body.vz = impact > 0.6 ? impact * 0.22 : 0
      if (impact > 0.6) {
        body.impacts++
        body.vx *= 0.7
        body.spin = body.spin * 0.55 + Math.sign(body.vx || body.spin || 1) * impact * 0.08
      }
    }
    body.elapsed += h
    const still = Math.abs(body.vx) < 0.05 && Math.abs(body.vz) < 0.05 && Math.abs(body.spin) < 0.08 && body.z - floor < 0.01
    body.settledFor = still ? body.settledFor + h : 0
  }
  return body
}
