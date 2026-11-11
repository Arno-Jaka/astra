import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transformWithOxc } from 'vite'

const source = await readFile(new URL('../src/map/driveMotion.ts', import.meta.url), 'utf8')
const { code } = await transformWithOxc(source, 'driveMotion.ts')
const { advanceDrive, arrivalSpeedLimit } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)

for (const fps of [15, 30, 60, 144]) {
  for (const timeScale of [1, 200, 4000]) {
    let speed = 1
    let distance = 0
    let elapsed = 0
    while (speed > 0 && elapsed < 5) {
      const next = advanceDrive(speed, 0, 1 / fps)
      assert.ok(next.speed < speed && next.speed >= 0)
      assert.ok(next.distance > 0, 'braking must coast, not freeze movement')
      speed = next.speed
      distance += next.distance * timeScale
      elapsed += 1 / fps
    }
    assert.ok(Math.abs(elapsed - 2.5) <= 1 / fps + 1e-7)
    assert.ok(Math.abs(distance / timeScale - 1.25) < 1e-7, 'stopping distance must be frame-rate independent')
    assert.deepEqual(advanceDrive(speed, 0, 10), { speed: 0, distance: 0 }, 'pause must remain stationary')

    // Resume from standstill and also reverse a pause while still braking.
    const resume = advanceDrive(speed, 1, 1 / fps)
    assert.ok(resume.speed > 0 && resume.speed < 0.1, 'resume must not jump to cruise speed')
    const interrupted = advanceDrive(0.4, 1, 1 / fps)
    assert.ok(interrupted.speed > 0.4 && interrupted.speed < 0.5)
  }
}
assert.deepEqual(advanceDrive(0.7, 0, 0), { speed: 0.7, distance: 0 }, 'hidden-tab time must not advance motion')

for (const scale of [1, 200, 4000]) {
  let remaining = 10 * scale
  let speed = 1
  let slowFrames = 0
  for (let frame = 0; frame < 60 * 60 && remaining > 0.01; frame++) {
    const target = Math.min(1, arrivalSpeedLimit(remaining, scale, speed, 1 / 60))
    const motion = advanceDrive(speed, target, 1 / 60)
    speed = motion.speed
    remaining = Math.max(0, remaining - motion.distance * scale)
    if (speed < 0.5) slowFrames++
  }
  assert.ok(remaining <= 0.01, 'arrival must finish without stalling short')
  assert.ok(speed < 0.08, 'arrival must decelerate before the endpoint')
  assert.ok(slowFrames > 30, 'arrival braking must be visibly gradual')
}

const storeSource = await readFile(new URL('../src/store/driveStore.ts', import.meta.url), 'utf8')
const storeModule = await transformWithOxc(storeSource, 'driveStore.ts')
const storeCode = storeModule.code.replace(/(['"])zustand\1/g, JSON.stringify(import.meta.resolve('zustand')))
const { useDriveStore } = await import(`data:text/javascript;base64,${Buffer.from(storeCode).toString('base64')}`)
useDriveStore.getState().start()
useDriveStore.getState().update({ loading: false, speedMps: 1 })
useDriveStore.getState().togglePause()
assert.equal(useDriveStore.getState().paused, true)
assert.equal(useDriveStore.getState().braking, true)
assert.equal(useDriveStore.getState().speedMps, 1, 'Pause must request braking, not zero the speed')
useDriveStore.getState().togglePause()
assert.equal(useDriveStore.getState().paused, false)
assert.equal(useDriveStore.getState().braking, false)
useDriveStore.getState().stop()
assert.equal(useDriveStore.getState().active, true, 'Stop must keep the drive alive until it has braked')
assert.equal(useDriveStore.getState().stopRequested, true)
useDriveStore.getState().togglePause()
assert.equal(useDriveStore.getState().paused, false, 'Pause must not override a committed stop')
useDriveStore.getState().end()
assert.equal(useDriveStore.getState().speedMps, 0)
assert.equal(useDriveStore.getState().braking, false)
assert.equal(useDriveStore.getState().active, false)
console.log('Passed: gradual braking, frame-rate-independent coasting, stationary pause, gradual resume, interrupted braking, fast-traverse timing.')
