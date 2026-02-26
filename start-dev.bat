@echo off
echo Starting RepairDesk (DEV)...
docker compose -f infra\compose\docker-compose.dev.yml up --build -d
echo.
echo App is running:
echo   Web  ^> http://localhost:3000
echo   API  ^> http://localhost:8000
echo   MinIO^> http://localhost:9001
echo.
pause
