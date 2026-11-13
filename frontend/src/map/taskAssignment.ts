export type VehicleKind = 'rover' | 'sev'
export type TaskRequirements = {
  high_physical_risk?: boolean
  strict_contamination?: boolean
  repetitive_work?: boolean
}
type TerrainAssessment = {
  max_grade_deg: number
  slope_compliant?: boolean
  dangers?: { type: string; over_limit: boolean }[]
}

/** Shared by the route summary and the actual simulation launch. */
export function assignVehicle(terrain: TerrainAssessment, slopeLimit: number, task: TaskRequirements = {}) {
  const reasons: string[] = []
  if (task.high_physical_risk) reasons.push('Task marked high physical risk')
  if (terrain.slope_compliant === false || terrain.max_grade_deg > slopeLimit + 0.05 || terrain.dangers?.some(d => d.over_limit || d.type === 'rollover' || d.type === 'cliff')) reasons.push('Selected traverse has an over-limit or severe terrain hazard')
  if (task.strict_contamination) reasons.push('Strict contamination limits')
  if (task.repetitive_work) reasons.push('Repetitive work reserved for robotic execution')
  const vehicle: VehicleKind = reasons.length ? 'rover' : 'sev'
  return {
    vehicle, label: vehicle === 'rover' ? 'Robotic rover' : 'Space Exploration Vehicle',
    reasons: reasons.length ? reasons : ['Destination is crew-safe (within the slope envelope) with no robot-only task criteria'],
    taskExecutor: vehicle === 'rover' ? 'rover' as const : 'crew' as const,
    handoff: vehicle === 'rover'
      ? 'The SEV carries the crew to the last safe point, parks, and the rover is auto-deployed to the target.'
      : 'The SEV drives the full traverse to the destination and parks nearby; the crew walks or hops the final approach.',
  }
}
