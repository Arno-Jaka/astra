# Data Sources & Provenance

Every value shown in ASTRA must come from a backend tool result carrying:
`{mission, instrument, source_url, retrieved_at}`.

## Rules
- NASA data only (`.gov` / JPL / PDS). No third-party aggregators.
- Mock/demo data must be labeled on screen: `demo`, `curated example`, or `simulated`.
- The LLM never computes numbers; it calls tools.
- No oxygen/radiation/habitat scores unless a documented formula + source is shown and labeled `estimate`.

## Categories in use
| Category | Source | Mission/Instrument | Status |
|---|---|---|---|
| Optical imagery / basemap | NASA Mars Trek (SSERVI/JPL) WMTS | Viking, MGS MOC, MRO CTX/HiRISE | verified (Viking layer) |
| Topographic (DEM) | MGS MOLA MEGDR (PDS Geosciences) | MGS MOLA | verified at 16 ppd (~3.7 km) |
| Thermal | NASA Mars Trek WMTS | Mars Odyssey THEMIS, MGS TES | layer IDs pending |
| Spectral (minerals) | PDS Geosciences / ODE | MRO CRISM | curated targets |
| Atmospheric (current) | Curiosity REMS live feed (mars.nasa.gov) | MSL REMS | verified; Gale only |
| Nomenclature | IAU/USGS Gazetteer + Mars Trek bookmarks | — | curated |
| 3D rover model | NASA 3D Resources | — | license + record pending |

## Verified endpoints (Nov 9, 2026)

### Mars Trek WMTS — optical basemap
- Template: `https://trek.nasa.gov/tiles/Mars/EQ/{layer}/1.0.0/default/default028mm/{TileMatrix}/{TileRow}/{TileCol}.jpg`
- Layer used: `Mars_Viking_MDIM21_ClrMosaic_global_232m` (Viking MDIM 2.1, JPEG, levels 0–7).
- Capabilities: `.../{layer}/1.0.0/WMTSCapabilities.xml`.
- Browser test: 19/19 tiles HTTP 200, zero failed requests, no CORS errors; rendered on Cesium with `Ellipsoid.MARS` + `GeographicTilingScheme`.
- Cesium uses `WebMapTileServiceImageryProvider`, `tileMatrixSetID: "default028mm"`, `maximumLevel: 7`.

### MOLA topography / slope
- Source: PDS Geosciences Node, MGS MOLA MEGDR `mgsl_300x/meg016/megt90n000eb.img` (+ `.lbl`).
- URL: `https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/megt90n000eb.img`
- Format: 5760×2880, big-endian int16, metres, simple cylindrical, 0–360°E, north-up, 16 px/deg; MOLA areoid datum.
- Caveat: the full 463 m global GeoTIFF (`planetarymaps.usgs.gov/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif`, ~2.1 GB) is range-readable (HTTP 206) but striped/un-tiled, so GDAL `/vsicurl/` windowed reads stall; full download is too slow here (~0.1–0.3 MB/s). Use 16 ppd now; upgrade to 32/64 ppd if bandwidth allows.
- Spike (±1.5° windows): Gale centre −3098 m, range −4531…1070 m, slope p50 3.1°, p99 15.6°, max 24.0°; Jezero centre −2664 m, range −3769…16 m, slope p50 1.5°, max 13.6°.
- Method: `slope = atan(|∇z|)`, `dy = 3705 m`, `dx = dy·cos(lat)`. At 16 ppd slopes are smoothed over ~3.7 km, so label route grades `regional estimate`.

### Curiosity REMS weather (live)
- URL: `https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json`
- Verified: HTTP 200, ~1.7 MB, 4,745 sols; latest sol 4995 with `min_temp`/`max_temp` (°C), `pressure` (Pa), `season`, `ls`, `atmo_opacity`, `sunrise`/`sunset`, UV index.
- Gale only; label "nearest live station" at Jezero.
- Feed disclaimer: provided by Centro de Astrobiología "for outreach purposes only". Cite MSL REMS + NASA/JPL and label as outreach data.

### Text-to-speech
- `edge-tts` (`en-US-AriaNeural`): ~3.6 s end-to-end for a short line (30 KB MP3) including process startup; keep behind the `TTSProvider` adapter.

## Notes
- Mars Trek tiles are 2:1 geodetic; Cesium uses `Ellipsoid.MARS` + `GeographicTilingScheme`.
- Exclude HRSC (ESA) to keep data NASA-only.
- InSight weather API is retired (empty sols since 2022); do not use.
- MOLA DEM: watch planetocentric vs planetographic latitude and MOLA areoid datum.
- Cesium gotcha: `camera.positionCartographic` and collision detection use the WGS84 scene ellipsoid. Convert with `scene.globe.ellipsoid` for Mars heights, and set `scene.screenSpaceCameraController.enableCollisionDetection = false` (otherwise a 250 km Mars camera drifts to ~2,960 km after ~1 s).
- Official challenge Resources tab opens Nov 13; re-check for added datasets.
