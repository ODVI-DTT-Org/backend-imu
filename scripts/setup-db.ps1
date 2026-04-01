# IMU Database Setup Script for Windows PowerShell
# Run this script to set up the PostgreSQL database

Write-Host "=== IMU Database Setup ===" -ForegroundColor Cyan

# Configuration
$DB_NAME = "imu_db"
$DB_USER = "postgres"
$DB_HOST = "localhost"
$DB_PORT = "5432"
$SCHEMA_FILE = "src/schema.sql"

# Check if .env exists
if (-not (Test-Path .env)) {
    Write-Host "Error: .env file not found. Please create .env from .env.example" -ForegroundColor Red
    exit 1
}

Write-Host "Database: $DB_NAME"
Write-Host "Host: $DB_HOST`:$DB_PORT"

# Prompt for password
$securePassword = Read-Host "Enter PostgreSQL password for user '$DB_USER'" -AsSecureString
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
$DB_PASSWORD = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
$env:PGPASSWORD = $DB_PASSWORD

Write-Host ""

# Check if database exists
Write-Host "Checking if database exists..."
$DB_EXISTS = & psql -U $DB_USER -h $DB_HOST -t -c "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" 2>$null

if ($DB_EXISTS -match "1") {
    Write-Host "Database '$DB_NAME' already exists." -ForegroundColor Yellow
    $RESPONSE = Read-Host "Do you want to re-run the schema? (y/n)"
    if ($RESPONSE -ne "y") {
        Write-Host "Setup cancelled."
        exit 0
    }
} else {
    # Create database
    Write-Host "Creating database '$DB_NAME'..."
    & createdb -U $DB_USER -h $DB_HOST $DB_NAME
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Database created successfully." -ForegroundColor Green
    } else {
        Write-Host "Failed to create database. Please check your PostgreSQL configuration." -ForegroundColor Red
        exit 1
    }
}

# Run schema
Write-Host "Running schema..."
& psql -U $DB_USER -h $DB_HOST -d $DB_NAME -f $SCHEMA_FILE

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "=== Setup Complete ===" -ForegroundColor Green
    Write-Host "Database '$DB_NAME' is ready."
    Write-Host ""
    Write-Host "To start the backend server, run:"
    Write-Host "  npm run dev" -ForegroundColor Cyan
} else {
    Write-Host "Failed to run schema. Please check the error messages above." -ForegroundColor Red
    exit 1
}

# Clear password from environment
$env:PGPASSWORD = $null
