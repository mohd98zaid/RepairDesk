@echo off
echo Stopping RepairDesk (DEV)...
docker compose -f infra\compose\docker-compose.dev.yml down
echo Done. All containers stopped.
pause
