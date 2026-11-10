import { useEffect, useRef } from 'react'
import {
  Cartesian3,
  Credit,
  Ellipsoid,
  EllipsoidTerrainProvider,
  GeographicTilingScheme,
  Globe,
  Rectangle,
  Viewer,
  WebMapTileServiceImageryProvider,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { onCommand } from '../ws/commandChannel'

const MARS = Ellipsoid.MARS

const TREK_BASE = 'https://trek.nasa.gov/tiles/Mars/EQ'

type TrekLayer = {
  id: string
  label: string
  maximumLevel: number
  credit: string
}

const VIKING: TrekLayer = {
  id: 'Mars_Viking_MDIM21_ClrMosaic_global_232m',
  label: 'Viking MDIM 2.1',
  maximumLevel: 7,
  credit: 'NASA/JPL/Mars Trek — Viking',
}

export function createTrekProvider(layer: TrekLayer): WebMapTileServiceImageryProvider {
  return new WebMapTileServiceImageryProvider({
    url: `${TREK_BASE}/${layer.id}/1.0.0/default/default028mm/{TileMatrix}/{TileRow}/{TileCol}.jpg`,
    layer: layer.id,
    style: 'default',
    format: 'image/jpeg',
    tileMatrixSetID: 'default028mm',
    maximumLevel: layer.maximumLevel,
    tilingScheme: new GeographicTilingScheme({ ellipsoid: MARS }),
    rectangle: Rectangle.fromDegrees(-180, -90, 180, 90),
    credit: new Credit(layer.credit),
  })
}

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
      await new Promise<void>((resolve) => {
        viewer.camera.flyTo({
          destination: Cartesian3.fromDegrees(lon, lat, height, MARS),
          duration,
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
      if (import.meta.env.DEV) {
        delete (globalThis as unknown as Record<string, unknown>).__astraViewer
      }
      viewer.destroy()
    }
  }, [])

  return <div ref={containerRef} className="h-full w-full" />
}
