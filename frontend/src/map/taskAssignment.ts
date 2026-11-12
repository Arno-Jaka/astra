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
    reasons: reasons.length ? reasons : ['No robot-only task criteria or severe regional terrain hazards identified'],
    taskExecutor: vehicle === 'rover' ? 'rover' as const : 'crew' as const,
    futureHandoff: vehicle === 'rover'
      ? 'Future astronaut workflow: hold crew/SEV at a separately verified staging point and deploy the rover to the target.'
      : 'Future astronaut workflow: park the SEV at a verified access point and let astronauts approach the target.',
  }
}
