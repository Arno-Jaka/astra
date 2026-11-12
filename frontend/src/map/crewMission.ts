import { sampleRoute, totalDistanceKm, type TraversableRoute } from './routePath'
import type { VehicleKind } from './taskAssignment'

export const MARS_CREW_GRAVITY = 3.71
export const MARS_GAIT_RATE = Math.sqrt(MARS_CREW_GRAVITY / 9.81)
export const JUMP_SPEED = 1.4 // m/s takeoff impulse; illustrative suited hop
export const jumpHeight = (seconds: number) => Math.max(0, JUMP_SPEED * seconds - 0.5 * MARS_CREW_GRAVITY * seconds ** 2)
export const JUMP_DURATION = 2 * JUMP_SPEED / MARS_CREW_GRAVITY

/** A regional staging candidate, never a local obstacle/landing certification.
 * Reject missing terrain and never carry the SEV through a known hazard to stage. */
export function planCrewMission(route: TraversableRoute & {
  dangers?: { distance_km: number; span_km: number; over_limit: boolean; type: string }[]
}, limit: number, executor: VehicleKind) {
  const total = totalDistanceKm(route)
  const blocked = { stagingT: 0, available: false, reason: 'No reachable staging candidate with sufficient terrain data. Crew remains aboard.' }
  if (total <= 0 || route.profile.length < 2) return blocked
  let boundary = total
  for (let i = 0; i < route.profile.length; i++) {
    const p = route.profile[i]
    if (p.grade_deg === null || p.elevation_m === null || !Number.isFinite(p.grade_deg) || Math.abs(p.grade_deg) > limit) {
      boundary = Math.min(boundary, route.profile[Math.max(0, i - 1)].distance_km)
      break
    }
  }
  for (const danger of route.dangers ?? []) {
    if (danger.over_limit || danger.type === 'rollover' || danger.type === 'cliff') boundary = Math.min(boundary, Math.max(0, danger.distance_km - danger.span_km / 2))
  }
  const desired = Math.max(0, Math.min(total - (executor === 'rover' ? 0.05 : 0.03), boundary - 0.03))
  const candidates = [desired, ...route.profile.map(p => p.distance_km).filter(d => d < desired).reverse()]
  for (const distance of candidates) {
    if (distance + 0.01 >= boundary) continue
    if ([-0.005, 0, 0.005].every(delta => Math.abs(sampleRoute(route, Math.max(0, distance + delta) / total).gradeDeg) <= Math.min(8, limit))) {
      return { stagingT: distance / total, available: true, reason: `SEV stages ${((total - distance) * 1000).toFixed(0)} m before target. ${executor === 'rover' ? 'Crew holds at staging; rover performs the final approach.' : 'Three-person crew approaches on foot.'}` }
    }
  }
  return blocked
}
