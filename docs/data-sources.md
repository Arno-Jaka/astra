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
| Optical imagery / basemap | NASA Mars Trek (SSERVI/JPL) WMTS | Viking, MGS MOC, MRO CTX/HiRISE | verify layer IDs |
| Topographic (DEM) | MGS MOLA DEM (PDS / USGS Astrogeology) | MGS MOLA | verify download |
| Thermal | NASA Mars Trek WMTS | Mars Odyssey THEMIS, MGS TES | verify layer IDs |
| Spectral (minerals) | PDS Geosciences / ODE | MRO CRISM | curated targets |
| Atmospheric (current) | Curiosity REMS live feed (mars.nasa.gov) | MSL REMS | Gale only; label nearest station elsewhere |
| Nomenclature | IAU/USGS Gazetteer + Mars Trek bookmarks | — | curated |
| 3D rover model | NASA 3D Resources | — | verify license + record |

## Notes
- Mars Trek tiles are 2:1 geodetic; Cesium uses `Ellipsoid.MARS` + `GeographicTilingScheme`.
- Exclude HRSC (ESA) to keep data NASA-only.
- InSight weather API is retired (empty sols since 2022); do not use.
- MOLA DEM: watch planetocentric vs planetographic latitude and MOLA areoid datum.
- Official challenge Resources tab opens Nov 13; re-check for added datasets.
