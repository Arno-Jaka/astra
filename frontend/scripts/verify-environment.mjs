// Verifies the frontend weather/radiation store: schema, load, selection,
// visibility toggle and failure handling. No running backend required.
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

const imports = {
  zustand: import.meta.resolve('zustand'),
  zod: import.meta.resolve('zod'),
}
const storeUrl = await moduleUrl('../src/store/environmentStore.ts', imports)
const metaUrl = await moduleUrl('../src/store/environmentMeta.ts')
const meta = await import(metaUrl)
const { useEnvironmentStore, environmentResponseSchema } = await import(storeUrl)

const MSL_SOURCE_URL = process.env.MSL_SOURCE_URL || 'https://science.nasa.gov/mission/msl-curiosity/'

const zone = {
  id: 'gale',
  name: 'Gale Crater',
  lon: 137.81,
  lat: -5.37,
  radius_km: 90,
  elevation_m: -4400,
  science_value: 'high',
  scenic: 'Layered Mount Sharp and ancient lakebeds.',
  classification: 'safe',
  weather: {
    classification: 'safe',
    dust_index: 0.41,
    min_temp_c: -51,
    max_temp_c: 15,
    note: 'Derived from latitude and regional elevation; not a dust-storm forecast.',
  },
  radiation: {
    classification: 'safe',
    surface_dose_msv_day: 0.64,
    note: 'Scaled from the Curiosity RAD surface average; not a measured dose for this spot.',
  },
  basis: 'derived',
  source_url: MSL_SOURCE_URL,
  note: 'Regional screening only. Terrain/slope suitability is assessed separately.',
}

const payload = {
  zones: [zone, { ...zone, id: 'olympus', name: 'Olympus Mons', classification: 'unsafe' }],
  basis: 'derived',
  note: 'Illustrative regional weather/radiation screening; not a measured dose.',
  radiation_source_url: MSL_SOURCE_URL,
  weather_source_url: MSL_SOURCE_URL,
}

assert.equal(environmentResponseSchema.safeParse(payload).success, true)
assert.equal(environmentResponseSchema.safeParse({}).success, false)
assert.equal(environmentResponseSchema.safeParse({ ...payload, zones: [{ ...zone, classification: 'great' }] }).success, false)

for (const level of meta.ENVIRONMENT_LEVELS) {
  assert.ok(meta.ENVIRONMENT_COLORS[level], `missing colour for ${level}`)
  assert.ok(meta.ENVIRONMENT_LABELS[level], `missing label for ${level}`)
}
assert.deepEqual(meta.ENVIRONMENT_LEVELS, ['safe', 'caution', 'unsafe'])

const previousFetch = globalThis.fetch
try {
  globalThis.fetch = async () => new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
  await useEnvironmentStore.getState().load()
  const loaded = useEnvironmentStore.getState()
  assert.equal(loaded.loading, false)
  assert.equal(loaded.error, null)
  assert.equal(loaded.zones.length, 2)
  assert.equal(loaded.note, payload.note)
  assert.equal(loaded.radiationSourceUrl, payload.radiation_source_url)
  assert.ok(useEnvironmentStore.getState().visible, 'overlay is visible by default')

  useEnvironmentStore.getState().select('olympus')
  assert.equal(useEnvironmentStore.getState().selectedId, 'olympus')
  useEnvironmentStore.getState().toggleVisible()
  assert.equal(useEnvironmentStore.getState().visible, false)
  useEnvironmentStore.getState().toggleVisible()
  assert.equal(useEnvironmentStore.getState().visible, true)

  globalThis.fetch = async () => new Response('unavailable', { status: 503 })
  await useEnvironmentStore.getState().load(true)
  const failed = useEnvironmentStore.getState()
  assert.equal(failed.loading, false)
  assert.match(failed.error ?? '', /503/)
  // A failed refresh keeps the last good screening on screen.
  assert.equal(failed.zones.length, 2)
} finally {
  globalThis.fetch = previousFetch
}

console.log('Passed: environment schema, load, selection, toggle and failure handling.')
