#!/bin/bash
# IMU Database Setup Script
# Run this script to set up the PostgreSQL database

set -e

echo "=== IMU Database Setup ==="

# Configuration
DB_NAME="imu_db"
DB_USER="postgres"
DB_HOST="localhost"
DB_PORT="5432"
SCHEMA_FILE="src/schema.sql"

# Check if .env exists
if [ ! -f .env ]; then
    echo "Error: .env file not found. Please create .env from .env.example"
    exit 1
fi

# Load environment variables
export $(grep -v '^#' .env | xargs)

echo "Database: $DB_NAME"
echo "Host: $DB_HOST:$DB_PORT"

# Prompt for password
echo "Enter PostgreSQL password for user '$DB_USER':"
read -s DB_PASSWORD
export PGPASSWORD="$DB_PASSWORD"

# Check if database exists
echo ""
echo "Checking if database exists..."
DB_EXISTS=$(psql -U "$DB_USER" -h "$DB_HOST" -t -c "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" 2>/dev/null || echo "")

if [ "$DB_EXISTS" = " 1" ]; then
    echo "Database '$DB_NAME' already exists."
    echo "Do you want to re-run the schema? (y/n)"
    read -r RESPONSE
    if [ "$RESPONSE" != "y" ]; then
        echo "Setup cancelled."
        exit 0
    fi
else
    # Create database
    echo "Creating database '$DB_NAME'..."
    createdb -U "$DB_USER" -h "$DB_HOST" "$DB_NAME"
    echo "Database created successfully."
fi

# Run schema
echo "Running schema..."
psql -U "$DB_USER" -h "$DB_HOST" -d "$DB_NAME" -f "$SCHEMA_FILE"

echo ""
echo "=== Setup Complete ==="
echo "Database '$DB_NAME' is ready."
echo ""
echo "To start the backend server, run:"
echo "  npm run dev"
