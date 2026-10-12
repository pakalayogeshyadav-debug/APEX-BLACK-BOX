from pydantic_settings import BaseSettings, SettingsConfigDict
from urllib.parse import quote_plus

class Settings(BaseSettings):
    db_user: str = "root"
    db_password: str = "your_secure_password_here"
    db_name: str = "apex_blackbox"
    db_host: str = "localhost"
    db_port: int = 3306
    api_key: str = "your_secure_api_key_here"
    simulator_esp32_base_url: str = "http://192.168.1.100"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def database_url(self) -> str:
        encoded_password = quote_plus(self.db_password)
        return f"mysql+aiomysql://{self.db_user}:{encoded_password}@{self.db_host}:{self.db_port}/{self.db_name}"

settings = Settings()
