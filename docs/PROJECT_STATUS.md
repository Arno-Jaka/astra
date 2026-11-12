# ASTRA implementation and competition status

Updated 12 November 2026.

## Completed

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
- Automated endpoint, geometry, build/lint and browser interaction checks.

## Competition alignment

The README identifies the target as **Interplanetary Survival Guide: Martian Map,
NASA Space Apps Challenge 2026 (Accra)**. These features remain aligned with the
documented objective: a sourced Mars exploration and mission-planning interface.
Selecting points away from named sites supports that objective; it does not
change the data basis of the app.

This is an alignment assessment, **not verified eligibility or organizer approval**.
No official challenge brief/rule document is stored in this repository, and the
official website could not be retrieved in this environment during this review.
The exact challenge title/year, mandatory deliverables, permitted development
window, submission rules and local event requirements still need verification
against the team's official challenge link and organizer instructions.

For presentation, describe MOLA routes as **regional slope-based estimates**, not
certified safe rover navigation or proof of the globally safest route. Context
bearings are derived from sourced site coordinates. Only Gale has a REMS station
feed here; other locations do not have local live weather. Synthetic small-scale
relief and failure training remain labeled simulations.

## Remaining work

1. Verify the exact official competition brief and submission eligibility; map
   each mandatory requirement to evidence in the project and demo.
2. Prepare/verify the deployed demo, team submission page, presentation/video,
   source and asset credits, and any required AI-use disclosures under those rules.
3. If longer travel is needed, replace the 400 km regional limit with hierarchical
   routing and global longitude/polar handling rather than merely removing it.
4. Optional scientific upgrades: measured HiRISE/CTX terrain for local obstacles,
   broader site coverage, and spatial weather/environmental datasets. Current
   MOLA resolution is ~1.9 km/pixel; rocks, soil traction and small cliffs are unresolved.
5. Expand device/accessibility testing and production failure/recovery coverage.
