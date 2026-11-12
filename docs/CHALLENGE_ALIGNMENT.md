# Mapping the supplied challenge objectives to ASTRA

Basis: the Objectives text supplied by the project owner on 12 November 2026.
It asks for a NASA-data-backed map/tool/interface for astronaut surface exploration.
It **suggests**, rather than mandates, three data categories, space weather and
obstacle-avoiding routes. This document assesses that scope, not event eligibility.

| Objective/guidance | Implementation | Scope and remaining gap |
| --- | --- | --- |
| An interface for a Mars astronaut | Astronaut science mission panel, site search, arbitrary-point selection, sourced inspection and route comparison | Exploration/planning prototype; rover simulation is a supplementary visualization |
| Identify scientific goals and an exploration area | Editable science objective; default ancient-groundwater/boxwork investigation in Gale/Mount Sharp; observation tasks and NASA Mastcam context | Regional focus only. No fabricated precise boxwork station coordinates or verified mineral detections |
| Use NASA data and tools | Mars Trek/Viking, MGS MOLA from PDS, MSL Mastcam and REMS, source links | IAU/USGS coordinates provide additional named-site context; geometry and EVA timing are derived calculations |
| Consider at least three kinds of data | Optical images, topographic terrain/slopes, atmospheric station observations in one mission workflow | Atmospheric feed is Gale-only, dated, and may be unavailable. No global weather layer or forecast |
| Prioritize crew safety | Slope-compliance comparison, danger annotations, round-trip time allocation and reserve, explicit unknown hazards | Regional slope assessment and assumed time feasibility are not evidence of overall safety |
| Account for suits/equipment and science tasks | User-assumed walking pace and additional suit/kit travel-time percentage; science stop; return reserve; EVA budget | No empirical mass-to-metabolism model, oxygen calculation or certified suit envelope |
| If possible, route to scientific objectives while avoiding obstacles | Route from a chosen departure point to a candidate science station, with slope-constrained detours when found | MOLA cannot resolve individual rocks or local cliffs; verified outcrop access needs georeferenced high-resolution imagery/DTMs |
| Consider radiation/space weather | The mission/route assessment explicitly identifies radiation as unassessed | Radiation observations, alerts, dose/exposure integration and validated limits are not implemented |

## Science source

[NASA: Curiosity Views Boxwork Patterns at a Distance](https://science.nasa.gov/photojournal/curiosity-views-boxwork-patterns-at-a-distance/)
documents Mastcam's May 22, 2025 (sol 4536) panorama, PIA26560, of low boxwork
ridges in Mount Sharp's foothills. NASA describes the groundwater/mineral-cement
interpretation. The image has Earth-like color balance and is credited to
NASA/JPL-Caltech/MSSS. It is science context, not a georeferenced obstacle overlay.

## Crew time calculation

```
outbound_hours = route_distance_km × 1000 / assumed_pace_m_s / 3600
                 × (1 + suit_equipment_time_allowance_pct / 100)
return_hours = outbound_hours
planned_hours = outbound_hours + return_hours + science_minutes/60 + reserve_minutes/60
budget_margin_hours = EVA_budget_hours - planned_hours
```

The user supplies all mobility/time assumptions. Return follows the same path.
The longer slope-compliant detour and shorter hazardous route each receive their
own time estimate. Passing the time check does not override a failed slope check.
An assumption snapshot travels with the route; edits require recalculation.

## Suggested demonstration

1. Open the astronaut mission panel and explain the boxwork science objective.
2. Frame Mount Sharp; compare optical imagery with MOLA slopes. Inspect a site.
3. Show the dated Gale station report (or its honest unavailable state).
4. Choose a departure point and a candidate science destination; compare routes.
5. Show how a long slope-compliant route can exceed the crew time budget.
6. Modify pace/suit allowance/reserve, recalculate, and explain which assessments
   changed and which hazards remain unmeasured.

Tests cover input validation, round-trip/reserve arithmetic, distinct alternative
distances, independence of slope/time checks, source/context availability, browser
workflow, atmospheric outage, assumption snapshots and recalculation.
