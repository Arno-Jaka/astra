// Verifies the simulated-weather engine and runtime store without a browser.
// Covers the event profiles, intensity envelope, wind/lean/tint bounds,
// deterministic region-biased event selection, and auto-cycle behaviour.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transformWithOxc } from 'vite'

async function moduleUrl(path, imports = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  let { code } = await transformWithOxc(source, path)
  for (const [name, url] of Object.entries(imports)) {
    code = code.replaceAll(`'${name}'`, JSON.stringify(url)).replaceAll(`"${name}"`, JSON.stringify(url))
  }
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
}

const engineUrl = await moduleUrl('../src/store/weatherEngine.ts')
const engine = await import(engineUrl)
const storeUrl = await moduleUrl('../src/store/weatherStore.ts', {
  zustand: import.meta.resolve('zustand'),
  './weatherEngine': engineUrl,
})
const { useWeatherStore, weatherElapsedS } = await import(storeUrl)

const KINDS = ['clear', 'sandstorm', 'dust-tornado', 'electrostatic', 'ice-squall', 'ice-fog']
const UNSAFE = new Set(['sandstorm', 'dust-tornado', 'electrostatic', 'ice-squall'])

assert.deepEqual(Object.keys(engine.WEATHER_PROFILES).sort(), [...KINDS].sort())
assert.equal(engine.WEATHER_ENTITY_PREFIX, 'astra-weather-')

for (const kind of KINDS) {
  const profile = engine.WEATHER_PROFILES[kind]
  assert.ok(profile.durationS > 0, `${kind} has a duration`)
  assert.ok(profile.fadeInS >= 0 && profile.fadeInS < profile.durationS,
    `${kind} fade-in fits the duration`)
  assert.ok(profile.fadeOutS >= 0 && profile.fadeOutS < profile.durationS,
    `${kind} fade-out fits the duration`)
  assert.ok(profile.peakWindMps >= 0, `${kind} wind is non-negative`)
  assert.ok(profile.dustIndex >= 0 && profile.dustIndex <= 1, `${kind} dust is 0-1`)
  assert.ok(profile.visibilityM > 0, `${kind} has a visibility`)
  assert.ok(profile.assetEffect.length > 10, `${kind} describes its asset effect`)
}

// Clear is a calm background state; the other events ramp in and out.
assert.equal(engine.weatherIntensity('clear', 10), 0)
for (const kind of KINDS.filter((kind) => kind !== 'clear')) {
  const profile = engine.WEATHER_PROFILES[kind]
  assert.equal(engine.weatherIntensity(kind, 0), 0, `${kind} starts calm`)
  assert.ok(engine.weatherIntensity(kind, profile.durationS / 2) > 0.4,
    `${kind} is visible mid-event`)
  assert.equal(engine.weatherIntensity(kind, profile.durationS + 1), 0,
    `${kind} ends calm`)
  for (let elapsed = 0; elapsed <= profile.durationS + 2; elapsed += 0.5) {
    const intensity = engine.weatherIntensity(kind, elapsed)
    assert.ok(intensity >= 0 && intensity <= 1, `${kind} intensity stays 0-1`)
    const wind = engine.weatherWindMps(kind, elapsed)
    assert.ok(wind >= 0 && wind <= profile.peakWindMps + 1e-9,
      `${kind} wind stays within peak`)
    const dust = engine.weatherDustIndex(kind, elapsed)
    assert.ok(dust >= 0 && dust <= 1, `${kind} dust stays 0-1`)
    const lean = engine.weatherLeanRad(kind, elapsed)
    assert.ok(lean >= 0 && lean <= 0.0950001, `${kind} lean stays bounded`)
    const tint = engine.weatherTint(kind, elapsed)
    assert.equal(tint.color.length, 3)
    assert.ok(tint.amount >= 0 && tint.amount <= 0.55, `${kind} tint stays bounded`)
    for (const channel of tint.color) {
      assert.ok(channel >= 0 && channel <= 1, `${kind} tint channel is 0-1`)
    }
  }
}
assert.ok(engine.weatherLeanRad('sandstorm', 14) > 0.01, 'sandstorm leans the crew')
assert.equal(engine.weatherTint('clear', 5).amount, 0, 'clear has no asset wash')

// Event selection is deterministic per seed and biased by screening class.
const seeds = Array.from({ length: 64 }, (_, index) => engine.nextSeed(index * 7919))
assert.equal(engine.pickWeather('caution', seeds[0]), engine.pickWeather('caution', seeds[0]))
assert.notEqual(engine.nextSeed(123), 123)
for (const seed of seeds) {
  assert.ok(KINDS.includes(engine.pickWeather('safe', seed)), 'safe pick is a known event')
  assert.ok(KINDS.includes(engine.pickWeather('caution', seed)), 'caution pick is a known event')
  assert.ok(KINDS.includes(engine.pickWeather('unsafe', seed)), 'unsafe pick is a known event')
  assert.ok(UNSAFE.has(engine.pickWeather('unsafe', seed)), 'unsafe regions only get hard weather')
  assert.notEqual(engine.pickWeather('unsafe', seed), 'clear', 'unsafe regions never open clear')
}

// Safe regions are never weather-less: every event remains reachable even though
// the weather is visual-only and never gates traversal. A wider seed sweep keeps
// this from depending on one lucky draw.
const safeKinds = new Set()
for (let index = 0; index < 512; index++) {
  safeKinds.add(engine.pickWeather('safe', engine.nextSeed(index * 104729)))
}
for (const kind of KINDS) {
  assert.ok(safeKinds.has(kind), `safe regions can still show ${kind}`)
}

// Store: initial dramatic event, region focus, manual advance and auto-cycle.
const store = useWeatherStore
const initial = store.getState()
assert.equal(initial.kind, 'sandstorm')
assert.equal(initial.auto, true)
assert.equal(weatherElapsedS(initial.startedAt, initial.startedAt - 50), 0)

store.getState().setFocus('gale', 'safe', 1_000)
const focused = store.getState()
assert.equal(focused.focusId, 'gale')
assert.equal(focused.classification, 'safe')
assert.ok(KINDS.includes(focused.kind), 'safe focus picks a known event')
assert.equal(focused.startedAt, 1_000)

store.getState().setFocus('gale', 'safe', 2_000)
assert.equal(store.getState().startedAt, 1_000, 're-selecting the same focus does not re-roll')

store.getState().setFocus('olympus', 'unsafe', 3_000)
assert.equal(store.getState().focusId, 'olympus')
assert.equal(store.getState().classification, 'unsafe')
assert.ok(UNSAFE.has(store.getState().kind), 'unsafe focus biases hard weather')

const beforeManual = store.getState()
store.getState().next(4_000)
const afterManual = store.getState()
assert.equal(afterManual.startedAt, 4_000, 'manual advance resets the clock')
assert.notEqual(afterManual.seed, beforeManual.seed, 'manual advance rolls a fresh seed')
assert.ok(UNSAFE.has(afterManual.kind))

store.getState().setAuto(false)
const frozenAt = store.getState().startedAt
const frozenKind = store.getState().kind
store.getState().tick(frozenAt + engine.WEATHER_PROFILES[frozenKind].durationS * 1000 + 500)
assert.equal(store.getState().startedAt, frozenAt, 'paused auto-cycle keeps the event')
assert.equal(store.getState().kind, frozenKind)

store.getState().setAuto(true)
store.getState().tick(frozenAt + engine.WEATHER_PROFILES[frozenKind].durationS * 1000 + 500)
const cycled = store.getState()
assert.notEqual(cycled.startedAt, frozenAt, 'auto-cycle advances after the duration')
assert.ok(UNSAFE.has(cycled.kind), 'auto-cycle keeps the focused region bias')

console.log('Passed: weather profiles, intensity bounds, tint/lean, region bias, auto-cycle.')
