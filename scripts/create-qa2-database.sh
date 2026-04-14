#!/bin/bash

# Script to create qa2 database in DigitalOcean PostgreSQL
# Usage: ./scripts/create-qa2-database.sh

echo "Creating qa2 database in DigitalOcean PostgreSQL..."

# Database connection details from .env
DB_HOST="imu-do-user-21438450-0.j.db.ondigitalocean.com"
DB_PORT="25060"
DB_USER="doadmin"
DB_NAME="qa2"

# Extract password from DATABASE_URL in .env
DB_PASSWORD=$(grep DATABASE_URL .env | sed 's/.*:\/\/.*:\(.*\)@.*/\1/')

echo "Connecting to DigitalOcean PostgreSQL..."
echo "Host: $DB_HOST:$DB_PORT"
echo "User: $DB_USER"
echo "Database to create: $DB_NAME"
echo ""

# Create the database using psql
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres << EOF
-- Create the qa2 database
CREATE DATABASE $DB_NAME;

-- Grant all privileges on qa2 database to doadmin user
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;

-- Connect to qa2 database and create extensions
\c $DB_NAME

-- Create necessary extensions (if not already created)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Display success message
SELECT 'Database $DB_NAME created successfully!' AS status;
EOF

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Successfully created qa2 database!"
  echo ""
  echo "You can now restart the backend server:"
  echo "  cd /c/odvi-apps/IMU/backend && pnpm dev"
else
  echo ""
  echo "❌ Failed to create qa2 database"
  echo "Please check your database credentials and permissions."
  exit 1
fi
