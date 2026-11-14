import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transformWithOxc } from 'vite'
async function moduleUrl(path, imports = {}) {
  let { code } = await transformWithOxc(await readFile(new URL(path, import.meta.url), 'utf8'), path)
  for (const [name, url] of Object.entries(imports)) code = code.replaceAll(`'${name}'`, JSON.stringify(url)).replaceAll(`"${name}"`, JSON.stringify(url))
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
}
const routePath = await moduleUrl('../src/map/routePath.ts')
const { planCrewMission, jumpHeight, JUMP_DURATION, JUMP_SPEED, MARS_CREW_GRAVITY, formatDistance,
  hopDuration, hopStrideM, approachSpeedMps, CREW_APPROACH_SECONDS, CREW_MIN_APPROACH_MPS, CREW_FORWARD_HEADING_OFFSET } = await import(await moduleUrl('../src/map/crewMission.ts', { './routePath': routePath }))
const route = { distance_km: 1, coordinates: [[0, 0], [0, 0.005], [0, 0.01]], profile: [0, 0.5, 1].map(distance_km => ({ distance_km, grade_deg: 2, elevation_m: 0 })) }
const safeSev = planCrewMission(route, 15, 'sev')
assert.equal(safeSev.stagingT, 0.8)
assert.equal(safeSev.available, true)
assert.equal(safeSev.toDestination, true)
assert.equal(Math.round(safeSev.standoffM), 200)
assert.equal(planCrewMission(route, 15, 'rover').stagingT, 0.95)
// Real backend profiles carry a null grade at the first sample; it must not be
// mistaken for an immediate hazard boundary (which blocked every real route).
const realShape = { ...route, profile: [{ distance_km: 0, grade_deg: null, elevation_m: 0 }, ...route.profile.slice(1)] }
const realPlan = planCrewMission(realShape, 15, 'sev')
assert.equal(realPlan.available, true)
assert.equal(realPlan.toDestination, true)
assert.equal(realPlan.stagingT, 0.8)
const hazard = { ...route, dangers: [{ distance_km: 0.6, span_km: 0.2, type: 'cliff', over_limit: true }] }
const hazardPlan = planCrewMission(hazard, 15, 'rover')
assert.ok(hazardPlan.stagingT < 0.5)
assert.equal(hazardPlan.toDestination, false)
assert.match(hazardPlan.reason, /rover is auto-deployed/)
assert.equal(formatDistance(30), '30 m')
assert.equal(formatDistance(1500), '1.5 km')
assert.equal(formatDistance(3_718_192), '3718.2 km')
const longHazard = {
  ...route,
  distance_km: 500,
  coordinates: [[0, 0], [0, 2.5], [0, 5]],
  profile: [0, 250, 500].map(distance_km => ({ distance_km, grade_deg: 2, elevation_m: 0 })),
  dangers: [{ distance_km: 5, span_km: 1, over_limit: true, type: 'cliff' }],
}
assert.match(planCrewMission(longHazard, 15, 'sev').reason, /km short at the last safe point/)
assert.equal(planCrewMission({ ...route, profile: route.profile.map(p => ({ ...p, grade_deg: 25 })) }, 15, 'rover').available, false)
assert.equal(planCrewMission({ ...route, profile: route.profile.map(p => ({ ...p, elevation_m: null })) }, 15, 'sev').available, false)
assert.equal(planCrewMission({ ...route, dangers: [{ distance_km: 0, span_km: 0.1, over_limit: true, type: 'cliff' }] }, 15, 'rover').available, false)
assert.equal(jumpHeight(0), 0)
assert.ok(jumpHeight(JUMP_DURATION) < 1e-10)
assert.ok(Math.abs(jumpHeight(JUMP_DURATION / 2) - JUMP_SPEED ** 2 / (2 * MARS_CREW_GRAVITY)) < 1e-10)
assert.ok(JUMP_DURATION > 2 * JUMP_SPEED / 9.81, 'Mars flight lasts longer for the same impulse')
// The crew faces its direction of travel; the rigs' forward axis needs a -90° heading offset.
assert.equal(CREW_FORWARD_HEADING_OFFSET, -Math.PI / 2)
// Hop stride is gravity-dependent: the same impulse carries farther on Mars than on Earth.
assert.ok(Math.abs(hopDuration(MARS_CREW_GRAVITY) - JUMP_DURATION) < 1e-12)
assert.ok(hopStrideM(0.5, MARS_CREW_GRAVITY) > hopStrideM(0.5, 9.81), 'lower gravity gives a longer hop stride')
// Constant horizontal speed through the stride: the airborne distance is just
// speed × air time, with no extra speed surge.
assert.ok(Math.abs(hopStrideM(0.5, MARS_CREW_GRAVITY) - 0.5 * JUMP_DURATION) < 1e-12)
// The on-screen approach covers its span in CREW_APPROACH_SECONDS, and each
// bound at that speed is a long gravity stride (not a shuffle).
assert.ok(CREW_APPROACH_SECONDS >= 10 && CREW_APPROACH_SECONDS <= 15, `approach target is 10-15 s: ${CREW_APPROACH_SECONDS}`)
const approach = approachSpeedMps(200)
assert.ok(Math.abs(200 / approach - CREW_APPROACH_SECONDS) < 1e-9)
assert.ok(hopStrideM(approach, MARS_CREW_GRAVITY) > 15, `bound is a long stride: ${hopStrideM(approach, MARS_CREW_GRAVITY).toFixed(1)} m`)
// A short standoff still moves briskly instead of slowing to a shuffle.
assert.equal(approachSpeedMps(10), CREW_MIN_APPROACH_MPS)
assert.ok(approachSpeedMps(10) > 10 / CREW_APPROACH_SECONDS)
for (const name of ['FinnTheFrog', 'RaeTheRedPanda', 'FernandoTheFlamingo']) {
  const gltf = JSON.parse(await readFile(new URL(`../src/3D _assets/Astronaut_${name}.gltf`, import.meta.url), 'utf8'))
  for (const clip of ['Idle', 'Walk', 'Jump', 'Jump_Idle', 'Jump_Land']) assert.ok(gltf.animations.some(a => a.name === clip), `${name}: ${clip}`)
  assert.ok(gltf.skins.length > 0)
  assert.ok(gltf.buffers.every(b => b.uri.startsWith('data:')), 'asset is self-contained in production')
}
console.log('Passed: safe/hazardous parking plan (incl. null first grade), Mars ballistic hop, constant-speed bounding with minimum approach speed, all three rigs and required animation clips.')
