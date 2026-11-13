import { sampleRoute, totalDistanceKm, type TraversableRoute } from './routePath'
import type { VehicleKind } from './taskAssignment'

export const MARS_CREW_GRAVITY = 3.71
export const MARS_GAIT_RATE = Math.sqrt(MARS_CREW_GRAVITY / 9.81)
export const JUMP_SPEED = 2.0 // m/s takeoff impulse; illustrative suited bound
export const jumpHeight = (seconds: number) => Math.max(0, JUMP_SPEED * seconds - 0.5 * MARS_CREW_GRAVITY * seconds ** 2)
/** Air time of one suited hop (s). Longer under lower gravity. */
export const hopDuration = (gravity: number = MARS_CREW_GRAVITY) => 2 * JUMP_SPEED / gravity
export const JUMP_DURATION = hopDuration(MARS_CREW_GRAVITY)
/** Wall-clock seconds the on-screen final approach should take. The EVA time
 * estimate in the panel still uses the real suited pace; this only controls how
 * fast the illustrative low-gravity bound plays out, so the crew bounds to the
 * target promptly instead of plodding at the walking pace. */
export const CREW_APPROACH_SECONDS = 11
/** Visual speed of the on-screen final approach (m/s): covers `spanM` in
 * CREW_APPROACH_SECONDS. Presentation only — not a suited walking speed. */
export const approachSpeedMps = (spanM: number) => Math.max(0.1, spanM / CREW_APPROACH_SECONDS)
/** Airborne speed of a bound, relative to the approach speed. The crew keeps a
 * long, gravity-assisted stride, so a bound carries them ahead of the base
 * glide. The stride scales with the gravity-dependent air time, so a Mars bound
 * carries farther than an Earth one. */
export const HOP_SPEED_FACTOR = 1.15
/** Grounded glide between bounds, relative to the approach speed. */
export const HOP_GROUND_FACTOR = 0.85
/** Ground covered by one bound (m); a long low-gravity stride, not a step. */
export const hopStrideM = (speed: number, gravity: number = MARS_CREW_GRAVITY) =>
  speed * HOP_SPEED_FACTOR * hopDuration(gravity)

/** Heading offset (radians) applied to a route bearing so the crew rig's body
 * faces the direction of travel. The rigs' glTF +Z forward maps to Cesium's
 * local +X, whose azimuth is bearing + heading + 90°, so the offset is -90°.
 * Verified against joint world positions: `+PI` faced them 90° to the left. */
export const CREW_FORWARD_HEADING_OFFSET = -Math.PI / 2

/** Fixed parking standoff from the target (km), independent of route length.
 *  Large enough that the parked vehicle is visibly separate from the science
 *  spot, so the crew's on-foot final approach is a real traverse rather than a
 *  few steps. */
export const SEV_STANDOFF_KM = 0.2
export const ROVER_STANDOFF_KM = 0.05

/** Human-friendly distance: metres under 1 km, otherwise kilometres. */
export const formatDistance = (metres: number) =>
  metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(1)} km`

export type CrewMissionPlan = {
  /** Fraction of the traverse at which the vehicle parks. */
  stagingT: number
  available: boolean
  /** True when the traverse itself is crew-safe, so the SEV reaches the target. */
  toDestination: boolean
  /** On-foot distance from the parked vehicle to the target (metres). */
  standoffM: number
  reason: string
}

/** A regional parking candidate, never a local obstacle/landing certification.
 * Rejects missing terrain and never carries the vehicle through a known hazard.
 * The first profile sample has no grade (backend `_finalize`), so it is skipped
 * rather than mistaken for an immediate hazard boundary. */
export function planCrewMission(route: TraversableRoute & {
  dangers?: { distance_km: number; span_km: number; over_limit: boolean; type: string }[]
}, limit: number, executor: VehicleKind): CrewMissionPlan {
  const total = totalDistanceKm(route)
  const blocked: CrewMissionPlan = { stagingT: 0, available: false, toDestination: false, standoffM: 0, reason: 'No reachable parking candidate with sufficient terrain data. Crew remains aboard.' }
  if (total <= 0 || route.profile.length < 2) return blocked
  // The last point the vehicle can certify: the first missing-elevation sample,
  // over-limit grade, or severe danger zone. Stays `total` for a safe traverse.
  let boundary = total
  for (let i = 0; i < route.profile.length; i++) {
    const p = route.profile[i]
    if (p.elevation_m === null) {
      boundary = Math.min(boundary, route.profile[Math.max(0, i - 1)].distance_km)
      break
    }
    if (p.grade_deg === null) continue // first sample has no grade yet
    if (!Number.isFinite(p.grade_deg) || Math.abs(p.grade_deg) > limit) {
      boundary = Math.min(boundary, route.profile[Math.max(0, i - 1)].distance_km)
      break
    }
  }
  for (const danger of route.dangers ?? []) {
    if (danger.over_limit || danger.type === 'rollover' || danger.type === 'cliff') boundary = Math.min(boundary, Math.max(0, danger.distance_km - danger.span_km / 2))
  }
  const toDestination = boundary >= total - 1e-9
  const standoff = executor === 'rover' ? ROVER_STANDOFF_KM : SEV_STANDOFF_KM
  const desired = Math.max(0, Math.min(total - standoff, boundary - standoff))
  const candidates = [desired, ...route.profile.map(p => p.distance_km).filter(d => d < desired).reverse()]
  for (const distance of candidates) {
    if (distance + 0.01 >= boundary) continue
    // A parking spot must be within the mission slope envelope (which the whole
    // safe traverse already satisfies) and have real terrain behind it.
    if ([-0.005, 0, 0.005].every(delta => {
      const sample = sampleRoute(route, Math.max(0, distance + delta) / total)
      return Number.isFinite(sample.gradeDeg) && Math.abs(sample.gradeDeg) <= limit
    })) {
      const standoffM = (total - distance) * 1000
      return {
        stagingT: distance / total,
        available: true,
        toDestination,
        standoffM,
        reason: toDestination
          ? `Destination is inside the crew slope envelope: the ${executor === 'sev' ? 'SEV drives the full traverse to within' : 'rover drives to within'} ${formatDistance(standoffM)} of the target and parks. ${executor === 'sev' ? 'Three astronauts walk or hop the final approach.' : 'The crew remains beside the parked SEV.'}`
          : `Hazard at km ${boundary.toFixed(1)}: the SEV parks ${formatDistance(standoffM)} short at the last safe point, and the rover is auto-deployed to the target.`,
      }
    }
  }
  return blocked
}
