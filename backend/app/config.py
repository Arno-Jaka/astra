from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ENV_FILE), extra="ignore")

    groq_api_key: str = ""
    nasa_api_key: str = ""
    tts_provider: str = "edge"
    mola_dem_path: str = ""


settings = Settings()
