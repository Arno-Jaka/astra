import { useEffect, useRef, type RefObject } from 'react'
import { Cartesian3, Globe, Matrix4, Transforms, Viewer, type TerrainProvider } from 'cesium'
import { MARS, MOLA_SHADE, createTrekProvider } from '../map/trek'
import { useDriveStore } from '../store/driveStore'
import FloatingPanel from './FloatingPanel'

export type RoverViewPose = { position: Cartesian3; heading: number; terrainProvider: TerrainProvider }

export default function RoverCameraWindow({ poseRef }: { poseRef: RefObject<RoverViewPose | null> }) {
  const active = useDriveStore(state => state.active)
  const vehicle = useDriveStore(state => state.vehicle)
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!active || !container.current) return
    const viewer = new Viewer(container.current, {
      baseLayer: false, globe: new Globe(MARS), ellipsoid: MARS,
      animation: false, timeline: false, baseLayerPicker: false, geocoder: false,
      homeButton: false, sceneModePicker: false, navigationHelpButton: false,
      selectionIndicator: false, infoBox: false, fullscreenButton: false,
      useDefaultRenderLoop: false,
    })
    viewer.imageryLayers.addImageryProvider(createTrekProvider(MOLA_SHADE))
    viewer.scene.globe.showGroundAtmosphere = false
    viewer.scene.globe.depthTestAgainstTerrain = true
    viewer.scene.screenSpaceCameraController.enableInputs = false
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false
    let frame = 0
    let last = 0
    const update = (now: number) => {
      const pose = poseRef.current
      if (pose && now - last >= 100 && container.current?.clientWidth) {
        last = now
        if (viewer.terrainProvider !== pose.terrainProvider) viewer.terrainProvider = pose.terrainProvider
        const local = Transforms.eastNorthUpToFixedFrame(pose.position, MARS)
        const eye = Matrix4.multiplyByPoint(local, new Cartesian3(Math.sin(pose.heading) * 0.6, Math.cos(pose.heading) * 0.6, 2.3), new Cartesian3())
        viewer.camera.setView({ destination: eye, orientation: { heading: pose.heading, pitch: -0.12, roll: 0 } })
        viewer.resize(); viewer.render()
      }
      frame = requestAnimationFrame(update)
    }
    frame = requestAnimationFrame(update)
    return () => { cancelAnimationFrame(frame); viewer.destroy() }
  }, [active, poseRef])
  if (!active) return null
  return <FloatingPanel id="rover-camera" title={vehicle === 'sev' ? 'SEV forward camera' : 'Rover mast camera'} width={360} initial={{ left: 16, top: 120 }}>
    <div ref={container} className="h-[210px] w-full bg-black" />
    <p className="px-3 py-2 text-xs text-neutral-400">Simulated forward view · NASA terrain / imagery · 10 fps</p>
  </FloatingPanel>
}
