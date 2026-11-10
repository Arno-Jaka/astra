/* Verifies sampleTerrain works with CustomHeightmapTerrainProvider at a
 * chosen level (no `availability` on this provider class), and that the
 * callback receives the expected tile coordinates.
 * Run: node scripts/verify-sample-terrain.mjs (from frontend/)
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const C = require('cesium')

const calls = []
const TILE = 128
const HEIGHT_VALUE = 1234.5

const provider = new C.CustomHeightmapTerrainProvider({
  width: TILE,
  height: TILE,
  tilingScheme: new C.GeographicTilingScheme(),
  callback: (x, y, level) => {
    calls.push({ x, y, level })
    const data = new Float32Array(TILE * TILE)
    data.fill(HEIGHT_VALUE)
    return data
  },
})

console.log('availability?', provider.availability ? 'yes' : 'no (expected)')

const positions = [
  C.Cartographic.fromDegrees(137.4417, -4.5895), // Bradbury Landing
  C.Cartographic.fromDegrees(137.8, -5.1),
]

const sampled = await C.sampleTerrain(provider, 12, positions)
console.log('sampled heights:', sampled.map((p) => p.height))
console.log('expected:', HEIGHT_VALUE)
console.log('callback tile requests:', JSON.stringify(calls.slice(0, 8)))
console.log(
  'distinct levels:',
  [...new Set(calls.map((c) => c.level))].sort((a, b) => a - b),
)

// Verify the tile indices match the geographic scheme layout for level 12:
// 2^(12+1) x-tiles, 2^12 y-tiles.
const scheme = new C.GeographicTilingScheme()
const rect = scheme.tileXYToRectangle(
  calls[0]?.x ?? 0,
  calls[0]?.y ?? 0,
  calls[0]?.level ?? 0,
)
console.log(
  'first requested tile covers:',
  C.Math.toDegrees(rect.west).toFixed(2),
  'E to',
  C.Math.toDegrees(rect.east).toFixed(2),
  'E',
)
