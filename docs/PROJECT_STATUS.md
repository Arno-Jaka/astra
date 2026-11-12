# ASTRA implementation and competition status

Updated 12 November 2026.

## Completed

- Astronaut science mission panel with a NASA-sourced 2025 boxwork objective,
  Mastcam panorama, and regional Mount Sharp focus.
- Combined optical/topographic/atmospheric context, dated Gale REMS reports,
  report-age display and explicit feed-outage handling.
- Crew-specific round-trip time allocations with user-assumed pace, suit/kit
  allowance, science time, return reserve and budget; snapshot and recalculation
  support for both alternatives. Independent time and slope assessments.
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
3. If longer travel is needed, replace the 400 km regional limit with hierarchical
   routing and global longitude/polar handling rather than merely removing it.
4. Scientific upgrades: georeferenced boxwork observation stations and measured
   HiRISE/CTX terrain for local obstacles, broader site coverage, and spatial
   environmental/radiation data. Current MOLA resolution is ~1.9 km/pixel;
   rocks, soil traction and small cliffs are unresolved. Crew timing is a scenario
   calculation; validated suit/physiology/consumable models remain future work.
5. Expand device/accessibility testing and production failure/recovery coverage.
