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
| Optical imagery / basemap | NASA Mars Trek (SSERVI/JPL) WMTS | Viking MDIM 2.1, MGS MOLA hillshade | verified (toggleable in layer panel) |
| Topographic (DEM) | MGS MOLA MEGDR (PDS Geosciences) | MGS MOLA | verified at 32 ppd (~1.9 km) |
| Slope hazard (derived) | ASTRA `/api/dem/slopetile` PNG tiles from MOLA MEGDR | MGS MOLA (derived) | verified; classes 5/10/15/25° |
| Thermal | NASA Mars Trek WMTS | Mars Odyssey THEMIS, MGS TES | blocked: TrekServices Solr index returns 0 docs; only 2 global Trek WMTS layers found |
| Spectral (minerals) | PDS Geosciences / ODE | MRO CRISM | curated targets |
| Atmospheric (current) | Curiosity REMS live feed (mars.nasa.gov) | MSL REMS | verified; Gale only; station pin on globe |
| Nomenclature | IAU/USGS Gazetteer + Mars Trek bookmarks | — | curated |
| 3D rover model | NASA 3D Resources | — | license + record pending |

## Verified endpoints (Nov 9, 2026)

### Mars Trek WMTS — optical basemap
- Template: `https://trek.nasa.gov/tiles/Mars/EQ/{layer}/1.0.0/default/default028mm/{TileMatrix}/{TileRow}/{TileCol}.jpg`
- Layers used: `Mars_MGS_MOLA_ClrShade_merge_global_463m` (default base) and `Mars_Viking_MDIM21_ClrMosaic_global_232m` (toggleable optical base), both JPEG, levels 0–7.
- Capabilities: `.../{layer}/1.0.0/WMTSCapabilities.xml`.
- Browser test: 19/19 tiles HTTP 200, zero failed requests, no CORS errors; rendered on Cesium with `Ellipsoid.MARS` + `GeographicTilingScheme`.
- Cesium uses `WebMapTileServiceImageryProvider`, `tileMatrixSetID: "default028mm"`, `maximumLevel: 7`.

### MOLA topography / slope
- Source: PDS Geosciences Node, MGS MOLA MEGDR `mgsl_300x/meg032/megt90n000fb.img` (+ `.lbl`), 11520×5760, big-endian int16, metres, simple cylindrical, 0–360°E, north-up, 32 px/deg (~1.85 km/px, MOLA areoid datum). The 16 ppd `meg016/megt90n000eb.img` is kept as a fallback; `dem.py` reads the grid size from the `.lbl`.
- URL: `https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg032/megt90n000fb.img`
- Sampler validation (Nov 10, 2026): Bradbury Landing (137.4417, −4.5895) → −4501 m (published ≈ −4500 m); Octavia E. Butler Landing (77.4508, 18.4447) → −2568 m (≈ −2600 m); Olympus Mons summit → +20,032 m (≈ +21,000 m); Hellas floor → −6031 m (≈ −7000 m area minimum). Grid interpolation and the 0–360°E wrap are correct.
- Served to Cesium via `GET /api/dem/tile` (128×128 float32 tiles, `CustomHeightmapTerrainProvider`, geographic tiling on `Ellipsoid.MARS`). Bounds accept −180…180 (Cesium) or 0…360 (PDS).
- Route drawing uses ground-clamped entities/polyline, so heights never go stale when terrain LOD refines. The rover samples `globe.getHeight` every frame plus a 4-point ±18 m probe for the local surface normal, and tilts up to 32° onto that plane.
- Caveat: the full 463 m global GeoTIFF (`planetarymaps.usgs.gov/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif`, ~2.1 GB) is range-readable (HTTP 206) but striped/un-tiled, so GDAL `/vsicurl/` windowed reads stall; full download is too slow here (~0.1–0.3 MB/s). Use 32 ppd now; upgrade to 128 ppd or a HiRISE DTM if bandwidth allows.
- Spike (±1.5° windows, 16 ppd): Gale centre −3098 m, range −4531…1070 m, slope p50 3.1°, p99 15.6°, max 24.0°; Jezero centre −2664 m, range −3769…16 m, slope p50 1.5°, max 13.6°.
- Method: `slope = atan(|∇z|)`, `dy = 3705 m`, `dx = dy·cos(lat)` (16 ppd; 1852 m at 32 ppd). At these scales slopes are smoothed over kilometres, so label route grades `regional estimate`.

### Curiosity REMS weather (live)
- URL: `https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json`
- Verified: HTTP 200, ~1.7 MB, 4,745 sols; latest sol 4995 with `min_temp`/`max_temp` (°C), `pressure` (Pa), `season`, `ls`, `atmo_opacity`, `sunrise`/`sunset`, UV index.
- Gale only; label "nearest live station" at Jezero.
- Served two ways: agent tool `get_current_conditions` (card + provenance) and `GET /api/weather/station` for the globe station pin (Curiosity at Bradbury Landing, 137.4417 E, −4.5895; latest sol, temps, pressure).
- Feed disclaimer: provided by Centro de Astrobiología "for outreach purposes only". Cite MSL REMS + NASA/JPL and label as outreach data.

### Slope-hazard overlay (derived from MOLA)
- Endpoint: `GET /api/dem/slopetile/{z}/{x}/{y}` — 256×256 RGBA PNG, Cesium `GeographicTilingScheme` layout (level z → 2^(z+1) × 2^z tiles; x from −180° E, y from +90° north-down), levels 0–8, drawn as a `UrlTemplateImageryProvider` above the base imagery.
- Method: bilinear MOLA heightmap at 257×257 (one row/col apron), `slope = atan(hypot(∂z/∂x, ∂z/∂y))` with per-tile metre steps (`dx = Δlon·(π/180)·R·cos(lat_mid)`, `dy = Δlat·(π/180)·R`), then classed: 5–10° green, 10–15° yellow, 15–25° orange, >25° red, alpha 70/110/150/190.
- Spot checks (Nov 10, 2026): Gale tile 6/112/33 → 22% of pixels above 5° (crater rim + mound flanks); Olympus Mons flank tile 5/8/12 → 32% above 5° but almost all in the gentle 5–10° class, matching the shield's actual profile.
- Provenance label: "Derived from MGS MOLA DEM — NASA PDS". Same DEM as routes/terrain; no third-party data.

### Danger-zone analysis and hazardous comparison route (derived from MOLA)
- When a route request's direct profile exceeds the slope limit, the planner returns two traverses: the compliant A* detour (`coordinates`/`profile`, usually with no over-limit danger zones) and the rejected direct line as `hazardous` (same fields plus its own `dangers`). Both carry `dangers` from `find_dangers()` on the same 0.5 km-sampled MOLA profiles.
- Method: consecutive profile samples with |grade| ≥ 10° are grouped into zones (merged when separated by < 1 km); each zone reports `type`, `label`, mid-point lon/lat, `distance_km`, `span_km`, `max_grade_deg`, and `over_limit` vs the requested limit. Classification: ≥ 35° → `cliff` (fall/impact-fire risk); ≥ max(12°, limit + 0.25°) → `rollover` (over the mission slope envelope); else `steep` (slip risk). The envelope margin (0.25°) keeps compliant routes (max grade ≤ limit + 0.05°) always below the rollover class, so safe routes never carry rollover zones.
- Frontend replay: the direct route draws as a dashed red polyline with danger pins (yellow/orange/red by type) on both traverses; the route panel has a Safe/Direct toggle, a danger-zone list, and danger shading on the elevation chart. Driving the direct route raises amber slip-risk warnings in steep zones and, when the live interpolated grade passes the same envelope, plays the crash simulation — tumble downhill, decaying bounces, then fire/smoke particle plumes — ending in a "scout lost" report.
- Caveats: grades are regional estimates from ~1.9 km MOLA sampling; the crash is a scripted dramatization of why the planner avoids over-limit terrain (a real rover would not combust in Mars' thin CO₂ atmosphere), not a physical hazard model. Thresholds were calibrated against real MOLA grade distributions (steepest Mars terrain ≈ 25° at MOLA resolution, e.g. Olympus Mons' scarp and Valles Marineris walls).

### Mars Trek layer discovery (blocked)
- Verified global WMTS layers: `Mars_Viking_MDIM21_ClrMosaic_global_232m`, `Mars_MGS_MOLA_ClrShade_merge_global_463m` (both HTTP 200 + capabilities).
- The layer catalogue service `trek.nasa.gov/mars/TrekServices/ws/index/eq/searchItems` returns `numFound: 0` for every query (Solr index appears empty/broken); ~14 guessed THEMIS/CTX/MOLA-elevation layer IDs all 404. A THEMIS thermal layer stays blocked until the index works or IDs are published; the slope-hazard overlay covers the safety-hazard role in the meantime.

### Text-to-speech
- `edge-tts` (`en-US-AriaNeural`): ~3.6 s end-to-end for a short line (30 KB MP3) including process startup; keep behind the `TTSProvider` adapter.

## Notes
- Mars Trek tiles are 2:1 geodetic; Cesium uses `Ellipsoid.MARS` + `GeographicTilingScheme`.
- Exclude HRSC (ESA) to keep data NASA-only.
- InSight weather API is retired (empty sols since 2022); do not use.
- MOLA DEM: watch planetocentric vs planetographic latitude and MOLA areoid datum.
- Cesium gotcha: `camera.positionCartographic` and collision detection use the WGS84 scene ellipsoid. Convert with `scene.globe.ellipsoid` for Mars heights, and set `scene.screenSpaceCameraController.enableCollisionDetection = false` (otherwise a 250 km Mars camera drifts to ~2,960 km after ~1 s).
- Official challenge Resources tab opens Nov 13; re-check for added datasets.
