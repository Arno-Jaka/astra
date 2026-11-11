import { Cartesian3, Cartographic, Matrix4 } from 'cesium'
import { MARS } from './trek'

/** NASA GLB Wheels_objs bounds after Cesium's Y-up/Z-forward conversion.
 * Includes the full tread width, not just six guessed wheel centres.
 * The dense lower envelope also protects the chassis over narrow crests.
 */
export const WHEEL_BOUNDS = {
  minX: -1.427661, maxX: 1.357667,
  minY: -1.352291, maxY: 1.352291,
  bottomZ: 0.000778,
} as const
export const WHEEL_CONTACTS = Array.from({ length: 13 }, (_, row) =>
  Array.from({ length: 13 }, (_, col) => new Cartesian3(
    WHEEL_BOUNDS.minX + (WHEEL_BOUNDS.maxX - WHEEL_BOUNDS.minX) * row / 12,
    WHEEL_BOUNDS.minY + (WHEEL_BOUNDS.maxY - WHEEL_BOUNDS.minY) * col / 12,
    WHEEL_BOUNDS.bottomZ,
  )),
).flat()

/** Resolve contact after body rotation, against the same mesh being drawn. */
export function contactLift(
  matrix: Matrix4,
  heightAt: (position: Cartographic) => number | undefined,
): number {
  let lift = 0
  for (const contact of WHEEL_CONTACTS) {
    const wheel = MARS.cartesianToCartographic(
      Matrix4.multiplyByPoint(matrix, contact, new Cartesian3()),
    )
    const height = heightAt(wheel)
    if (height !== undefined && Number.isFinite(height)) {
      lift = Math.max(lift, height + 0.03 - wheel.height)
    }
  }
  return lift
}
