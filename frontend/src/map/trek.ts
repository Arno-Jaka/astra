import {
  Credit,
  Ellipsoid,
  GeographicTilingScheme,
  Rectangle,
  WebMapTileServiceImageryProvider,
} from 'cesium'

export const MARS = Ellipsoid.MARS

const TREK_BASE = 'https://trek.nasa.gov/tiles/Mars/EQ'

export type TrekLayer = {
  id: string
  label: string
  maximumLevel: number
  credit: string
}

export const VIKING: TrekLayer = {
  id: 'Mars_Viking_MDIM21_ClrMosaic_global_232m',
  label: 'Viking MDIM 2.1',
  maximumLevel: 7,
  credit: 'NASA/JPL/Mars Trek — Viking',
}

export const MOLA_SHADE: TrekLayer = {
  id: 'Mars_MGS_MOLA_ClrShade_merge_global_463m',
  label: 'MOLA color hillshade',
  maximumLevel: 7,
  credit: 'NASA/JPL/USGS — MOLA',
}

export function createTrekProvider(
  layer: TrekLayer,
): WebMapTileServiceImageryProvider {
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
