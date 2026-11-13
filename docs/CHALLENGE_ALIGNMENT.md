# Mapping the supplied challenge objectives to ASTRA

Basis: the Objectives text supplied by the project owner on 12 November 2026.
It asks for a NASA-data-backed map/tool/interface for astronaut surface exploration.
It **suggests**, rather than mandates, three data categories, space weather and
obstacle-avoiding routes. This document assesses that scope, not event eligibility.

| Objective/guidance | Implementation | Scope and remaining gap |
| --- | --- | --- |
| An interface for a Mars astronaut | Site search, arbitrary-point selection, sourced inspection, safe/hazardous route comparison and a destination-driven SEV/rover mission | Exploration/planning prototype; rover simulation is a supplementary visualization |
| Identify scientific goals and an exploration area | Editable science objective; default ancient-groundwater/boxwork investigation in Gale/Mount Sharp; NASA Mastcam context | Regional focus only. No fabricated precise boxwork station coordinates or verified mineral detections; georeferenced science experiment areas of interest are future work |
| Use NASA data and tools | Mars Trek/Viking, MGS MOLA from PDS, MSL Mastcam and REMS, source links | IAU/USGS coordinates provide additional named-site context; geometry and EVA timing are derived calculations |
| Consider at least three kinds of data | Optical images, topographic terrain/slopes, atmospheric station observations, and a derived regional weather/radiation screening in one mission workflow | Atmospheric feed is Gale-only, dated, and may be unavailable. The screening is derived, not a global measured weather/radiation layer |
| Prioritize crew safety | Slope-compliance comparison, danger annotations, regional weather/radiation screening (safe/caution/unsafe), round-trip time allocation and reserve, explicit unknown hazards | Regional slope assessment, derived screening and assumed time feasibility are not evidence of overall safety |
| Account for suits/equipment and science tasks | User-assumed walking pace and additional suit/kit travel-time percentage; science stop; return reserve; EVA budget | No empirical mass-to-metabolism model, oxygen calculation or certified suit envelope |
| If possible, route to scientific objectives while avoiding obstacles | Route from a chosen departure point to a candidate science station, with slope-constrained detours when found | MOLA cannot resolve individual rocks or local cliffs; verified outcrop access needs georeferenced high-resolution imagery/DTMs |
| Consider radiation/space weather | Regional weather + radiation screening classifies 21 mapped zones **safe / caution / unsafe**, with scenic character and science value, plus estimated temperature range, dust index and surface dose, and a separate dynamic simulated surface-weather layer | Screening is derived from published planetary ranges and latitude/regional elevation; not a measured dose map or dust forecast. The dynamic weather (sandstorms, dust tornado, electrostatic lightning, CO₂ ice squalls, ice fog) is invented visual FX, not a measured atmosphere, forecast or space-weather alert service, and neither view is validated exposure limits |

The weather/radiation screening is deliberately an **illustrative regional
screening**, not a certified EVA assessment. Per-zone estimates are derived from
latitude and approximate regional elevation, anchored to published ranges such
as the Curiosity RAD surface average (~0.64 mSv/day); they are not measured dose
or dust values for a spot. Terrain and slope safety are assessed separately by
the route planner so the two risk views are not conflated. A separate dynamic
surface-weather layer adds visible, invented events (sandstorm walls, a dust
tornado, electrostatic lightning, CO₂ ice squalls, ice fog) to the 3D assets; it
is deliberately illustrative, not a forecast or a measured atmosphere, and it is
kept distinct from the screening numbers. The same events can occur in a safe
region — the layer is visual-only and never affects traversal — with the
screening class only shifting their relative frequency.

Beyond that mapping, ASTRA selects between a crewed Space Exploration Vehicle
(SEV) and a robotic rover from destination safety and robot-only task criteria
(high physical risk, strict contamination limits, repetitive work). A crew-safe
destination sends the SEV the full traverse to park a fixed standoff from the
target, where the three-person crew hops out and walks or hops the final approach
facing the direction of travel at independent paces; a hazardous
destination parks the SEV at the last safe point and auto-deploys the rover to
the target. Parking is not a certified landing/contamination-clear point, and the
robot-only criteria are task policies, not validated sterility or contamination
models.

## Science source

[NASA: Curiosity Views Boxwork Patterns at a Distance](https://science.nasa.gov/photojournal/curiosity-views-boxwork-patterns-at-a-distance/)
documents Mastcam's May 22, 2025 (sol 4536) panorama, PIA26560, of low boxwork
ridges in Mount Sharp's foothills. NASA describes the groundwater/mineral-cement
interpretation. The image has Earth-like color balance and is credited to
NASA/JPL-Caltech/MSSS. It is science context, not a georeferenced obstacle overlay.

## Crew time calculation

The SEV drives the traverse, so the crew's time calculation now covers only the
**on-foot final approach** from the parked SEV to the target:

```
approach_km = standoff between parked SEV and target (≈0.2 km)
outbound_hours = approach_km × 1000 / assumed_pace_m_s / 3600
                 × (1 + suit_equipment_time_allowance_pct / 100)
return_hours = outbound_hours
planned_hours = outbound_hours + return_hours + science_minutes/60 + reserve_minutes/60
budget_margin_hours = EVA_budget_hours - planned_hours
```

The user supplies all mobility/time assumptions. Return follows the same path.
When the rover performs the approach, there is no on-foot leg. Passing the time
check does not override a failed slope check. An assumption snapshot travels with
the route; edits require recalculation.

## Suggested demonstration

1. Explain the boxwork science objective and the destination-driven vehicle
   choice: a crew-safe destination uses the SEV, a hazardous one parks the SEV and
   deploys the rover.
2. Frame Mount Sharp; compare optical imagery with MOLA slopes. Inspect a site.
3. Show the dated Gale station report (or its honest unavailable state) from the
   conditions card.
4. Choose a departure point and a candidate science destination; compare the
   safest and hazardous routes.
5. Show how the SEV drives the full traverse to a crew-safe destination, parks,
   and the three astronauts hop out and walk the final approach facing their
   direction of travel; use the Mars-gravity hop.
   Then show a hazardous destination: the SEV parks at the last safe point and the
   rover is auto-deployed. Note that parking is a regional terrain candidate, not a
   certified landing or contamination-clear point.
6. Modify pace/suit allowance/reserve under Mission parameters, recalculate, and
   explain which assessments changed and which hazards remain unmeasured.

Tests cover input validation, round-trip/reserve arithmetic, distinct alternative
distances, independence of slope/time checks, source/context availability, browser
workflow, atmospheric outage, assumption snapshots and recalculation.
