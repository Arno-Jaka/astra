import {
  Cartesian2,
  Cartesian3,
  Color,
  DistanceDisplayCondition,
  HeightReference,
  NearFarScalar,
  VerticalOrigin,
  type Viewer,
} from 'cesium'
import { SCIENCE_META } from './scienceExperiments'
import { siteLabel, type ScienceSite } from './scienceSites'
import { MARS } from './trek'

/** Entity-id prefix so the map can pick a science marker unambiguously. */
export const SCIENCE_ENTITY_PREFIX = 'astra-science-'

/**
 * Markers are revealed once the camera is close enough to be looking at a
 * route, vehicle or crew rather than the whole globe. At planetary zoom the
 * surface is deliberately unmarked.
 */
const SCIENCE_REVEAL_M = 600_000

/** Remove every science marker (restyle, route clear, or teardown). */
export function destroyScienceFx(viewer: Viewer) {
  if (viewer.isDestroyed()) return
  for (const entity of [...viewer.entities.values]) {
    if (typeof entity.id === 'string' && entity.id.startsWith(SCIENCE_ENTITY_PREFIX)) {
      viewer.entities.remove(entity)
    }
  }
}

/**
 * Draw one ring, point and label per science site. Idempotent: call it whenever
 * the site list, active site or completed log changes. There are at most ten
 * sites, so a full redraw keeps active/done styling simple and avoids
 * per-property mutation on live entities.
 */
export function syncScienceFx(
  viewer: Viewer,
  sites: ScienceSite[],
  activeSiteId: string | null,
  doneIds: Set<string>,
) {
  if (viewer.isDestroyed()) return
  destroyScienceFx(viewer)
  for (const site of sites) {
    const active = site.id === activeSiteId
    const done = doneIds.has(site.id)
    const color = done ? Color.fromCssColorString('#94a3b8') : Color.fromCssColorString(SCIENCE_META[site.kind].color)
    const fill = done ? Color.fromCssColorString('#64748b') : color
    viewer.entities.add({
      id: `${SCIENCE_ENTITY_PREFIX}${site.id}`,
      position: Cartesian3.fromDegrees(site.lon, site.lat, 0, MARS),
      ellipse: {
        semiMajorAxis: active ? 6.5 : 4.5,
        semiMinorAxis: active ? 6.5 : 4.5,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        material: fill.withAlpha(active ? 0.28 : done ? 0.08 : 0.16),
        outline: true,
        outlineColor: fill.withAlpha(done ? 0.4 : 0.85),
        outlineWidth: active ? 3 : 1.5,
        distanceDisplayCondition: new DistanceDisplayCondition(0, SCIENCE_REVEAL_M),
      },
      point: {
        pixelSize: active ? 13 : done ? 7 : 9,
        color: fill.withAlpha(done ? 0.55 : 1),
        outlineColor: Color.BLACK,
        outlineWidth: 2,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        distanceDisplayCondition: new DistanceDisplayCondition(0, SCIENCE_REVEAL_M),
      },
      label: {
        text: `${done ? '✓ ' : ''}${siteLabel(site)}`,
        font: '600 11px sans-serif',
        fillColor: color,
        showBackground: true,
        backgroundColor: Color.fromCssColorString('#001018d9'),
        pixelOffset: new Cartesian2(0, -17),
        verticalOrigin: VerticalOrigin.BOTTOM,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        distanceDisplayCondition: new DistanceDisplayCondition(0, SCIENCE_REVEAL_M),
        scaleByDistance: new NearFarScalar(40, 1, 120_000, 0.7),
      },
    })
  }
}

/** Extract the site id from a picked entity, if it is a science marker. */
export function scienceSiteIdOf(entity: unknown): string | null {
  if (!entity || typeof entity !== 'object') return null
  const id = (entity as { id?: unknown }).id
  if (typeof id === 'string' && id.startsWith(SCIENCE_ENTITY_PREFIX)) {
    return id.slice(SCIENCE_ENTITY_PREFIX.length)
  }
  if (typeof id === 'object' && id) {
    const nested = (id as { id?: unknown }).id
    if (typeof nested === 'string' && nested.startsWith(SCIENCE_ENTITY_PREFIX)) {
      return nested.slice(SCIENCE_ENTITY_PREFIX.length)
    }
  }
  return null
}
