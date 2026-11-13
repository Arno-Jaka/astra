# ASTRA implementation and competition status

Updated 12 November 2026.

## Completed

- Destination-driven vehicle workflow: whenever a start and destination are
  chosen, ASTRA predicts the safest (slope-compliant) and hazardous direct
  traverses. A crew-safe destination sends the crewed Space Exploration Vehicle
  (SEV) the full traverse (any distance) to park a fixed standoff from the target;
  a hazardous destination parks the SEV at the last safe point and auto-deploys
  the rover to the target.
- NASA-sourced 2025 boxwork science objective (default) and regional Mount Sharp
  focus, with the mission parameters (objective, slope envelope, pace, suit/kit
  allowance, science time, reserve, budget) edited in the traverse plan rather
  than a separate science-mission panel.
- Crew final-approach time estimate for the on-foot leg only, with a snapshot and
  recalculation support. Independent time and slope assessments.
- NASA Mars Trek imagery, MOLA terrain and slope layers, terrain-service fallback.
- Site-only 1.5-second hover inspection with image, elevation, sourced background,
  target-adjacent positioning, hover emphasis, and dismissal on leaving the target.
- Top-center site search, information, and explicit start/destination controls.
- Single-click selection on both site markers and arbitrary terrain; distinct
  endpoints required. Cyan/orange spinning selection rings.
- Off-site reference distances and compass/numeric bearings from the nearest
  curated site, including dateline handling. Coordinate selection works without
  loading the DEM; route computation still needs it.
- Automatic route comparison, slope-compliant detours and hazardous direct routes
  when found, with explicit unavailable outcomes, elevation profiles and hazards.
- Rover preview, accelerated simulation, chase and rover cameras, draggable HUDs,
  illustrative crash/CO₂ training, and separation of measured/simulated content.
- Automatic vehicle selection (robotic rover vs crewed SEV) from destination
  safety and task flags, using one shared policy for the route panel and the
  launch.
- Three-astronaut SEV crew (Finn, Rae, Fernando) that drives to the target (or the
  last safe point), hops out, then walks the final approach or holds while the
  rover is deployed. Idle/walk/jump/jump-land clips use Mars gravity (3.71 m/s²):
  a slowed gait and a ballistic hop with the exported Earth-style jump root motion
  locked out. Each astronaut faces the direction of travel with an independent
  pace, hop timing and uneven-but-bounded spacing, and steps out with the jump and
  jump-land clips.
- Automated endpoint, geometry, build/lint and browser interaction checks.

## Competition alignment

The README identifies the target as **Interplanetary Survival Guide: Martian Map,
NASA Space Apps Challenge 2026 (Accra)**. These features remain aligned with the
documented objective: a sourced Mars exploration and mission-planning interface.
Selecting points away from named sites supports that objective; it does not
change the data basis of the app.

The user has now supplied the challenge objectives. Their implementation mapping
is in [CHALLENGE_ALIGNMENT.md](CHALLENGE_ALIGNMENT.md). The app follows the
astronaut/science focus and the suggested three-data-type approach. This is
**not verified eligibility or organizer approval**: the exact challenge title/year,
mandatory deliverables, permitted development window, submission rules and local
event requirements still need verification against organizer instructions.

For presentation, describe MOLA routes as **regional slope-based estimates**, not
certified safe rover navigation or proof of the globally safest route. Context
bearings are derived from sourced site coordinates. Only Gale has a REMS station
feed here; other locations do not have local live weather. Synthetic small-scale
relief and failure training remain labeled simulations.

## Remaining work

1. Verify submission eligibility and any administrative requirements not included
   in the supplied objectives. The objective-to-feature mapping is documented.
2. Prepare/verify the deployed demo, team submission page, presentation/video,
   source and asset credits, and any required AI-use disclosures under those rules.
3. The arbitrary 400 km route rejection has been removed so longer SEV traverses
   can be previewed. Add hierarchical/global routing and dateline/polar handling
   to make long-distance safe-route search reliable; bounded sampling and A*
   search may miss compliant detours on long trips.
4. Scientific upgrades: georeferenced boxwork observation stations and measured
   HiRISE/CTX terrain for local obstacles, broader site coverage, and spatial
   environmental/radiation data. Current MOLA resolution is ~1.9 km/pixel;
   rocks, soil traction and small cliffs are unresolved. Crew timing is a scenario
   calculation; validated suit/physiology/consumable models remain future work.
   SEV parking is a regional terrain candidate, not a certified safe/landing or
   contamination-cleared point, there is no local obstacle avoidance on the final
   approach, and georeferenced science experiment areas of interest are not yet
   defined.
5. Expand device/accessibility testing and production failure/recovery coverage.
