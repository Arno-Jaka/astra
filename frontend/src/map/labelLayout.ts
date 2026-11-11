import { Cartesian3, Cartographic, ConstantProperty, EllipsoidalOccluder, Math as CesiumMath, SceneTransforms, Viewer, VerticalOrigin } from 'cesium'
import { MARS } from './trek'

/** Screen-space priority layout: route hazards first, then endpoints/sites.
 * Suppress overlapping text only; all map pins remain selectable/visible.
 */
export function declutterLabels(viewer: Viewer, heightAt: (lon: number, lat: number) => number | undefined) {
  const context = document.createElement('canvas').getContext('2d')!
  let last = 0
  const priority = (id: string) => id.includes('danger') ? 0 : id.includes('route-end') || id.includes('route-start') ? 1 : id.includes('site') ? 2 : 3
  return viewer.scene.preRender.addEventListener(() => {
    if (performance.now() - last < 100) return
    last = performance.now()
    const boxes: { x: number; y: number; w: number; h: number }[] = []
    const time = viewer.clock.currentTime
    const cameraHeight = MARS.cartesianToCartographic(viewer.camera.positionWC).height
    const horizon = new EllipsoidalOccluder(MARS, viewer.camera.positionWC)
    const entities = viewer.entities.values.filter(e => e.show && e.label && e.position)
      .sort((a, b) => priority(a.id) - priority(b.id))
    for (const entity of entities) {
      const label = entity.label!
      const position = entity.position!.getValue(time)
      if (!position) continue
      const carto = MARS.cartesianToCartographic(position)
      const ground = heightAt(CesiumMath.toDegrees(carto.longitude), CesiumMath.toDegrees(carto.latitude))
      if (ground !== undefined) carto.height = ground
      const world = MARS.cartographicToCartesian(carto)
      const windowPosition = SceneTransforms.worldToWindowCoordinates(viewer.scene, world)
      let visible = !!windowPosition && Cartesian3.dot(Cartesian3.subtract(world, viewer.camera.positionWC, new Cartesian3()), viewer.camera.directionWC) > 0
      if (cameraHeight > 5000) visible = visible && horizon.isPointVisible(MARS.cartographicToCartesian(
        new Cartographic(carto.longitude, carto.latitude, Math.max(0, carto.height)),
      ))
      else if (Cartesian3.distance(world, viewer.camera.positionWC) > 200000) visible = false
      if (windowPosition && visible) {
        const font = label.font?.getValue(time) ?? '16px sans-serif'
        context.font = font
        const lines = String(label.text?.getValue(time) ?? '').split('\n')
        const w = Math.max(...lines.map(line => context.measureText(line).width)) + 20
        const h = lines.length * (parseFloat(font.match(/([\d.]+)px/)?.[1] ?? '16') + 5) + 12
        const offset = label.pixelOffset?.getValue(time) ?? { x: 0, y: 0 }
        const box = { x: windowPosition.x + offset.x - w / 2, y: windowPosition.y + offset.y - (label.verticalOrigin?.getValue(time) === VerticalOrigin.TOP ? 0 : h), w, h }
        visible = box.x + w > 0 && box.y + h > 0 && box.x < viewer.canvas.clientWidth && box.y < viewer.canvas.clientHeight &&
          !boxes.some(b => box.x < b.x + b.w && box.x + w > b.x && box.y < b.y + b.h && box.y + h > b.y)
        if (visible) boxes.push(box)
      }
      if (label.show?.getValue(time) !== visible) label.show = new ConstantProperty(visible)
    }
  })
}
