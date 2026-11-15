# ASTRA

## Astronaut surface-science workflow

Select a departure point and a destination on the map. ASTRA predicts both the
**safest (slope-compliant)** traverse and the **hazardous direct** comparison for
the chosen endpoints, then assigns a vehicle from the destination's safety:

- **Crew-safe destination** — the crewed **Space Exploration Vehicle (SEV)**
  drives the full traverse, regardless of distance, parks a short fixed standoff
  from the target, and three astronauts (Finn, Rae, Fernando) walk or
  Mars-gravity hop the final approach to the exact spot.
- **Hazardous destination or robot-only task** — the SEV parks at the last safe
  point before the hazard and a **rover is auto-deployed** to the target while
  the crew remains beside the parked SEV.

The default science objective is investigating Mount Sharp boxwork ridges for
evidence of ancient groundwater, with NASA's
[Curiosity Mastcam observation from May 22, 2025](https://science.nasa.gov/photojournal/curiosity-views-boxwork-patterns-at-a-distance/)
(PIA26560). Destination safety is a regional MOLA slope assessment; georeferenced
science experiment areas of interest will be added later.

Set the science objective, slope envelope, assumed walking pace, suit/equipment
time allowance, science-stop time, reserve and total EVA budget under **Mission
parameters** in the traverse plan. Both route alternatives, when available, keep
a snapshot of the assumptions; after editing, use **Recalculate route**. The
on-foot estimate covers only the final approach, because the SEV drives the
traverse.

Defaults are illustrative inputs, not NASA suit limits. Regional weather and
radiation are screened illustratively from published ranges; consumables,
metabolic demand, soil traction and local obstacles are not modeled. See the
[challenge objective mapping](docs/CHALLENGE_ALIGNMENT.md).

### Inspect locations and select a traverse

Hold the pointer over a location's dot or label for **1.5 seconds** to open a nearby
location card with MOLA elevation, NASA Viking orbital imagery, a marker for
the inspected point, and source links. Nearest named sites provide context;
they are not measurements at the hovered point. Dots and labels enlarge on
hover; the card stays inside the viewport beside the target and dismisses when
the pointer leaves its dot or label. Start and destination dots have spinning
cyan and orange rings respectively (static when reduced motion is requested).

Single-click anywhere on Mars (a site marker or open terrain) to select a start,
then single-click a destination
(at least 1 km apart). No setup panel is needed; Escape cancels the selection.
Routes default to a 15° slope limit, adjustable under **Mission parameters** in
the traverse plan. Hover cards
still open only over dots or labels.
Off-site endpoints show distance and compass bearing from the nearest site in
ASTRA's curated catalog, e.g. “12.4 km NE (45°) from Gale Crater.” Bearings are
initial great-circle bearings clockwise from north **from the site to the point**,
not travel headings; distances are surface distances, not planned-route lengths.
The top-center search bar lists named sites with background information and
sources. Set either endpoint from a search result or the map; selecting both
automatically computes the comparison. A location cannot be both endpoints.
The route panel compares a
slope-compliant detour with the hazardous direct route when the planner finds
both. It explicitly reports when no compliant route or hazardous alternative
was found. NASA MOLA supports regional grade estimates, not rock/sand detection
or certified rover navigation. Hover inspection pauses during camera motion
and rover simulation. Cancel stops pending route display.

Interplanetary Survival Guide: Martian Map — NASA Space Apps Challenge 2026.

ASTRA is a hyperlocal Mars excursion planner. Ask it for a site and it flies the
globe there, reads the nearest live weather, presents a sourced survival
briefing, and plans a slope-limited traverse with an elevation profile.

## What works

- **Mars globe** — CesiumJS with NASA Mars Trek imagery and heightmap
  terrain sampled from the MOLA DEM (32 ppd, ~1.9 km/px when present, else
  16 ppd); fly-to 21 marked sites from Gale Crater to Olympus Mons. The
  imagery-only globe renders while terrain loads; if the elevation service
  is unavailable, the layer panel explains the fallback and offers Retry.
- **Live conditions** — Curiosity REMS sol summary with provenance. At Jezero
  the UI labels the Gale station as the nearest live station (3,767 km away).
- **Weather & radiation screening** — mapped regions are classified **safe**,
  **caution** or **unsafe** from a derived weather + radiation screening, with
  scenic character and science value shown alongside, so a safe-but-beautiful
  stop is easy to spot. A map overlay colours each zone (green/amber/red) and a
  panel lists the regions and their estimated temperature range, dust index and
  surface dose. The dose is scaled from the Curiosity RAD surface average
  (~0.64 mSv/day) by latitude and regional elevation; it is a labelled planning
  estimate, not a measured dose map, dust forecast or certified EVA assessment.
  Terrain/slope safety stays with the route planner.
- **Dynamic surface weather (illustrative)** — a separate visual layer cycles
  invented events every 14–28 s: regional sandstorm walls, a dust tornado,
  electrostatic dry lightning, CO₂ ice squalls and ice fog, with calm gaps.
  Particles, screen wash, wind lean and a dust/ice colour wash act on the rover,
  SEV and crew. Every event can still appear in a safe region because the weather
  is visual-only and never affects traversal; a safe focused region just biases
  the sequence calmer, while an unsafe region pushes it toward storms, tornadoes
  and lightning. The panel shows event
  intensity, illustrative wind/dust/visibility and a **Next weather** button with
  an **Auto-cycle** toggle. These effects are not a forecast, measured dust value
  or certified EVA weather limit; “rain” is shown as CO₂ ice, not liquid water.
  This visual layer stays separate from the derived screening and route planner.
- **Survival briefing** — curated mission briefing, hazards, science targets,
  landing site, and verified source links. Wording is generated by the agent;
  numbers come from backend tools.
- **Route planning** — A* on the global MOLA DEM with a configurable
  slope limit. Returns distance, ascent/descent, max/mean grade, simulated
  scout ETA, and a downsampled elevation profile. Route line, pins, and
  markers are clamped to the live terrain so they never sink as tiles refine.
- **Safe vs hazardous route comparison** — when the direct line would exceed
  the slope limit, the planner draws both traverses: the compliant detour in
  orange (with its own danger-zone analysis, typically none over the limit)
  and the rejected **direct route as a dashed red line** with danger pins
  along the way — steep grades (yellow, slip risk), rollovers (orange, over
  the mission slope envelope), cliffs (red, fall risk) — each labeled with
  its peak grade and km position. The route panel has a **Safe/Direct
  toggle** to switch the preview, chart, stats, and danger list between the
  two, and the elevation chart shades each route's danger zones.
- **Traceroute preview** — when a route is suggested, the camera first frames
  the whole traverse; a scrubber in the route panel then drags a preview
  marker (and the camera) along the route through 3D terrain, with live
  distance/elevation/grade readouts and a scrub cursor on the elevation
  chart. Mouse orbit/zoom stays free while previewing.
- **Scout simulation, game-style camera** — "Play traverse" launches a
  GTA-style third-person chase: an animated Perseverance model drives the
  selected traverse clamped to the terrain, tilting onto the local MOLA
  slope with a suspension pitch response and a ground-constrained wheel
  envelope. Before the drive starts, the whole
  route corridor is pre-sampled against the rendered terrain tiles, so the
  rover keeps a mesh-consistent ground reference (and warms the DEM tile
  cache) even where 0.5 km route-profile interpolation would sink below the
  surface. While driving you can **drag to orbit the rover and scroll to
  zoom** (3.5–20 m); the camera recenters behind the rover when released,
  keeps the rover centered with its own smoothed height, and is always
  kept above the terrain — dragging can never clip through a landform.
  A driving HUD shows live telemetry (distance, grade, elevation,
  heading), and the drive is interactive: **↑/↓ speed (0.25–4×), Space
  pause, C recenter camera, Esc or the Stop button to end**. The route
  panel readouts, scrubber, and elevation-chart cursor track the rover
  live while it drives.
- **Cliff topple on the chosen unsafe route** — driving the rejected direct
  route replays its dangers: passing a steep zone raises an **amber slip-risk
  banner**, and a genuine cliff makes the vehicle **topple — tumbling downhill
  with decaying bounces, then wrecking in blue electrical arcing** — jagged
  lightning-like bolts flickering over the wreck, with point-like spark spatter
  falling under Mars gravity — with the chase camera
  staying on the wreck. A bare over-limit grade no longer topples the
  auto-deployed rover: it tolerates ordinary over-limit terrain and reaches the
  target on a hazardous-but-navigable traverse. It only falls at a
  planner-classified **cliff** zone (or terrain that has become cliff-steep,
  ≥ 35°) — a true near-vertical landform it can fall off or smash into. The
  crewed SEV never takes the risk at all: it halts at the slope envelope and
  holds the crew. The drive ends with a "scout lost"
  report and recovers onto the safe route. This is a dramatization of
  why the planner avoids cliffs, not a physical hazard
  model — the grades come from ~2 km MOLA sampling (regional estimates),
  and since combustion cannot happen in Mars' thin CO₂ atmosphere the
  wreck is shown as electrical discharge from its power bus rather
  than fire.
- **Vehicle selection and crew mission** — ASTRA predicts the safest
  (slope-compliant) and hazardous traverses for the chosen start and destination,
  then picks the vehicle from destination safety. A crew-safe destination sends
  the crewed **Space Exploration Vehicle (SEV)** the full traverse (any distance)
  to park a fixed standoff from the target, where three astronauts (Finn, Rae,
  Fernando) hop out of the SEV and walk or Mars-gravity hop the final approach
  facing their direction of travel, each at an independent pace and hop timing
  with uneven-but-bounded spacing. A hazardous destination
  (or a robot-only task: high physical risk, strict contamination limits,
  repetitive work) parks the SEV at the last safe point and **auto-deploys the
  rover** to the target. Walking and jumping follow Mars gravity (3.71 m/s²).
- **Randomized field-science detours** — on a crew-safe SEV traverse, ASTRA
  scatters up to ten deterministic, off-route science sites a few metres to
  either side of the route, clustered near mapped Mars regions and spaced along
  the traverse. While driving, a prompt offers a detour when an unvisited
  crew-safe site is ~260 m ahead; ignoring it dismisses the prompt until the SEV
  passes. Accepting parks the SEV just off-route, three astronauts step out, walk
  to evenly spaced points around the target facing inward, and loop the rigs'
  `Duck` crouch as the best available working pose. Four illustrative
  experiments are simulated from a per-site seed: a RAD dose tracker, an
  isotope-ratio sampler, a LIBS laser composition measurement and a MOXIE-style
  O₂ reactor. The site switches to an isometric view; clicking another science
  marker within 160 m moves the crew on foot to that target, while **Enter
  vehicle** stays disabled until the current experiment finishes. Activity,
  data and location are logged, with a CSV download; results are deterministic
  per site and explicitly illustrative, not measured NASA data. Unsafe regional
  screening suppresses detours and picks; weather remains visual-only.
- **Layers** — a layer panel toggles NASA base imagery (MOLA hillshade or
  Viking MDIM 2.1) and a **slope-hazard overlay** (green→red at
  5/10/15/25°) computed server-side from the MOLA DEM, plus the 21 gazetteer
  site markers and route overlays.
- **Live atmospheric layer** — a Curiosity REMS station pin on the globe at
  Bradbury Landing shows the latest sol, temperature range, and pressure
  from the live NASA feed.

- **Command/ack channel** — UI map actions are only reported as done after the
  frontend acknowledges the WebSocket command.

## Autonomous rover simulation

The scout defaults to **Fast traverse**, compressing a flat route into roughly
90 seconds at 1× playback (longer on slopes and bends). The HUD shows the actual
time-compression factor. Switch to **Real-time** for a simulated 1 m/s maximum
with acceleration and braking. Playback speed scales either mode by 0.25–4×.
Use the route scrubber before starting to explore any section of a long traverse.
The HUD provides Pause/Resume, playback speed, Stop, and physical speed in m/s;
Stop also cancels preparation before the rover has loaded.

Pause and Stop now brake to a standstill (up to 2.5 seconds from full nominal
speed); Resume accelerates smoothly. These transitions use presentation time,
so fast-traverse compression does not turn braking into an instant freeze.
The HUD distinguishes braking from fully paused. During a drive, world-anchored
illustrative surface mottling and two terrain-clamped wheel trails make forward
motion visible against the soft basemap. Trails retain up to 200 m and fade away
within 18 seconds; wheel dust follows motion and settles under Mars gravity;
these visual cues are simulated, not additional NASA observations.

The rover stays at a fixed model scale. A dense contact envelope uses the shipped
GLB's wheel bounds (including the outer treads), with correction after body tilt
and again before rendering. Wheels follow the ground directly; suspension affects
body attitude. Cached terrain heightmaps provide triangulated heights while
Cesium's asynchronous mesh picker is unavailable. Failed tile requests retain
parent terrain instead of generating zero-height cliffs. The chase camera uses
the same ground fallback with its own smoothing and clearance. Its aim point and
heading are isolated from body suspension; terrain-clearance adjustments move
the eye and aim together to avoid pitching the view on every bump.

Close-up terrain adds deterministic, band-limited ridges and shallow potholes
to the heightmap itself. These are **simulated small-scale relief**, not NASA
measurements. Both mesh rendering and contact sampling see that same surface.
Regional MOLA heights, route planning, and route statistics retain their NASA
data basis. This is a conservative body-contact envelope, not a full articulated
rocker-bogie or tire/soil dynamics solver; basemap imagery remains low resolution.

Verification: `cd frontend && node scripts/verify-rover-contact.mjs`.
Motion checks: `cd frontend && node scripts/verify-drive-motion.mjs`.
Crash checks: `cd frontend && node scripts/verify-crash-physics.mjs`.
Crew/vehicle checks: `cd frontend && node scripts/verify-crew-mission.mjs` and
`node scripts/verify-task-assignment.mjs`.
Weather checks: `cd frontend && node scripts/verify-weather.mjs`.
Science checks: `cd frontend && node scripts/verify-science.mjs`.

### Crew display and failure training

- All HUD panels have a drag handle (mouse or touch) and animate to the nearest
  screen edge on release. Arrow keys move a focused handle; Enter docks it and
  Home resets it. Positions persist for the browser session; panels collapse.
- The larger driving HUD includes a separate draggable, forward-facing rover
  camera window, rendered at 10 fps using the NASA basemap and shared terrain.
- Larger location labels use screen-space collision avoidance. Hazard labels
  take priority and display severity, peak grade, and route distance.
- The chase camera smooths its **relative** height above terrain, bounds heading
  lag, and follows uphill baselines without a delayed overhead swing.
- Arrival slows before the endpoint. The model's rig clip plays once; its mast
  scan plays while stationary and freezes during travel or failure. Manipulator
  clips remain stowed. The supplied GLB has no wheel-spin animation.
- Falls use a fixed-step, along-route rigid-body approximation with 3.71 m/s²
  gravity, hull contact, friction, support-edge torque and inelastic impacts.
  Uphill failures tip backward; downhill failures tip forward. The hull rotates
  about its centre and may travel beyond route endpoints. This remains an
  illustrative vehicle model, not a validated rover stability/soil solver.
- **CO₂ jet training is opt-in**, via the HUD's hazard-training section. NASA
  MRO/HiRISE [PIA22587](https://images.nasa.gov/details/PIA22587) documents seasonal
  south-polar CO₂ jets. No jets are claimed on the Gale/Mount Sharp route. The
  drill's 7.5 m/s launch impulse is hypothetical; subsequent flight and impacts
  use the same Mars-gravity solver. It does not alter NASA route hazard data.

These simulation aids support the challenge's mission-planning objective;
measured imagery/topography/weather, curated interpretation, and hypothetical
failure training remain explicitly distinguished.

### Vehicle selection and surface crew

ASTRA predicts the safest (slope-compliant) and hazardous direct traverses
whenever a start and destination are chosen, and assigns a vehicle from the
destination's safety and the task profile (`frontend/src/map/taskAssignment.ts`).
The **robotic rover** is used when the destination traverse is not
slope-compliant, exceeds the grade limit, or carries an over-limit / rollover /
cliff hazard, or when the task carries a flagged constraint — high physical
risk, strict contamination limits, or repetitive work that would waste crew
time. Otherwise the **Space Exploration Vehicle (SEV)** carries the crew. The
route panel names the choice and the reason.

For a **crew-safe** destination the SEV drives the full traverse, regardless of
distance, and parks a fixed standoff (≈200 m) from the target; the three
astronauts **hop out of the SEV** (Jump → Jump_Land) and **walk or hop the final
approach**, facing the direction of travel. For a **hazardous**
destination the SEV parks at the last safe point before the hazard and the
**rover is auto-deployed** to the target while the crew remains beside the parked
SEV.

Parking is a regional terrain candidate, never a certified landing or
contamination-cleared point: the plan rejects missing terrain, never carries the
vehicle through a known hazard, and keeps the crew aboard if no candidate exists.
The crew's final approach halts and reports if newly rendered terrain exceeds the
mission grade limit.

The supplied astronaut rigs play `Idle`, `Walk`, `Jump`, `Jump_Idle` and
`Jump_Land`. Mars gravity (3.71 m/s²) drives the cues: the walk cadence is
slowed by √(3.71/9.81) relative to Earth, and a bound follows a ballistic arc
(`2·v₀/g`, v₀ = 2.0 m/s, ≈ 1.1 s aloft). The crew bounds continuously: each
stride wraps straight from its brief ground contact into the next leap at a
constant horizontal speed, so there is no lurch between airborne and grounded
phases. A small alternating sideways bank and forward lean peak mid-arc, giving
each astronaut a loping gait. The exported Earth-style jump root motion is
locked out so only one vertical impulse is applied, and every bound plays its
own `Jump` → `Jump_Idle` → `Jump_Land` sequence, each clip running once across
its phase so the takeoff and landing read clearly. The on-screen final approach
is time-compressed so it plays out in ~10–15 s (a fast, floaty low-gravity bound)
and never drops below a brisk 4.5 m/s even for a short standoff; the panel's EVA
estimate still uses the real assumed walking pace, which is far slower. The crew
is never in lockstep: each astronaut has a fixed stride factor, a lateral
formation offset, a staggered start and a staggered exit, and the group is kept
together with a bounded trailing gap so spacing stays uneven without spreading
out. Each rig is oriented to face its direction of travel, and steps out to the
side of the parked SEV with the `Jump` → `Jump_Land` clips. Use the HUD's
**Crew hop · Mars gravity** button during the final approach. The rigs, walk
cadence and jump are illustrative; suits, physiology and consumables are not
modelled.

## Stack

- `backend/` — FastAPI (Python 3.11, uv), Agno + Groq commander, deterministic
  DEM/route/slope-tile services, REMS client.
  `app/map_api.py` registers the terrain, slope, site, and weather map endpoints.
- `frontend/` — Vite + React + TypeScript, CesiumJS, Zod, Zustand, Tailwind.

## Run (dev)

### 0. Environment

```sh
cp .env.example backend/.env
# set GROQ_API_KEY in backend/.env (required for chat)
# NASA_API_KEY is optional; the demo data sources are keyless
```

### 1. MOLA DEM (Git LFS or direct NASA download)

The MOLA MEGDR grids are tracked with Git LFS (the 32 ppd file exceeds GitHub's
100 MiB regular-file limit). After cloning, install Git LFS and run:

```sh
git lfs install
git lfs pull
```

Alternatively, download the 32 ppd grid directly from NASA using the commands
below. The app prefers the 32 ppd grid and
falls back to the 16 ppd one (it reads the grid size from the `.lbl` sidecar,
so either works):

```sh
mkdir -p backend/data/dem
curl -L --retry 3 -o backend/data/dem/megt90n000fb.img \
  https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg032/megt90n000fb.img
curl -L --retry 3 -o backend/data/dem/megt90n000fb.lbl \
  https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg032/megt90n000fb.lbl
```

Set `MOLA_DEM_PATH` in `backend/.env` only if you store it elsewhere.

### 2. Backend

```sh
cd backend
uv sync
uv run fastapi dev app/main.py
```

(`.venv/bin/fastapi dev app/main.py` works too.) Health check:
`GET http://localhost:8000/health`.

### 3. Frontend

```sh
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` and `/ws` to port 8000.

## Demo script

1. **Fly + weather** — "Take me to Gale Crater and tell me the weather."
   Fly-to completes, then the conditions card shows sol, air/ground temps,
   pressure, opacity, UV, and sunrise/sunset.
2. **Briefing** — "Give me the survival briefing for Gale Crater."
   Briefing panel plus a landing-site marker (Bradbury Landing).
3. **Route preview + comparison** — "Plan a 10 degree route from Gale Crater
   to Mount Sharp." Camera frames both traverses: the safe detour in orange
   and the rejected direct route as a dashed red line with danger pins.
   Toggle **Safe route / Direct** in the route panel to switch the preview,
   chart, stats, and danger list; the safe route typically shows no danger
   zones over the limit while the direct route shows them. Drag the
   **Traceroute preview** slider to walk a marker (and the camera) along
   the 3D route; the elevation chart tracks the scrub position and shades
   danger zones. Ask for 5 degrees to see the longer detour; a 3,767 km
    request is no longer rejected by an arbitrary distance cap, but global
    detours remain approximate and may not be found.
4. **Crew mission** — choose a crew-safe destination (within the slope limit):
   click **▶ Start crew mission · SEV to destination** and watch the SEV drive the
   full traverse to park near the target; the three astronauts hop out and walk
   the final approach facing their direction of travel, each at an independent
   pace and hop timing; use **Crew hop · Mars gravity** to see the slowed
   Mars-gravity gait and ballistic hop. Then choose a hazardous destination (or
   flag a robot-only task, for example repetitive work): the button reads **SEV
   parks + rover deploy**, the SEV parks at the last safe point, and the rover
   performs the approach while the crew holds. The rover completes an
   over-limit-but-navigable traverse; it only topples at a genuine cliff, and
   only because the unsafe route was selected. During the drive you can drag to
   orbit, scroll to zoom, use ↑/↓ for speed, Space to pause, C to recenter, and
   Esc or **■ Stop** to end.
5. **Cliff topple** — with the **Direct** traverse selected for a hazardous
   destination, play the rover deployment: passing steep zones raises the amber
   slip-risk banner, and at a cliff zone the rover flips, tumbles downhill, and
   wrecks in flickering blue electrical arcs — ending in a "scout lost" report
   that recovers onto the safe route. (On the safe route it completes without
   incident.)
6. **Layers** — switch base imagery to Viking MDIM; toggle the slope-hazard
   overlay and read the color legend; toggle **Weather & radiation** to show the
   green/amber/red regional screening, then pick a zone in the panel to read its
   estimated temperature, dust, surface dose, scenic character and science value;
   note the live REMS station pin at Bradbury Landing.
7. **Jezero** — "What is the weather at Jezero?" — no fly, nearest-station
   labeling, Octavia E. Butler Landing marker via the briefing.

## Data and provenance

Every displayed measurement carries `{mission, instrument, source_url,
retrieved_at}` from the backend. Key sources:

- Mars Trek MOLA color hillshade — NASA/JPL/USGS Mars Trek (NASA-only layer;
  ESA HRSC layers are intentionally excluded).
- MOLA MEGDR (32 ppd preferred, 16 ppd fallback) — NASA PDS Geosciences
  (MGS MOLA). The terrain, routes, grades, and rover tilt all come from this
  one real NASA DEM.
- Perseverance rover model — NASA 3D Resources (illustrative scout, not a
  drive simulation).
- Space Exploration Vehicle and astronaut character models — user-supplied
  illustrative assets (not NASA measurements).
- REMS weather — Curiosity, NASA/JPL (outreach purposes only).
- Regional weather & radiation screening — ASTRA-derived from published
  planetary ranges (Curiosity RAD surface average ≈ 0.64 mSv/day; latitude and
  regional MOLA elevation). Labelled `derived`; not a measured dose map, dust
  forecast, or certified EVA-safety assessment.
- Mission overviews — NASA Science (MSL, Mars 2020).
- Landing site names — IAU / USGS Gazetteer of Planetary Nomenclature.

Demo interpretation notes are labeled curated or simulated. Measured feeds come
only from the listed NASA sources; the weather/radiation screening is an explicit
derived estimate, never presented as a measurement.

## Known limitations

- Route planning has no arbitrary maximum endpoint distance; endpoints must be
  at least 1 km apart. Long routes use bounded regional-resolution sampling and
  a limited A* search, so a compliant detour may not be found even when one
  exists. Global, multi-resolution and dateline/polar-aware routing remain
  future work; long SEV trips are illustrative previews, not certified travel.
- The nearest-site reference is selected from ASTRA's curated catalog, not the
  complete IAU gazetteer. Bearings/distances are computed geometry, not new NASA
  observations. The app reports slope compliance, not a globally safest route.

- MOLA is ~1.9 km/pixel (32 ppd), so route grades and the rover's terrain
  tilt are regional estimates, not trafficability. Meter-scale landforms
  (rocks, ridges, potholes) are below MOLA resolution and are not measured;
   measured obstacles would need a HiRISE/CTX DTM overlay. Close-up relief is
   explicitly simulated. ETA assumes a 1 m/s scout and is
  simulated.
- The MOLA color hillshade basemap is 463 m/pixel (max level 7), so close
  chase-camera views are soft. Mars Trek has no global higher-resolution
  basemap here; its sparse Gale HiRISE mosaic does not cover the demo route.
- Live weather is Gale-only; Jezero reuses the Gale station with a distance
  label. The weather & radiation panel is a latitude/elevation-scaled planning
  screening, not a measured dose map or dust-storm forecast, and there is no
  habitat model.
- Science targets are curated and unpositioned; no thermal/HiRISE overlays yet.
- The traverse is a preview, not a drive plan. The Perseverance model is an
  illustrative scout: it clamps to the sampled MOLA surface with a simple
  suspension model and tilts with the local slope, but wheels do not have
  per-wheel contact physics or a drive cycle animation. The chase-camera
  orbit control is mouse-only (no touch support).
- The cliff topple is a dramatization, not a hazard model: the rover only
  topples at a planner-classified cliff zone (or terrain that has become
  cliff-steep, ≥ 35°) computed from ~2 km-sampled MOLA grades, the tumble uses
  an approximate
  along-route rigid-body solver, and the electrical sparks are a particle effect —
  combustion cannot happen in Mars' thin CO₂ atmosphere, so the wreck
  is shown arcing electrically instead of burning.
- Meter-scale ridges and potholes in the close-up simulation are synthetic;
  a HiRISE/CTX DTM overlay would be needed for measured meter-scale terrain.
- The astronaut crew, SEV parking and Mars-gravity gait are illustrative: parking
  is a regional MOLA candidate, not a certified landing or contamination-cleared
  point, and suit physiology, consumables and local obstacle avoidance are not
  modelled. Radiation screening is a regional, derived planning estimate — not a
  measured dose or validated EVA limit. Georeferenced science experiment areas of
  interest are not yet defined.

## Checks

See [project and competition status](docs/PROJECT_STATUS.md) for completed work,
remaining limitations, and the official-rule verification still needed.

With the dev servers running and a test Chrome instance started with
`--remote-debugging-port=9222`, run `node frontend/scripts/verify-map-explorer.mjs`
to check hover, off-site selection/bearings, duplicate prevention and search routing.
`node frontend/scripts/verify-environment.mjs` checks the weather/radiation store
(schema, load, selection, layer toggle and failure handling) without a backend.

```sh
cd backend && .venv/bin/ruff check app
cd frontend && npm run lint && npm run build
```

## Attribution

Built for NASA Space Apps Challenge 2026 (Accra). Mars imagery and data remain
the property of NASA/JPL and the cited institutions. Never commit `.env`.
