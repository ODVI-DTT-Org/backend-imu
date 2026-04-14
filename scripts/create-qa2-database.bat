@echo off
REM Script to create qa2 database in DigitalOcean PostgreSQL
REM Usage: scripts\create-qa2-database.bat

echo Creating qa2 database in DigitalOcean PostgreSQL...
echo.

REM Database connection details
set DB_HOST=imu-do-user-21438450-0.j.db.ondigitalocean.com
set DB_PORT=25060
set DB_USER=doadmin
set DB_NAME=qa2

REM Extract password from DATABASE_URL in .env
for /f "tokens=2 delims=:@" %%a in (.env) do (
  for /f "tokens=1 delims=/" %%b in ("%%a") do set DB_PASSWORD=%%b
)
for /f "tokens=1 delims=@" %%a in ("%DB_PASSWORD%") do set DB_PASSWORD=%%a

echo Host: %DB_HOST%:%DB_PORT%
echo User: %DB_USER%
echo Database to create: %DB_NAME%
echo.

REM Create PostgreSQL connection string
set PGPASSWORD=%DB_PASSWORD%

REM Create the database using psql
psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d postgres -c "CREATE DATABASE %DB_NAME%;"
if errorlevel 1 (
  echo Failed to create database or database already exists
)
psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE %DB_NAME% TO %DB_USER%;"
if errorlevel 1 (
  echo Failed to grant privileges
)
psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -c "CREATE EXTENSION IF NOT EXISTS uuid-ossp;"
if errorlevel 1 (
  echo Failed to create uuid-ossp extension or already exists
)
psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
if errorlevel 1 (
  echo Failed to create pg_trgm extension or already exists
)

echo.
echo Successfully created qa2 database!
echo.
echo You can now restart the backend server:
echo   cd C:\odvi-apps\IMU\backend
echo   pnpm dev

pause
