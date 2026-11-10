import {
  Credit,
  CustomHeightmapTerrainProvider,
  GeographicTilingScheme,
  Math as CesiumMath,
} from 'cesium'
import { MARS } from './trek'

const TILE_SIZE = 128
const scheme = new GeographicTilingScheme({ ellipsoid: MARS })

export function createMolaTerrainProvider() {
  return new CustomHeightmapTerrainProvider({
    width: TILE_SIZE,
    height: TILE_SIZE,
    tilingScheme: scheme,
    credit: new Credit('MOLA 16 ppd — NASA PDS Geosciences'),
    callback: async (x, y, level) => {
      const rectangle = scheme.tileXYToRectangle(x, y, level)
      const params = new URLSearchParams({
        west: String(CesiumMath.toDegrees(rectangle.west)),
        south: String(CesiumMath.toDegrees(rectangle.south)),
        east: String(CesiumMath.toDegrees(rectangle.east)),
        north: String(CesiumMath.toDegrees(rectangle.north)),
        width: String(TILE_SIZE),
        height: String(TILE_SIZE),
      })
      try {
        const response = await fetch(`/api/dem/tile?${params}`)
        if (!response.ok) throw new Error(`terrain ${response.status}`)
        const buffer = await response.arrayBuffer()
        if (buffer.byteLength !== TILE_SIZE * TILE_SIZE * 4) {
          throw new Error('unexpected terrain tile size')
        }
        return new Float32Array(buffer)
      } catch {
        return new Float32Array(TILE_SIZE * TILE_SIZE)
      }
    },
  })
}
