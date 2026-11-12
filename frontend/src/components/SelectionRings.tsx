import { useEffect, useRef } from 'react'
import { EllipsoidalOccluder, SceneTransforms, Viewer } from 'cesium'
import { MARS } from '../map/trek'

/** Screen-space rings stay a constant size while tracking the selected map dots. */
export default function SelectionRings({ viewer }: { viewer: Viewer }) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => viewer.scene.postRender.addEventListener(() => {
    const bounds = viewer.canvas.getBoundingClientRect()
    const horizon = new EllipsoidalOccluder(MARS, viewer.camera.positionWC)
    for (const element of root.current?.children ?? []) {
      const ring = element as HTMLDivElement
      const entity = viewer.entities.getById(ring.dataset.entity!)
      const world = entity?.position?.getValue(viewer.clock.currentTime)
      const screen = world && horizon.isPointVisible(world) ? SceneTransforms.worldToWindowCoordinates(viewer.scene, world) : undefined
      ring.hidden = !screen || screen.x < 0 || screen.y < 0 || screen.x > bounds.width || screen.y > bounds.height
      if (screen) { ring.style.left = `${bounds.left + screen.x}px`; ring.style.top = `${bounds.top + screen.y}px` }
    }
  }), [viewer])
  return <div ref={root} className="pointer-events-none fixed inset-0 z-20" aria-hidden="true">
    <div hidden data-entity="explorer-start" className="selection-orbit selection-orbit-start"><span /></div>
    <div hidden data-entity="explorer-end" className="selection-orbit selection-orbit-end"><span /></div>
  </div>
}
