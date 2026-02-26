from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import computed_field
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Database
    database_url: str = "postgresql+asyncpg://repairdesk_user:password@localhost:5432/repairdesk"

    # Security
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24  # 24 hours in dev (15 min in prod via .env)
    refresh_token_expire_days: int = 7

    # MinIO
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "repairdesk_access"
    minio_secret_key: str = "change_me"
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
    cors_origins: list[str] = ["http://localhost:3000"]
    
    # Twilio
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""

    # Super-Admin (platform-level, not stored in DB)
    admin_email: str = "admin@repairdesk.app"
    admin_password: str = "change_me_strong_admin_password"

    # Stripe
    stripe_publishable_key: str = ""
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    frontend_url: str = "http://localhost:3000"

    @computed_field  # type: ignore[misc]
    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
