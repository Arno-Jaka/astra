import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transformWithOxc } from 'vite'

async function moduleUrl(path, imports = {}) {
  let { code } = await transformWithOxc(await readFile(new URL(path, import.meta.url), 'utf8'), path)
  for (const [name, url] of Object.entries(imports)) {
    code = code.replaceAll(`'${name}'`, JSON.stringify(url)).replaceAll(`"${name}"`, JSON.stringify(url))
  }
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
}

const routePathUrl = await moduleUrl('../src/map/routePath.ts')
const experimentsUrl = await moduleUrl('../src/map/scienceExperiments.ts')
const sitesUrl = await moduleUrl('../src/map/scienceSites.ts', {
  './routePath': routePathUrl,
  './scienceExperiments': experimentsUrl,
})

const experiments = await import(experimentsUrl)
const sites = await import(sitesUrl)
const routePath = await import(routePathUrl)

const {
  SCIENCE_KINDS,
  SCIENCE_META,
  scienceResult,
  scienceCsv,
} = experiments
const {
  planScienceSites,
  offsetLonLat,
  offsetRouteSample,
  distanceMeters,
  siteLabel,
  SCIENCE_NEARBY_M,
} = sites
const { sampleRoute, totalDistanceKm } = routePath

/** A smooth 6 km east-north traverse with 0.5 km profile points. */
function makeRoute(km = 6) {
  const steps = Math.round(km * 2)
  const coordinates = []
  const profile = []
  for (let index = 0; index <= steps; index++) {
    const along = (km * index) / steps
    coordinates.push([0.01 + along * 0.005, 0.02 + along * 0.009])
    profile.push({ distance_km: along, elevation_m: 100 + along * 0.4, grade_deg: 2 })
  }
  return { distance_km: km, coordinates, profile }
}

const route = makeRoute()
const zones = [
  {
    id: 'safe-1', name: 'Jezero Crater', lon: 0.02, lat: 0.038, radius_km: 40,
    elevation_m: 0, science_value: 'high', scenic: 'delta', classification: 'safe',
    weather: { classification: 'safe' }, radiation: { classification: 'safe' }, basis: '', source_url: '', note: '',
  },
  {
    id: 'caution-1', name: 'Nili Fossae', lon: 0.036, lat: 0.06, radius_km: 35,
    elevation_m: 0, science_value: 'high', scenic: 'troughs', classification: 'caution',
    weather: { classification: 'caution' }, radiation: { classification: 'caution' }, basis: '', source_url: '', note: '',
  },
]

// ---- Experiment catalogue -------------------------------------------------
assert.deepEqual([...SCIENCE_KINDS], ['rad', 'libs', 'isotope', 'moxie'])
for (const kind of SCIENCE_KINDS) {
  const meta = SCIENCE_META[kind]
  assert.ok(meta.label && meta.short && meta.category && meta.color)
  assert.ok(meta.durationS > 0 && meta.durationS <= 30)
}

// ---- Site planning is deterministic and off-route -------------------------
const first = planScienceSites(route, zones)
const second = planScienceSites(route, zones)
assert.deepEqual(first, second, 'same route and zones must plan identical sites')
assert.ok(first.length > 0, 'a 6 km safe route should offer science sites')
assert.ok(first.length <= 10, `at most ten sites, got ${first.length}`)
assert.deepEqual(
  first.map(site => site.alongKm),
  [...first.map(site => site.alongKm)].sort((a, b) => a - b),
  'sites are ordered along the route',
)

const totalM = totalDistanceKm(route) * 1000
for (const site of first) {
  assert.ok(site.sideM !== 0, 'every site is off the centreline')
  assert.ok(Math.abs(site.sideM) >= 9 && Math.abs(site.sideM) <= 29,
    `side offset ${site.sideM.toFixed(1)} m stays in the short-detour band`)
  assert.ok(Math.sign(site.parkSideM) === Math.sign(site.sideM), 'vehicle parks on the site side')
  assert.ok(Math.abs(site.parkSideM) < Math.abs(site.sideM), 'vehicle stops short of the site')
  assert.ok(Math.abs(site.parkSideM) >= 2, 'vehicle leaves a short walk, not a zero-length stop')
  assert.ok(SCIENCE_KINDS.includes(site.kind))
  assert.ok(site.alongKm * 1000 >= 30 && site.alongKm * 1000 <= totalM - 20)

  const sample = sampleRoute(route, site.alongKm / (totalM / 1000))
  assert.ok(Math.abs(distanceMeters(sample, site) - Math.abs(site.sideM)) < 0.3,
    `site sits ${Math.abs(site.sideM).toFixed(1)} m off-route`)
  const rebuilt = offsetLonLat(sample.lon, sample.lat, sample.bearing, 0, site.sideM)
  assert.ok(distanceMeters(rebuilt, site) < 0.1, 'site position matches its side-offset definition')
  assert.ok(siteLabel(site).includes(SCIENCE_META[site.kind].short))
  assert.ok(site.region.length > 0)
  assert.ok(['safe', 'caution', 'unsafe', 'unknown'].includes(site.safety))
}

// Sites clustered near mapped zones pick up that region and screening level.
const named = first.filter(site => zones.some(zone => zone.name === site.region))
assert.ok(named.length > 0, 'at least one cluster anchors to a named Mars region')
assert.ok(named.every(site => site.safety === zones.find(zone => zone.name === site.region).classification))

// A cluster must contain at least one pair the crew can walk between.
const nearbyPair = first.some((site, index) =>
  first.slice(index + 1).some(other => distanceMeters(site, other) <= SCIENCE_NEARBY_M))
assert.ok(nearbyPair, 'a cluster offers an on-foot nearby target')

// A staging cap keeps every site before the crew's parking point.
const capped = planScienceSites(route, zones, 3000)
assert.ok(capped.length > 0)
assert.ok(capped.every(site => site.alongKm * 1000 <= 2990), 'no site beyond the staging limit')

// ---- Unsafe screening never offers a site to the crew ---------------------
const unsafeZone = {
  ...zones[0], id: 'unsafe-1', name: 'Unsafe Basin', lon: 0.03, lat: 0.05,
  radius_km: 200, classification: 'unsafe',
}
const unsafeSites = planScienceSites(route, [unsafeZone])
assert.ok(unsafeSites.length > 0)
assert.ok(unsafeSites.every(site => site.safety === 'unsafe'), 'regions classified unsafe mark every clustered site unsafe')
assert.ok(unsafeSites.every(site => site.safety !== 'safe'), 'unsafe sites are filtered from detour prompts and picks')

// ---- Deterministic experiment results and CSV -----------------------------
for (const kind of SCIENCE_KINDS) {
  const a = scienceResult(kind, 123456789)
  const b = scienceResult(kind, 123456789)
  assert.deepEqual(a, b, `${kind} result is deterministic per site seed`)
  assert.ok(a.headline.length > 0 && a.summary.length > 0)
  assert.ok(a.rows.length >= 4)
  assert.ok(a.rows.every(row => row.metric && row.unit && Number.isFinite(row.value)))
  assert.match(a.summary, /illustrative/i)
  assert.notDeepEqual(a, scienceResult(kind, 987654321), `${kind} result depends on the site seed`)
}

const startedAt = '2026-11-14T08:30:00.000Z'
const baseResult = scienceResult('libs', 42)
const entry = {
  id: 'log-1', siteId: 'sci-test-1', siteName: SCIENCE_META.libs.label, region: 'Gale Crater',
  kind: 'libs', lat: -4.5, lon: 137.4, startedAt, durationS: SCIENCE_META.libs.durationS,
  result: baseResult,
}
const csv = scienceCsv([entry])
const header = csv.split('\n')[0]
assert.equal(
  header,
  'started_at,site_id,site_name,region,experiment,category,latitude,longitude,metric,value,unit,duration_s,summary',
)
assert.equal(csv.split('\n').length, 1 + baseResult.rows.length, 'one CSV row per metric')
assert.ok(csv.includes('2026-11-14T08:30:00.000Z,sci-test-1'))
assert.ok(csv.includes('-4.500000,137.400000'))
assert.ok(csv.includes(SCIENCE_META.libs.category))
assert.ok(scienceCsv([]).split('\n').length === 1, 'empty log still exports the header')

const tricky = `A, "B"\nC`
const quoted = scienceCsv([{ ...entry, region: tricky, result: { ...baseResult, summary: 'said "go", then left' } }])
assert.ok(quoted.includes('"A, ""B""\nC"'), 'commas, quotes and newlines are CSV-escaped')

// ---- Small helpers --------------------------------------------------------
assert.equal(SCIENCE_NEARBY_M, 160)
const base = { lon: 12, lat: -3 }
const north = offsetLonLat(base.lon, base.lat, 0, 100, 0)
assert.ok(Math.abs(distanceMeters(base, north) - 100) < 0.2, 'along-offset uses metres')
const east = offsetLonLat(base.lon, base.lat, 0, 0, 100)
assert.ok(east.lon > base.lon && Math.abs(east.lat - base.lat) < 1e-9, 'positive side is to the right of the bearing')
const offsetSample = offsetRouteSample(sampleRoute(route, 0.5), 12)
assert.ok(Math.abs(distanceMeters(sampleRoute(route, 0.5), offsetSample) - 12) < 0.2)
assert.equal(offsetSample.distanceKm, sampleRoute(route, 0.5).distanceKm, 'offset keeps along-route metadata')

console.log('Passed: four deterministic experiments, off-route clustered sites, staging cap, unsafe screening, nearby-move radius, and quoted CSV export.')
