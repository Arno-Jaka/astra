import {
  Credit,
  GeographicTilingScheme,
  UrlTemplateImageryProvider,
} from 'cesium'
import { MARS } from './trek'

/**
 * Slope-hazard overlay: RGBA PNG tiles computed server-side from the NASA
 * MOLA DEM (GET /api/dem/slopetile/{z}/{x}/{y}). Breaks at 5/10/15/25 deg
 * from green to red, drawn on Cesium's geographic tiling on Mars.
 */
export function createSlopeOverlayProvider() {
  return new UrlTemplateImageryProvider({
    url: '/api/dem/slopetile/{z}/{x}/{y}',
    tilingScheme: new GeographicTilingScheme({ ellipsoid: MARS }),
    maximumLevel: 8,
    credit: new Credit('Slope from MGS MOLA DEM — NASA PDS (derived)'),
  })
}
