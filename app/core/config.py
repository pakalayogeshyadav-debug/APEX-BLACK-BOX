import os
from typing import Optional, List
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from urllib.parse import quote_plus

class Settings(BaseSettings):
    # Database Settings
    db_user: str = "root"
    db_password: str = "your_secure_password_here"
    db_name: str = "apex_blackbox"
    db_host: str = "localhost"
    db_port: int = 3306
    database_url_env: Optional[str] = Field(None, alias="DATABASE_URL")

    # API & Security Settings
    api_key: str = "your_secure_api_key_here"
    cors_origins: str = "*"

    # Hardware & Simulation Settings
    simulator_esp32_base_url: str = "http://192.168.1.100"
    enable_serial_ingestion: bool = True

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def database_url(self) -> str:
        # If DATABASE_URL is set directly in the environment (e.g. Render / Managed MySQL), use it
        if self.database_url_env:
            url = self.database_url_env
            # Normalize driver prefix for async SQLAlchemy
            if url.startswith("mysql://"):
                url = "mysql+aiomysql://" + url[len("mysql://"):]
            elif url.startswith("mysql2://"):
                url = "mysql+aiomysql://" + url[len("mysql2://"):]
            return url

        # Otherwise construct from individual parameters
        encoded_password = quote_plus(self.db_password)
        return f"mysql+aiomysql://{self.db_user}:{encoded_password}@{self.db_host}:{self.db_port}/{self.db_name}"

    @property
    def allowed_cors_origins(self) -> List[str]:
        if not self.cors_origins or self.cors_origins.strip() == "*":
            return ["*"]
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

settings = Settings()
