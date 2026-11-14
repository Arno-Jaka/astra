import type { EnvironmentLevel, EnvironmentZone } from '../store/environmentStore'
import { SCIENCE_KINDS, SCIENCE_META, type ScienceKind } from './scienceExperiments'
import { sampleRoute, totalDistanceKm, type RouteSample, type TraversableRoute } from './routePath'

/** Metres of latitude on Mars ((pi/180) * 3_396_190 m). */
const METERS_PER_DEG = 59_238

/** On-foot radius for moving the crew between nearby science targets. */
export const SCIENCE_NEARBY_M = 160

export type ScienceSite = {
  id: string
  kind: ScienceKind
  lon: number
  lat: number
  /** Along-route distance of the site (km). */
  alongKm: number
  /** Signed lateral offset from the route (m); always non-zero. */
  sideM: number
  /** Where the vehicle parks relative to the route (m). */
  parkSideM: number
  /** Nearest named region, or a route-distance label. */
  region: string
  /** Regional screening classification, when a mapped zone is close enough. */
  safety: EnvironmentLevel | 'unknown'
  /** Deterministic seed for the experiment result. */
  seed: number
}

export type LonLat = { lon: number; lat: number }

function hashString(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

/** Offset a route point by metres along the bearing and to its right. */
export function offsetLonLat(lon: number, lat: number, bearing: number, alongM: number, sideM: number): LonLat {
  const cosLat = Math.max(0.1, Math.cos((lat * Math.PI) / 180))
  return {
    lon: lon + (Math.sin(bearing) * alongM + Math.cos(bearing) * sideM) / (METERS_PER_DEG * cosLat),
    lat: lat + (Math.cos(bearing) * alongM - Math.sin(bearing) * sideM) / METERS_PER_DEG,
  }
}

/** Offset a sampled route point, keeping the route's grade/bearing metadata. */
export function offsetRouteSample(sample: RouteSample, sideM: number, alongM = 0): RouteSample {
  const point = offsetLonLat(sample.lon, sample.lat, sample.bearing, alongM, sideM)
  return { ...sample, lon: point.lon, lat: point.lat }
}

/** Great-circle distance in metres (adequate over the short science offsets). */
export function distanceMeters(a: LonLat, b: LonLat): number {
  const toRad = Math.PI / 180
  const dLat = (b.lat - a.lat) * toRad
  const dLon = (b.lon - a.lon) * toRad
  const lat1 = a.lat * toRad
  const lat2 = b.lat * toRad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * 3_396_190 * Math.asin(Math.min(1, Math.sqrt(h)))
}

function nearestZone(lon: number, lat: number, zones: EnvironmentZone[]) {
  let best: EnvironmentZone | null = null
  let bestKm = Number.POSITIVE_INFINITY
  for (const zone of zones) {
    const km = distanceMeters({ lon, lat }, zone) / 1000
    if (km < bestKm) {
      bestKm = km
      best = zone
    }
  }
  return { zone: best, km: bestKm }
}

type Cluster = {
  t: number
  region: string
  safety: EnvironmentLevel | 'unknown'
}

/**
 * Scatter deterministic, off-route science sites along a crew-safe traverse.
 * Clusters are anchored to nearby mapped Mars regions and filled out with
 * route-spaced clusters, so a stop feels concentrated rather than uniformly
 * sprinkled. Sites always sit a few metres to the side of the route, forcing a
 * short vehicle detour and a short crew walk.
 */
export function planScienceSites(
  route: TraversableRoute,
  zones: EnvironmentZone[],
  maxAlongM?: number,
): ScienceSite[] {
  const totalKm = totalDistanceKm(route)
  const totalM = totalKm * 1000
  if (!Number.isFinite(totalM) || totalM < 120) return []
  const limitM = clamp(maxAlongM ?? totalM - 60, 80, totalM - 30)
  if (limitM < 120) return []

  const first = route.coordinates[0] ?? [0, 0]
  const last = route.coordinates[route.coordinates.length - 1] ?? first
  const seed = hashString(`${first[0].toFixed(5)}:${first[1].toFixed(5)}:${last[0].toFixed(5)}:${last[1].toFixed(5)}:${Math.round(totalKm * 100)}`)
  const random = mulberry32(seed)
  const limitT = limitM / totalM

  const clusters: Cluster[] = []
  // 1. Anchor clusters at mapped Mars regions the route passes close to.
  for (const zone of zones) {
    let bestT = 0
    let bestKm = Number.POSITIVE_INFINITY
    for (let step = 1; step <= 60; step++) {
      const t = (step / 60) * limitT
      const sample = sampleRoute(route, t)
      const km = distanceMeters(sample, zone) / 1000
      if (km < bestKm) {
        bestKm = km
        bestT = t
      }
    }
    if (bestKm <= Math.max(90, zone.radius_km * 1.6) && bestT > 0.02) {
      clusters.push({ t: bestT, region: zone.name, safety: zone.classification })
    }
  }
  // 2. Fill out the route with spaced clusters when too few named regions fit.
  const clusterTarget = totalKm > 60 ? 4 : totalKm > 15 ? 3 : 2
  const slots = [0.2, 0.38, 0.56, 0.74, 0.88]
  for (let index = 0; clusters.length < clusterTarget && index < slots.length; index++) {
    const t = clamp(slots[index] * limitT + (random() - 0.5) * 0.04, 0.035, limitT - 0.02)
    if (clusters.some(cluster => Math.abs(cluster.t - t) < 0.045)) continue
    const sample = sampleRoute(route, t)
    const near = nearestZone(sample.lon, sample.lat, zones)
    const mapped = near.zone && near.km <= Math.max(90, near.zone.radius_km * 1.6) ? near.zone : null
    clusters.push({
      t,
      region: mapped?.name ?? `Route km ${(t * totalKm).toFixed(1)}`,
      safety: mapped?.classification ?? 'unknown',
    })
  }
  clusters.sort((a, b) => a.t - b.t)

  const sites: ScienceSite[] = []
  let index = 0
  for (const cluster of clusters) {
    const count = 2 + (random() < 0.35 ? 1 : 0)
    for (let member = 0; member < count; member++) {
      // Keep a cluster walkable on foot: neighbouring sites sit 55-100 m
      // apart along the route, so they stay inside the nearby-move radius
      // even after their opposite-side offsets are added.
      const spread = (member - (count - 1) / 2) * (55 + random() * 45)
      const alongM = clamp(cluster.t * totalM + spread, 35, limitM - 10)
      // Avoid two sites landing on top of each other after clamping.
      if (sites.some(site => Math.abs(site.alongKm * 1000 - alongM) < 25)) continue
      const sample = sampleRoute(route, alongM / totalM)
      const sideM = (member % 2 === 0 ? 1 : -1) * (9 + random() * 20)
      const point = offsetLonLat(sample.lon, sample.lat, sample.bearing, 0, sideM)
      const kind = SCIENCE_KINDS[Math.floor(index + cluster.t * 17) % SCIENCE_KINDS.length] ?? 'rad'
      sites.push({
        id: `sci-${seed.toString(36)}-${index}`,
        kind,
        lon: point.lon,
        lat: point.lat,
        alongKm: alongM / 1000,
        sideM,
        parkSideM: Math.sign(sideM) * Math.max(2, Math.abs(sideM) - 5.5),
        region: cluster.region,
        safety: cluster.safety,
        seed: seed ^ Math.imul(index + 1, 0x85ebca6b) ^ Math.round(alongM),
      })
      index += 1
      if (sites.length >= 10) break
    }
    if (sites.length >= 10) break
  }
  return sites.sort((a, b) => a.alongKm - b.alongKm)
}

/** Human label for a site, e.g. "LIBS · Gale Crater". */
export function siteLabel(site: ScienceSite): string {
  return `${SCIENCE_META[site.kind].short} · ${site.region}`
}
