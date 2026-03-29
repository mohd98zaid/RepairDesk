from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import computed_field, model_validator
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Database
    database_url: str = ""

    # Security
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # MinIO
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = ""
    minio_secret_key: str = ""
    minio_bucket: str = "repairdesk"
    minio_use_ssl: bool = False

    # Email
    smtp_host: str = "smtp.example.com"
    smtp_port: int = 587
    smtp_user: str = "noreply@repairdesk.app"
    smtp_password: str = ""
    from_email: str = "RepairDesk <noreply@repairdesk.app>"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # App
    app_url: str = "http://localhost:3000"
    environment: str = "development"
    cors_origins: str | list[str] = ["http://localhost:3000"]
    
    # Twilio
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""

    # Super-Admin (platform-level, not stored in DB)
    admin_email: str = ""
    admin_password: str = ""

    # Stripe
    stripe_publishable_key: str = ""
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    frontend_url: str = "http://localhost:3000"

    @model_validator(mode="after")
    def fix_cors_and_db(self) -> "Settings":
        # Fix database URL format for asyncpg
        if self.database_url:
            if self.database_url.startswith("postgres://"):
                self.database_url = self.database_url.replace("postgres://", "postgresql+asyncpg://", 1)
            elif self.database_url.startswith("postgresql://"):
                self.database_url = self.database_url.replace("postgresql://", "postgresql+asyncpg://", 1)
                
        # Gracefully handle comma-separated strings for cors_origins
        if isinstance(self.cors_origins, str):
            # Clean up potential accidental brackets from invalid JSON strings
            cleaned = self.cors_origins.strip().strip("[]").strip()
            self.cors_origins = [
                x.strip().strip("\"'") for x in cleaned.split(",") if x.strip()
            ]
            
        return self

    @computed_field  # type: ignore[misc]
    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
