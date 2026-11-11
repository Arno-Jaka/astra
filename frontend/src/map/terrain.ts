import {
  Credit,
  CustomHeightmapTerrainProvider,
  GeographicTilingScheme,
  HeightmapTerrainData,
  Cartographic,
  Math as CesiumMath,
} from 'cesium'
import { MARS } from './trek'
import { surfaceDetail } from './surfaceDetail'

const TILE_SIZE = 128
const scheme = new GeographicTilingScheme({ ellipsoid: MARS })

export function createMolaTerrainProvider() {
  // Retain the same triangulated heightmaps supplied to the renderer. Globe
  // picking can be unavailable until its asynchronous terrain picker is ready.
  const tiles = new Map<string, { data: HeightmapTerrainData; rectangle: ReturnType<typeof scheme.tileXYToRectangle> }>()
  let maxLevel = 0
  const provider = new CustomHeightmapTerrainProvider({
    width: TILE_SIZE,
    height: TILE_SIZE,
    tilingScheme: scheme,
    credit: new Credit('NASA MOLA regional terrain · simulated small-scale relief'),
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
        const heights = new Float32Array(buffer)
        const west = CesiumMath.toDegrees(rectangle.west)
        const north = CesiumMath.toDegrees(rectangle.north)
        const dx = CesiumMath.toDegrees(rectangle.width) / (TILE_SIZE - 1)
        const dy = CesiumMath.toDegrees(rectangle.height) / (TILE_SIZE - 1)
        const spacing = dy * 59238
        for (let row = 0; row < TILE_SIZE; row++) {
          for (let col = 0; col < TILE_SIZE; col++) {
            heights[row * TILE_SIZE + col] += surfaceDetail(west + col * dx, north - row * dy, spacing)
          }
        }
        tiles.set(`${level}/${x}/${y}`, {
          data: new HeightmapTerrainData({ buffer: heights, width: TILE_SIZE, height: TILE_SIZE }),
          rectangle,
        })
        maxLevel = Math.max(maxLevel, level)
        if (tiles.size > 512) tiles.delete(tiles.keys().next().value!)
        return heights
      } catch (error) {
        // A failed request is not a zero-altitude tile (which creates walls
        // and holes along tile boundaries). Let Cesium retain its parent LOD.
        return Promise.reject(error)
      }
    },
  })
  return Object.assign(provider, {
    cachedHeight(lon: number, lat: number): number | undefined {
      const position = Cartographic.fromDegrees(lon, lat)
      for (let level = maxLevel; level >= 0; level--) {
        const xy = scheme.positionToTileXY(position, level)
        if (!xy) continue
        const key = `${level}/${xy.x}/${xy.y}`
        const tile = tiles.get(key)
        if (tile) {
          // Keep the active wheel/camera neighbourhood while distant
          // corridor requests complete and the cache budget rolls over.
          tiles.delete(key)
          tiles.set(key, tile)
          return tile.data.interpolateHeight(tile.rectangle, position.longitude, position.latitude)
        }
      }
      return undefined
    },
  })
}
