from dataclasses import dataclass

GAZETTEER_URL = "https://planetarynames.wr.usgs.gov/"


@dataclass(frozen=True)
class Site:
    name: str
    lon: float
    lat: float
    aliases: tuple[str, ...]
    source_url: str = GAZETTEER_URL


SITES: tuple[Site, ...] = (
    Site("Gale Crater", 137.4, -5.4, ("gale", "gale crater")),
    Site(
        "Mount Sharp (Aeolis Mons)",
        137.8,
        -5.1,
        ("mount sharp", "aeolis mons", "mount sharp (aeolis mons)"),
    ),
    Site("Jezero Crater", 77.6, 18.4, ("jezero", "jezero crater")),
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
