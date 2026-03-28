@echo off
setlocal enabledelayedexpansion

:: ============================================================
:: RepairDesk - Unified Setup ^& Startup Script
:: ============================================================

set TITLE=RepairDesk Setup
title %TITLE%

echo ============================================================
echo           REPAIRDESK - AUTOMATED SETUP ^& STARTUP
echo ============================================================
echo.

:: 1. Check Prerequisites
echo [1/5] Checking Prerequisites...
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not installed or not in your PATH.
    echo Please install Docker Desktop from https://www.docker.com/
    pause
    exit /b 1
)

docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not running.
    echo Please start Docker Desktop and try again.
    pause
    exit /b 1
)
echo [OK] Docker is ready.
echo.

:: 2. Environment Configuration
echo [2/5] Checking Environment Files...
if not exist .env (
    if exist .env.example (
        echo [INFO] .env missing, creating from .env.example...
        copy .env.example .env
    ) else (
        echo [ERROR] .env.example not found. Cannot proceed.
        pause
        exit /b 1
    )
)
echo [OK] Environment files ready.
echo.

:: 3. Orchestration
echo [3/5] Starting Services (Docker Compose)...
echo [INFO] This might take a few minutes for the first run...
docker compose -f infra\compose\docker-compose.dev.yml up --build -d
if %errorlevel% neq 0 (
    echo [ERROR] Failed to start Docker services.
    pause
    exit /b 1
)
echo [OK] Services are booting up.
echo.

:: 4. Database Migrations
echo [4/5] Running Database Migrations...
echo [INFO] Waiting for API to be ready...
:WAIT_FOR_API
curl -s -o nul -w "%%{http_code}" http://localhost:8000/api/v1/health | findstr "200" >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] API is still initializing...
    timeout /t 5 >nul
    goto WAIT_FOR_API
)
echo [OK] API is ready. Running migrations...
docker compose -f infra\compose\docker-compose.dev.yml exec api alembic upgrade head >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Tables exist, stamping alembic to current head...
    docker compose -f infra\compose\docker-compose.dev.yml exec api alembic stamp head >nul 2>&1
)
echo [OK] Database is up to date.
echo.

:: 5. Summary
echo [5/5] Finalizing...
echo ============================================================
echo           SUCCESS: REPAIRDESK IS RUNNING!
echo ============================================================
echo.
echo   [FRONTEND] http://localhost:3000
echo   [BACKEND]  http://localhost:8000/api/v1
echo   [API DOCS] http://localhost:8000/docs
echo   [STORAGE]  http://localhost:9001 (MinIO)
echo.
echo To stop the application, use: docker compose -f infra\compose\docker-compose.dev.yml down
echo.
echo ============================================================
pause
