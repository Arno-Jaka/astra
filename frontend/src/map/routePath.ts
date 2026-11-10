import type { RouteChoice, RouteData } from '../store/appStore'

/** Minimal shape both the primary and hazardous traverses satisfy. */
export type TraversableRoute = {
  coordinates: [number, number][]
  profile: {
    distance_km: number
    elevation_m: number | null
    grade_deg: number | null
  }[]
  distance_km: number
}

export type RouteSample = {
  /** Interpolated longitude (degrees East). */
  lon: number
  /** Interpolated latitude (degrees). */
  lat: number
  /** Route-profile elevation at the sample (metres, MOLA areoid datum). */
  elevationM: number
  /** Along-route distance at the sample (kilometres). */
  distanceKm: number
  /** Route-profile grade at the sample (degrees). */
  gradeDeg: number
  /** Initial bearing of the route segment at the sample (radians, 0 = north). */
  bearing: number
}

/**
 * Great-circle bearing from point 1 to point 2, in radians (0 = north,
 * clockwise). Matches the compass convention used by the camera chase logic.
 */
export function bearingRad(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
): number {
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const deltaLon = ((lon2 - lon1) * Math.PI) / 180
  return Math.atan2(
    Math.sin(deltaLon) * Math.cos(phi2),
    Math.cos(phi1) * Math.sin(phi2) -
      Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLon),
  )
}

/**
 * Wrap an angle in radians to (-pi, pi]. Used for smooth heading rotation
 * without spinning through long way around.
 */
export function wrapPi(angle: number): number {
  const twoPi = Math.PI * 2
  return (((angle % twoPi) + twoPi + Math.PI) % twoPi) - Math.PI
}

export function totalDistanceKm(route: TraversableRoute): number {
  return route.profile[route.profile.length - 1]?.distance_km ?? 0
}

/**
 * The traverse the scrubber and scout simulation should follow: the safe
 * (primary) route, or the hazardous direct route when one exists and the
 * user selected it. Returns null when a hazardous route was requested but
 * the planner did not produce one.
 */
export function selectTraverse(
  route: RouteData,
  choice: RouteChoice,
): TraversableRoute | null {
  if (choice === 'hazardous') {
    const hazardous = route.hazardous
    if (!hazardous) return null
    return {
      coordinates: hazardous.coordinates,
      profile: hazardous.profile,
      distance_km: hazardous.distance_km,
    }
  }
  return {
    coordinates: route.coordinates,
    profile: route.profile,
    distance_km: route.distance_km,
  }
}

/**
 * Sample the route at fraction `t` (0-1) of its total distance. Interpolates
 * lon/lat/elevation/grade linearly between the two nearest profile points,
 * exactly like the scout simulation, so the preview marker, the scrubber
 * readout, the elevation chart, and the animated rover all agree.
 */
export function sampleRoute(
  route: TraversableRoute,
  t: number,
): RouteSample {
  const clamped = Math.min(1, Math.max(0, t))
  const totalKm = totalDistanceKm(route)
  const targetKm = totalKm * clamped
  const pointCount = route.coordinates.length

  let index = 1
  while (
    index < route.profile.length - 1 &&
    (route.profile[index]?.distance_km ?? 0) < targetKm
  ) {
    index += 1
  }

  const i1 = Math.min(index, pointCount - 1)
  const i0 = Math.max(0, i1 - 1)
  const d0 = route.profile[i0]?.distance_km ?? 0
  const d1 = route.profile[i1]?.distance_km ?? d0
  const f =
    d1 > d0 ? Math.min(1, Math.max(0, (targetKm - d0) / (d1 - d0))) : 0

  const [lon0, lat0] = route.coordinates[i0] ?? [0, 0]
  const [lon1, lat1] = route.coordinates[i1] ?? [lon0, lat0]
  const e0 = route.profile[i0]?.elevation_m ?? 0
  const e1 = route.profile[i1]?.elevation_m ?? e0
  const g0 = route.profile[i0]?.grade_deg ?? 0
  const g1 = route.profile[i1]?.grade_deg ?? g0

  return {
    lon: lon0 + (lon1 - lon0) * f,
    lat: lat0 + (lat1 - lat0) * f,
    elevationM: e0 + (e1 - e0) * f,
    distanceKm: targetKm,
    gradeDeg: g0 + (g1 - g0) * f,
    bearing: bearingRad(lon0, lat0, lon1, lat1),
  }
}
