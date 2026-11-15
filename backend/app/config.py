from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ENV_FILE), extra="ignore")

    groq_api_key: str = ""
    nasa_api_key: str = ""
    mola_dem_path: str = ""

    # Service / networking
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # External data and source URLs
    mola_source_url: str = (
        "https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/"
    )
    trek_imagery_base_url: str = "https://trek.nasa.gov/mars/"
    trek_tile_base_url: str = "https://trek.nasa.gov/tiles/Mars/EQ"
    trek_viking_imagery_path: str = (
        "Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/"
    )
    msl_source_url: str = "https://science.nasa.gov/mission/msl-curiosity/"
    m2020_source_url: str = "https://science.nasa.gov/mission/mars-2020-perseverance/"
    gazetteer_url: str = "https://planetarynames.wr.usgs.gov/"
    rems_url: str = "https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json"
    rems_user_agent: str = "ASTRA/0.1 (NASA Space Apps)"
    boxwork_source_url: str = (
        "https://science.nasa.gov/photojournal/curiosity-views-boxwork-patterns-at-a-distance/"
    )
    boxwork_image_url: str = (
        "https://assets.science.nasa.gov/content/dam/science/psd/photojournal/"
        "pia/pia26/pia26560/PIA26560.jpg"
    )
    rad_source_url: str = (
        "https://science.nasa.gov/mission/msl-curiosity/science-instruments/"
    )


settings = Settings()
