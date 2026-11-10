from dataclasses import dataclass

GAZETTEER_URL = "https://planetarynames.wr.usgs.gov/"


def feature_url(feature_id: int) -> str:
    return f"{GAZETTEER_URL}Feature/{feature_id}"


@dataclass(frozen=True)
class Site:
    name: str
    lon: float
    lat: float
    aliases: tuple[str, ...]
    kind: str = ""
    description: str = ""
    source_url: str = GAZETTEER_URL


# Coordinates are from the IAU/USGS Gazetteer of Planetary Nomenclature
# (planetocentric, +East, 0-360). The first three sites are the demo sites
# with curated briefings; the rest are marked for context and fly-to.
SITES: tuple[Site, ...] = (
    Site(
        "Gale Crater",
        137.81,
        -5.37,
        ("gale", "gale crater"),
        "Crater",
        "Curiosity landing site",
        feature_url(2071),
    ),
    Site(
        "Mount Sharp (Aeolis Mons)",
        137.85,
        -5.08,
        ("mount sharp", "aeolis mons", "mount sharp (aeolis mons)"),
        "Mons",
        "Central mound of Gale Crater",
        feature_url(15000),
    ),
    Site(
        "Jezero Crater",
        77.69,
        18.41,
        ("jezero", "jezero crater"),
        "Crater",
        "Perseverance landing site",
        feature_url(14300),
    ),
    Site(
        "Olympus Mons",
        226.20,
        18.65,
        ("olympus mons",),
        "Mons",
        "Largest volcano on Mars",
        feature_url(4453),
    ),
    Site(
        "Valles Marineris",
        301.41,
        -14.01,
        ("valles marineris",),
        "Vallis",
        "Largest canyon system on Mars",
        feature_url(6288),
    ),
    Site(
        "Hellas Planitia",
        70.50,
        -42.43,
        ("hellas", "hellas planitia"),
        "Planitia",
        "Large impact basin",
        feature_url(2432),
    ),
    Site(
        "Elysium Mons",
        147.21,
        25.02,
        ("elysium mons",),
        "Mons",
        "Volcano in the Elysium region",
        feature_url(1783),
    ),
    Site(
        "Argyre Planitia",
        316.69,
        -49.84,
        ("argyre", "argyre planitia"),
        "Planitia",
        "Large impact basin",
        feature_url(371),
    ),
    Site(
        "Syrtis Major Planitia",
        69.50,
        9.39,
        ("syrtis major",),
        "Planitia",
        "Dark volcanic region",
        feature_url(6910),
    ),
    Site(
        "Meridiani Planum",
        356.86,
        -0.04,
        ("meridiani", "meridiani planum"),
        "Planum",
        "Opportunity landing site",
        feature_url(3854),
    ),
    Site(
        "Gusev Crater",
        175.52,
        -14.53,
        ("gusev", "gusev crater"),
        "Crater",
        "Spirit landing site",
        feature_url(2289),
    ),
    Site(
        "Isidis Planitia",
        88.38,
        13.94,
        ("isidis", "isidis planitia"),
        "Planitia",
        "Beagle 2 / Schiaparelli landing site",
        feature_url(2735),
    ),
    Site(
        "Utopia Planitia",
        117.52,
        46.74,
        ("utopia", "utopia planitia"),
        "Planitia",
        "Viking 2 landing site",
        feature_url(6260),
    ),
    Site(
        "Chryse Planitia",
        319.69,
        28.43,
        ("chryse", "chryse planitia"),
        "Planitia",
        "Viking 1 landing site",
        feature_url(1203),
    ),
    Site(
        "Noctis Labyrinthus",
        258.81,
        -6.36,
        ("noctis", "noctis labyrinthus"),
        "Labyrinthus",
        "Canyon network west of Valles Marineris",
        feature_url(4324),
    ),
    Site(
        "Ascraeus Mons",
        255.92,
        11.92,
        ("ascraeus mons",),
        "Mons",
        "Tharsis volcano",
        feature_url(417),
    ),
    Site(
        "Pavonis Mons",
        247.04,
        1.48,
        ("pavonis mons",),
        "Mons",
        "Tharsis volcano",
        feature_url(4620),
    ),
    Site(
        "Arsia Mons",
        239.91,
        -8.26,
        ("arsia mons",),
        "Mons",
        "Tharsis volcano",
        feature_url(394),
    ),
    Site(
        "Alba Mons",
        249.29,
        41.08,
        ("alba mons",),
        "Mons",
        "Large volcano",
        feature_url(14306),
    ),
    Site(
        "Huygens Crater",
        55.58,
        -13.88,
        ("huygens", "huygens crater"),
        "Crater",
        "Large impact crater",
        feature_url(2596),
    ),
    Site(
        "Schiaparelli Crater",
        16.77,
        -2.71,
        ("schiaparelli", "schiaparelli crater"),
        "Crater",
        "ExoMars Schiaparelli landing site",
        feature_url(5366),
    ),
)


def resolve(location: str) -> Site | None:
    needle = " ".join(location.lower().split())
    if not needle:
        return None
    for site in SITES:
        candidates = (site.name.lower(), *site.aliases)
        if any(c == needle or c in needle or needle in c for c in candidates):
            return site
    return None
