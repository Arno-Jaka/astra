import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transformWithOxc } from 'vite'
async function moduleUrl(path, imports = {}) {
  let { code } = await transformWithOxc(await readFile(new URL(path, import.meta.url), 'utf8'), path)
  for (const [name, url] of Object.entries(imports)) code = code.replaceAll(`'${name}'`, JSON.stringify(url)).replaceAll(`"${name}"`, JSON.stringify(url))
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
}
const routePath = await moduleUrl('../src/map/routePath.ts')
const { planCrewMission, jumpHeight, JUMP_DURATION, JUMP_SPEED, MARS_CREW_GRAVITY } = await import(await moduleUrl('../src/map/crewMission.ts', { './routePath': routePath }))
const route = { distance_km: 1, coordinates: [[0, 0], [0, 0.005], [0, 0.01]], profile: [0, 0.5, 1].map(distance_km => ({ distance_km, grade_deg: 2, elevation_m: 0 })) }
assert.equal(planCrewMission(route, 15, 'sev').stagingT, 0.97)
assert.equal(planCrewMission(route, 15, 'rover').stagingT, 0.95)
const hazard = { ...route, dangers: [{ distance_km: 0.6, span_km: 0.2, type: 'cliff', over_limit: true }] }
assert.ok(planCrewMission(hazard, 15, 'rover').stagingT < 0.5)
assert.equal(planCrewMission({ ...route, profile: route.profile.map(p => ({ ...p, grade_deg: 25 })) }, 15, 'rover').available, false)
assert.equal(planCrewMission({ ...route, profile: route.profile.map(p => ({ ...p, elevation_m: null })) }, 15, 'sev').available, false)
assert.equal(planCrewMission({ ...route, dangers: [{ distance_km: 0, span_km: 0.1, over_limit: true, type: 'cliff' }] }, 15, 'rover').available, false)
assert.equal(jumpHeight(0), 0)
assert.ok(jumpHeight(JUMP_DURATION) < 1e-10)
assert.ok(Math.abs(jumpHeight(JUMP_DURATION / 2) - JUMP_SPEED ** 2 / (2 * MARS_CREW_GRAVITY)) < 1e-10)
assert.ok(JUMP_DURATION > 2 * JUMP_SPEED / 9.81, 'Mars flight lasts longer for the same impulse')
for (const name of ['FinnTheFrog', 'RaeTheRedPanda', 'FernandoTheFlamingo']) {
  const gltf = JSON.parse(await readFile(new URL(`../src/3D _assets/Astronaut_${name}.gltf`, import.meta.url), 'utf8'))
  for (const clip of ['Idle', 'Walk', 'Jump', 'Jump_Idle', 'Jump_Land']) assert.ok(gltf.animations.some(a => a.name === clip), `${name}: ${clip}`)
  assert.ok(gltf.skins.length > 0)
  assert.ok(gltf.buffers.every(b => b.uri.startsWith('data:')), 'asset is self-contained in production')
}
console.log('Passed: staging/unsafe-prefix/missing-data policy, Mars ballistic hop, all three rigs and required animation clips.')
