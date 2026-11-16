# ASTRA — submission pack

NASA Space Apps Challenge 2026 · **Interplanetary Survival Guide: Martian Map**

- Live app: <https://astra-l0w2.onrender.com/>
- Source: <https://github.com/Arno-Jaka/astra>
- Screenshots: [`docs/screenshots/`](screenshots/)

---

## Summary (≤200 words)

ASTRA is a browser-based mission-planning map for astronauts exploring Mars on
foot and by vehicle. Choose a departure point and destination on the globe, or
search a named site, and ASTRA predicts two traverses from NASA MOLA terrain: a
slope-compliant route and the hazardous direct line. Both report distance,
ascent, descent, maximum grade and danger zones against an editable slope limit.

Destination safety drives the mission. A crew-safe target sends three
astronauts and the Space Exploration Vehicle across the full traverse, parking
a short walk from the target. A hazardous target parks the SEV at the last safe
point and deploys a rover, keeping the crew out of terrain they cannot cross.

Live Curiosity REMS weather, Mars Trek imagery and a clearly labelled regional
weather/radiation screen add context. A time-compressed 3D drive on the real
heightfield shows the plan in motion, with chase camera, telemetry and hazard
callouts. Every measurement carries its NASA source and retrieval time. ASTRA
uses NASA data only and runs entirely in the browser.

---

## Project details (≤300 words)

**The problem.** A traverse plan is a survival decision. Slopes that look gentle
at orbital scale can exceed a suit's climb limit, and the shortest line is often
the most dangerous. A crew needs to compare the safe route with the tempting
direct one before committing.

**Planning.** Selecting a start and destination produces two candidate
traverses from the same NASA MOLA elevation model: a slope-compliant path and
the hazardous direct line. Each reports distance, ascent, descent, maximum
grade and danger zones against an editable slope envelope. When no compliant
path exists, ASTRA says so rather than inventing one.

**Assignment.** The destination's terrain decides the mission. Crew-safe
targets send the three-person crew in the SEV over the full traverse, parking
within 200 m. Hazardous targets park the SEV at the last safe point and deploy
a robotic rover, keeping humans out of terrain beyond their limits.

**Context and simulation.** Site search reads Curiosity REMS weather and a
sourced site brief; the regional weather and radiation screen is explicitly
labelled derived. A time-compressed CesiumJS drive on the real heightfield
visualizes the chosen route with chase camera, speed/elevation telemetry,
simulated dust and hazard callouts.

**Engineering.** FastAPI backend, CesiumJS frontend, Rust/PyO3 kernels for DEM
slope and route sampling with Python fallbacks, Docker deployment. Weather
degrades gracefully to a snapshot when NASA's feed is unavailable. Every
measurement carries source and retrieval time. No non-NASA data sources.

**Validation.** The Gale Crater → Mount Sharp case (17.4 km) plans in about two
seconds and returns an 8.3° slope-compliant traverse against a 15.4° direct
line with one danger zone. Thirty-two backend tests cover weather fallback, DEM
loading and routing.

---

## 7-slide deck outline

| # | Slide | Screenshot | Talking points |
| --- | --- | --- | --- |
| 1 | **ASTRA — plan the safest way across Mars** | [`02-mars-globe.png`](screenshots/02-mars-globe.png) | One-line pitch, live URL, team. NASA Mars Trek globe with MOLA terrain and marked sites. |
| 2 | **One route is not a decision** | [`04-traverse-plan.png`](screenshots/04-traverse-plan.png) | Gale Crater → Mount Sharp, 17.4 km. Slope-compliant 8.3° max grade vs hazardous direct 15.4° with one danger zone. Distance/ascent/descent shown for both. |
| 3 | **Terrain decides who goes** | [`05-hazard-route.png`](screenshots/05-hazard-route.png) | Crew-safe → SEV drives the full traverse. Hazardous → SEV parks at the last safe point, rover deployed. Humans stay inside their slope envelope. |
| 4 | **NASA data, with provenance** | [`03-nasa-site-data.png`](screenshots/03-nasa-site-data.png) | Mars Trek imagery, MOLA DEM, live REMS weather, sourced site brief. Derived regional weather/radiation is labelled as an estimate, never a measurement. |
| 5 | **Simulate the plan before you drive it** | [`06-chase-camera.png`](screenshots/06-chase-camera.png) | Time-compressed drive on the real MOLA heightfield, chase camera, SEV on the route. Model prefetched so start is fast. |
| 6 | **Telemetry and hazard callouts** | [`07-drive-telemetry.png`](screenshots/07-drive-telemetry.png) | Speed, distance, elevation and grade in motion; simulated dust and terrain warnings. Simulation is a visual check, not certified navigation. |
| 7 | **Built for first-time users — and next steps** | [`01-quick-guide.png`](screenshots/01-quick-guide.png) | First-run quick guide and reset; honest limits; roadmap: georeferenced science targets, higher-resolution DEM, thermal/spectral layers, validated rover dynamics. |

Suggested timings: 30 s for slides 1–2, 45 s each for 3–6, 30 s for slide 7
(≈4 minutes, leaving room for questions or a live drive).

---

## NASA data and resources

| Use | Source | Link |
| --- | --- | --- |
| Basemap imagery, terrain context | NASA Mars Trek (MGS MOLA hillshade, Viking MDIM 2.1) | <https://trek.nasa.gov/mars/> |
| Elevation, grades, route sampling | MGS MOLA MEGDR, NASA PDS Geosciences | <https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg032/> |
| Live weather (Gale Crater) | MSL Curiosity REMS, NASA/JPL | <https://mars.nasa.gov/msl/weather/> |
| Science objective context | Curiosity Mastcam boxwork observation, PIA26560 | <https://science.nasa.gov/photojournal/curiosity-views-boxwork-patterns-at-a-distance/> |
| Mission background | NASA Science — Curiosity / Mars 2020 Perseverance | <https://science.nasa.gov/mission/msl-curiosity/> · <https://science.nasa.gov/mission/mars-2020-perseverance/> |
| Place names and coordinates | IAU / USGS Gazetteer of Planetary Nomenclature | <https://planetarynames.wr.usgs.gov/> |
| 3D reference models | NASA 3D Resources | <https://science.nasa.gov/3d-resources/> |
| Challenge brief | NASA Space Apps Challenge 2026 | <https://www.spaceappschallenge.org/> |

A full endpoint and provenance audit lives in
[`docs/data-sources.md`](data-sources.md).

---

## Model and asset credits

- **Perseverance rover GLB** — NASA 3D Resources, used under the
  [NASA media usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/).
  Optimized for the web (Draco geometry, WebP textures); used as an illustrative
  scout, not a validated rover simulation.
- **Space Exploration Vehicle and astronaut GLBs** — project-supplied
  illustrative assets, not NASA measurements.
- **Mars imagery and terrain** — NASA/JPL/USGS Mars Trek and NASA PDS
  Geosciences (MGS MOLA).
- **Weather** — NASA/JPL MSL Curiosity REMS.

If a model's redistribution terms are unclear, replace it with a NASA 3D
Resources asset and update this list before publishing.

---

## Honest limitations

- MOLA at 32 ppd (~1.9 km per pixel) supports **regional grade estimates**, not
  rock, sand or crater-rim hazards at driving scale. ASTRA never claims
  certified rover navigation.
- The regional weather and radiation screen is **derived** from published
  planetary ranges and MOLA elevation. It is not a measured dose map or dust
  forecast, and is labelled as an estimate everywhere it appears.
- REMS is a single station at Gale Crater. Other sites report the nearest
  station and say so; the weather feed degrades to the last snapshot when NASA's
  endpoint is unavailable, with the real retrieval time preserved.
- The drive is a **visualization**: dust, science detours and crash effects are
  simulated. Vehicle dynamics are illustrative, not physics-validated.
- Thermal and spectral layers are not delivered: the Mars Trek index exposed no
  usable thermal layer during development, so ASTRA omits rather than fakes it.
