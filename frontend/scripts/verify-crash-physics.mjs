import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transformWithOxc } from 'vite'
const { code } = await transformWithOxc(await readFile(new URL('../src/map/crashPhysics.ts', import.meta.url), 'utf8'), 'crashPhysics.ts')
const { advanceCrash, bodySupport, terrainSupport, MARS_GRAVITY } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
const body = (overrides = {}) => ({ x: 0, z: 1.05, vx: 0, vz: 0, pitch: 0, spin: 0, elapsed: 0, settledFor: 0, impacts: 0, ...overrides })
for (const fps of [30, 60, 120]) {
  const flight = body({ z: 100, vx: 2, vz: 7.5 })
  for (let i = 0; i < fps; i++) advanceCrash(flight, 1 / fps, () => 0)
  assert.ok(Math.abs(flight.z - (100 + 7.5 - MARS_GRAVITY / 2)) < 0.02, 'flight must follow Mars gravity')
  assert.ok(Math.abs(flight.x - 2) < 1e-8, 'horizontal momentum must persist in flight')
  const jet = body({ vx: 0.4, vz: 7.5, spin: 0.8 })
  let peak = 0
  for (let i = 0; i < fps * 25; i++) {
    advanceCrash(jet, 1 / fps, () => 0)
    peak = Math.max(peak, jet.z)
    assert.ok(jet.z >= bodySupport(jet.pitch) - 1e-8, 'hull must not penetrate terrain')
  }
  assert.ok(peak > 8 && peak < 9, 'jet apex must match the configured impulse')
  assert.ok(jet.impacts > 0, 'jet must land and collide')
  assert.ok(jet.settledFor > 1, 'inelastic impacts must eventually settle')
  for (const sign of [-1, 1]) {
    const slope = x => sign * x * Math.tan(15 * Math.PI / 180)
    const tumble = body({ vx: -sign * 0.8, spin: -sign * 4 })
    for (let i = 0; i < fps * 15; i++) advanceCrash(tumble, 1 / fps, slope)
    assert.ok(tumble.x * sign < 0, 'uphill must tumble backward, downhill forward')
    assert.ok(tumble.z >= terrainSupport(tumble.x, tumble.pitch, slope) - 1e-8)
  }
}
console.log('Passed: Mars-gravity ballistics, conserved airborne momentum, jet landing, hull contact, settling, slope-dependent tumble direction.')
