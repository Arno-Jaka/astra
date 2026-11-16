import { Cartesian3 } from 'cesium'
import { WHEEL_CONTACTS } from './roverContact'
import type { VehicleKind } from './taskAssignment'

// Full asset bounds after its root quaternion and Cesium's Y-up/Z-forward conversion.
// A conservative lower hull envelope; this asset does not provide named wheel nodes.
export const SEV_BOUNDS = { minX: -3.354891, maxX: 2.555131, minY: -2.019201, maxY: 2.019201, bottomZ: -2.242131 }
export const SEV_CONTACTS = Array.from({ length: 13 }, (_, row) =>
  Array.from({ length: 13 }, (_, col) => new Cartesian3(
    SEV_BOUNDS.minX + (SEV_BOUNDS.maxX - SEV_BOUNDS.minX) * row / 12,
    SEV_BOUNDS.minY + (SEV_BOUNDS.maxY - SEV_BOUNDS.minY) * col / 12,
    SEV_BOUNDS.bottomZ,
  )),
).flat()
export const vehicleModel = (kind: VehicleKind) => kind === 'sev' ? {
  url: new URL('../3D _assets/Space Exploration Vehicle.glb', import.meta.url).href,
  contacts: SEV_CONTACTS, cameraScale: 1.6, aimHeight: 2.0,
} : {
  url: '/models/perseverance.glb', contacts: WHEEL_CONTACTS, cameraScale: 1, aimHeight: 1.15,
}

/** In-flight prefetches, keyed by model URL. */
const prefetched = new Map<string, Promise<Uint8Array | null>>()

/**
 * Warm the vehicle GLB before the user presses start and return the same
 * bytes the simulation hands to Cesium. Sharing one request avoids a
 * second multi-megabyte download while the first one is still in flight.
 * A failed request is forgotten so a later start can retry.
 */
export function prefetchVehicleModel(kind: VehicleKind): Promise<Uint8Array | null> {
  const { url } = vehicleModel(kind)
  const existing = prefetched.get(url)
  if (existing) return existing

  const request = fetch(url, { cache: 'force-cache' })
    .then((response) => (response.ok ? response.arrayBuffer() : null))
    .then((buffer) => (buffer ? new Uint8Array(buffer) : null))
    .catch(() => {
      prefetched.delete(url)
      return null
    })
  prefetched.set(url, request)
  return request
}
