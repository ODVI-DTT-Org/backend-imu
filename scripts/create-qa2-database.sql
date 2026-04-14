-- Script to create qa2 database in DigitalOcean PostgreSQL
-- Run this script as the doadmin user or superuser

-- Create the qa2 database
CREATE DATABASE qa2;

-- Grant all privileges on qa2 database to doadmin user
GRANT ALL PRIVILEGES ON DATABASE qa2 TO doadmin;

-- Connect to qa2 database and create extensions
\c qa2

-- Create necessary extensions (if not already created)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Verify the database was created
\l qa2

-- Show current database
SELECT current_database();

-- Show connection info
SELECT
  inet_server_addr(),
  inet_server_port(),
  current_user,
  current_database();
