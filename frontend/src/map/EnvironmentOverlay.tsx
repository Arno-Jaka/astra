import { useEffect } from 'react'
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
import { useEnvironmentStore } from '../store/environmentStore'
import { ENVIRONMENT_COLORS, ENVIRONMENT_ENTITY_PREFIX } from '../store/environmentMeta'
import { MARS } from './trek'

const ENTITY_PREFIX = ENVIRONMENT_ENTITY_PREFIX

/**
 * Regional weather/radiation screening overlay: one translucent ellipse per
 * mapped zone, coloured by classification. This is a derived planning
 * screening, not a measured dose or dust map.
 */
export default function EnvironmentOverlay({ viewer }: { viewer: Viewer }) {
  const zones = useEnvironmentStore((state) => state.zones)
  const visible = useEnvironmentStore((state) => state.visible)
  const selectedId = useEnvironmentStore((state) => state.selectedId)

  useEffect(() => {
    if (viewer.isDestroyed() || !visible) return
    const ids: string[] = []
    for (const zone of zones) {
      const color = Color.fromCssColorString(ENVIRONMENT_COLORS[zone.classification])
      const selected = zone.id === selectedId
      const id = `${ENTITY_PREFIX}${zone.id}`
      viewer.entities.add({
        id,
        position: Cartesian3.fromDegrees(zone.lon, zone.lat, 0, MARS),
        ellipse: {
          semiMajorAxis: zone.radius_km * 1000,
          semiMinorAxis: zone.radius_km * 1000,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          material: color.withAlpha(selected ? 0.3 : 0.15),
          outline: true,
          outlineColor: color.withAlpha(selected ? 1 : 0.7),
          outlineWidth: selected ? 3 : 1.5,
        },
        point: {
          pixelSize: selected ? 10 : 7,
          color,
          outlineColor: Color.BLACK,
          outlineWidth: 1,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: `${zone.name} · ${zone.classification}`,
          font: '600 11px sans-serif',
          fillColor: color,
          showBackground: true,
          backgroundColor: Color.fromCssColorString('#0a0a0acc'),
          pixelOffset: new Cartesian2(0, -15),
          verticalOrigin: VerticalOrigin.BOTTOM,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new DistanceDisplayCondition(0, 6_000_000),
          scaleByDistance: new NearFarScalar(2.0e5, 1, 6.0e6, 0.75),
        },
      })
      ids.push(id)
    }
    return () => {
      if (viewer.isDestroyed()) return
      for (const id of ids) viewer.entities.removeById(id)
    }
  }, [viewer, zones, visible, selectedId])

  return null
}
