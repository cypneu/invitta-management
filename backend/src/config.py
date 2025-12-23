from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:postgres@db:5432/production_tracker"
    baselinker_api_token: str = ""
    sync_interval_minutes: int = 5
    admin_code: str = "admin"

    class Config:
        env_file = ".env"


settings = Settings()
