from typing import Any

from .rems import REMS_URL

MSL_URL = "https://science.nasa.gov/mission/msl-curiosity/"
M2020_URL = "https://science.nasa.gov/mission/mars-2020-perseverance/"
GAZETTEER_URL = "https://planetarynames.wr.usgs.gov/"

BRIEFINGS: dict[str, dict[str, Any]] = {
    "Gale Crater": {
        "headline": "A vanished lake beneath a layered mountain",
        "summary": (
            "Gale Crater is a roughly 154 km impact basin holding Aeolis Mons "
            "(Mount Sharp), a km-scale stack of layered sediments. Orbital and "
            "Curiosity data show ancient lakes and groundwater; the lower mound "
            "records a shift from wetter to drier conditions."
        ),
        "why_it_matters": [
            "Clay-rich layers preserve evidence of long-lived liquid water and habitable chemistry.",
            "Mount Sharp's strata expose a record of early Mars climate change.",
            "Curiosity's REMS station provides the live surface weather feed used by ASTRA.",
        ],
        "hazards": [
            {
                "label": "Terrain",
                "detail": (
                    "Mount Sharp's flanks are steep. The route planner enforces a "
                    "slope limit from 16 ppd MOLA (~3.7 km/px); treat grades as a "
                    "regional estimate, not local trafficability."
                ),
                "source_url": MSL_URL,
            },
            {
                "label": "Dust",
                "detail": (
                    "Local dust activity can reduce visibility. REMS atmospheric "
                    "opacity is an indicator, not a full storm forecast."
                ),
                "source_url": REMS_URL,
            },
            {
                "label": "Cold",
                "detail": (
                    "Air temperatures can drop below -70 °C at night with surface "
                    "pressure near 700 Pa; power and thermal systems must handle the swing."
                ),
                "source_url": REMS_URL,
            },
            {
                "label": "Unmodeled risks",
                "detail": (
                    "ASTRA does not model radiation dose, dust-storm timing, or "
                    "rover trafficability. Use this as a planning preview."
                ),
                "source_url": GAZETTEER_URL,
            },
        ],
        "science_targets": [
            {
                "name": "Yellowknife Bay",
                "kind": "Clay-bearing mudstone",
                "note": "Ancient lake and groundwater deposits drilled by Curiosity.",
                "source_url": MSL_URL,
            },
            {
                "name": "Pahrump Hills",
                "kind": "Layered mudstone",
                "note": "Basal Mount Sharp layers recording lake and groundwater chemistry.",
                "source_url": MSL_URL,
            },
            {
                "name": "Murray Buttes",
                "kind": "Sandstone buttes",
                "note": "Mark a transition toward drier conditions.",
                "source_url": MSL_URL,
            },
            {
                "name": "Vera Rubin Ridge",
                "kind": "Hematite ridge",
                "note": "Iron-oxide-rich rocks recording changing oxidation.",
                "source_url": MSL_URL,
            },
            {
                "name": "Glen Torridon",
                "kind": "Clay-bearing unit",
                "note": "Ancient habitable environment explored by Curiosity.",
                "source_url": MSL_URL,
            },
            {
                "name": "Gediz Vallis",
                "kind": "Valley and debris channel",
                "note": "Relatively recent water and debris-flow deposits.",
                "source_url": MSL_URL,
            },
            {
                "name": "Bagnold Dunes",
                "kind": "Active sand dunes",
                "note": "Wind-driven surface processes in the crater.",
                "source_url": MSL_URL,
            },
        ],
        "landing": {
            "name": "Bradbury Landing (Curiosity)",
            "lon": 137.4417,
            "lat": -4.5895,
            "source_url": MSL_URL,
        },
        "source_url": MSL_URL,
    },
    "Jezero Crater": {
        "headline": "A delta, a lake, and a sample hunt",
        "summary": (
            "Jezero Crater is a roughly 45 km basin where a river built a delta "
            "into an ancient lake. Perseverance is exploring fine-grained delta "
            "sediments and crater-floor rocks for signs of past microbial life "
            "and collecting samples for future return."
        ),
        "why_it_matters": [
            "Delta and lake sediments are prime targets for preserving biosignatures.",
            "Carbonate and clay minerals can record past water chemistry.",
            "The crater floor and margin unit expose diverse volcanic and sedimentary rocks.",
        ],
        "hazards": [
            {
                "label": "Nearest weather station",
                "detail": (
                    "No live weather station is at Jezero. The nearest REMS feed is "
                    "at Gale Crater, roughly 3,800 km away, and is labeled as such."
                ),
                "source_url": REMS_URL,
            },
            {
                "label": "Terrain",
                "detail": (
                    "Delta scarps and rough terrain are below the resolution of the "
                    "16 ppd MOLA route estimate. Check local imagery before driving."
                ),
                "source_url": M2020_URL,
            },
            {
                "label": "Dust and cold",
                "detail": (
                    "Dust and cold nights remain planetary-scale risks; no real-time "
                    "hazard map is available in ASTRA."
                ),
                "source_url": M2020_URL,
            },
            {
                "label": "Unmodeled risks",
                "detail": (
                    "ASTRA does not model radiation dose, dust-storm timing, or "
                    "rover trafficability. Use this as a planning preview."
                ),
                "source_url": GAZETTEER_URL,
            },
        ],
        "science_targets": [
            {
                "name": "Delta front",
                "kind": "Fine-grained delta sediments",
                "note": "Where the river met the lake; high biosignature potential.",
                "source_url": M2020_URL,
            },
            {
                "name": "Crater floor",
                "kind": "Igneous and sedimentary rocks",
                "note": "Record lake and groundwater history explored by Perseverance.",
                "source_url": M2020_URL,
            },
            {
                "name": "Seitah",
                "kind": "Olivine-rich layered terrain",
                "note": "Rugged unit explored during the early traverse.",
                "source_url": M2020_URL,
            },
            {
                "name": "Margin unit",
                "kind": "Carbonate-bearing rocks",
                "note": "Carbonates along the crater margin can record past water chemistry.",
                "source_url": M2020_URL,
            },
            {
                "name": "Western fan",
                "kind": "River and delta deposits",
                "note": "Stacked fan deposits recording multiple flow events.",
                "source_url": M2020_URL,
            },
        ],
        "landing": {
            "name": "Octavia E. Butler Landing (Perseverance)",
            "lon": 77.4508,
            "lat": 18.4447,
            "source_url": M2020_URL,
        },
        "source_url": M2020_URL,
    },
}

ALIASES = {"Mount Sharp (Aeolis Mons)": "Gale Crater"}


def briefing_for(site_name: str) -> dict[str, Any] | None:
    key = ALIASES.get(site_name, site_name)
    data = BRIEFINGS.get(key)
    if data is None:
        return None
    return {**data, "region": key}
