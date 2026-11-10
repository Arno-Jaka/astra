import { useEffect, useRef } from 'react'
import {
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Color,
  EllipsoidTerrainProvider,
  Globe,
  HeadingPitchRange,
  VerticalOrigin,
  Viewer,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import {
  briefingSchema,
  conditionsSchema,
  routeSchema,
  useAppStore,
} from '../store/appStore'
import { onCommand } from '../ws/commandChannel'
import { MARS, VIKING, createTrekProvider } from './trek'

const ROUTE_HEIGHT = 2500

export default function CesiumMap() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const viewer = new Viewer(containerRef.current, {
      baseLayer: false,
      globe: new Globe(MARS),
      terrainProvider: new EllipsoidTerrainProvider({ ellipsoid: MARS }),
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      selectionIndicator: false,
      infoBox: false,
      fullscreenButton: false,
    })

    viewer.imageryLayers.addImageryProvider(createTrekProvider(VIKING))

    viewer.scene.globe.showGroundAtmosphere = false
    viewer.scene.screenSpaceCameraController.enableCollisionDetection = false
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false

    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(77.7, 18.4, 10_000_000, MARS),
    })

    const unregister = onCommand('fly_to', async (payload) => {
      const lon = Number(payload.lon)
      const lat = Number(payload.lat)
      const height = Number(payload.height ?? 250_000)
      const duration = Number(payload.duration ?? 1.6)
      if (![lon, lat, height, duration].every(Number.isFinite)) {
        throw new Error('fly_to requires numeric lon/lat')
      }
      useAppStore.getState().clearSite()
      viewer.entities.removeById('astra-landing')
      await new Promise<void>((resolve) => {
        viewer.camera.flyTo({
          destination: Cartesian3.fromDegrees(lon, lat, height, MARS),
          duration,
          complete: () => resolve(),
          cancel: () => resolve(),
        })
      })
    })

    const unregisterConditions = onCommand('show_conditions', (payload) => {
      useAppStore.getState().setConditions(conditionsSchema.parse(payload))
    })

    const unregisterBriefing = onCommand('show_briefing', (payload) => {
      const briefing = briefingSchema.parse(payload)
      useAppStore.getState().setBriefing(briefing)
      viewer.entities.removeById('astra-landing')
      if (!briefing.landing) return
      viewer.entities.add({
        id: 'astra-landing',
        position: Cartesian3.fromDegrees(
          briefing.landing.lon,
          briefing.landing.lat,
          ROUTE_HEIGHT,
          MARS,
        ),
        point: {
          pixelSize: 9,
          color: Color.CYAN,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
        },
        label: {
          text: briefing.landing.name,
          font: '12px sans-serif',
          fillColor: Color.WHITE,
          showBackground: true,
          backgroundColor: Color.fromCssColorString('#000000aa'),
          pixelOffset: new Cartesian2(0, -18),
          verticalOrigin: VerticalOrigin.BOTTOM,
        },
      })
    })

    const unregisterRoute = onCommand('show_route', async (payload) => {
      const route = routeSchema.parse(payload)
      if (route.coordinates.length < 3) {
        throw new Error('show_route requires at least 3 points')
      }
      useAppStore.getState().setRoute(route)
      const flat = route.coordinates.flatMap(([lon, lat]) => [
        lon,
        lat,
        ROUTE_HEIGHT,
      ])

      const positions = Cartesian3.fromDegreesArrayHeights(flat, MARS)
      viewer.entities.removeById('astra-route')
      viewer.entities.removeById('astra-route-start')
      viewer.entities.removeById('astra-route-end')

      viewer.entities.add({
        id: 'astra-route',
        polyline: {
          positions,
          width: 6,
          material: Color.fromCssColorString('#ff8a3d'),
          clampToGround: false,
        },
      })
      viewer.entities.add({
        id: 'astra-route-start',
        position: positions[0],
        point: {
          pixelSize: 10,
          color: Color.LIME,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
        },
      })
      viewer.entities.add({
        id: 'astra-route-end',
        position: positions[positions.length - 1],
        point: {
          pixelSize: 10,
          color: Color.ORANGE,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
        },
      })

      const sphere = BoundingSphere.fromPoints(positions)
      await new Promise<void>((resolve) => {
        viewer.camera.flyToBoundingSphere(sphere, {
          duration: 1.5,
          offset: new HeadingPitchRange(
            0,
            -Math.PI / 3,
            Math.max(sphere.radius * 2.2, 30_000),
          ),
          complete: () => resolve(),
          cancel: () => resolve(),
        })
      })
    })

    if (import.meta.env.DEV) {
      ;(globalThis as unknown as Record<string, unknown>).__astraViewer = viewer
    }

    return () => {
      unregister()
      unregisterConditions()
      unregisterBriefing()
      unregisterRoute()
      viewer.entities.removeById('astra-route')
      viewer.entities.removeById('astra-route-start')
      viewer.entities.removeById('astra-route-end')
      viewer.entities.removeById('astra-landing')
      if (import.meta.env.DEV) {
        delete (globalThis as unknown as Record<string, unknown>).__astraViewer
      }
      viewer.destroy()
    }
  }, [])

  return <div ref={containerRef} className="h-full w-full" />
}
