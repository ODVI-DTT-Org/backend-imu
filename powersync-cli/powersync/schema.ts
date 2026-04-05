// IMU PowerSync Schema
// Defines the data schema for PowerSync synchronization
// This schema matches the PostgreSQL database structure

import { Column, ColumnType, Table } from '@powersync/service-core';

export const tables: Table[] = [
  // ============================================================
  // USERS & PROFILES
  // ============================================================

  new Table({
    name: 'user_profiles',
    columns: [
      new Column({ name: 'id', type: ColumnType.TEXT, primary_key: true }),
      new Column({ name: 'user_id', type: ColumnType.TEXT }),
      new Column({ name: 'name', type: ColumnType.TEXT }),
      new Column({ name: 'email', type: ColumnType.TEXT }),
      new Column({ name: 'role', type: ColumnType.TEXT }),
      new Column({ name: 'avatar_url', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'updated_at', type: ColumnType.TEXT }),
    ],
  }),

  // ============================================================
  // CLIENTS
  // ============================================================

  new Table({
    name: 'clients',
    columns: [
      new Column({ name: 'id', type: ColumnType.TEXT, primary_key: true }),
      new Column({ name: 'first_name', type: ColumnType.TEXT }),
      new Column({ name: 'last_name', type: ColumnType.TEXT }),
      new Column({ name: 'middle_name', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'birth_date', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'email', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'phone', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'agency_name', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'department', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'position', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'employment_status', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'payroll_date', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'tenure', type: ColumnType.INTEGER, optional: true }),
      new Column({ name: 'client_type', type: ColumnType.TEXT }),
      new Column({ name: 'product_type', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'market_type', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'pension_type', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'pan', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'facebook_link', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'remarks', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'agency_id', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'user_id', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'is_starred', type: ColumnType.BOOLEAN }),
      new Column({ name: 'psgc_id', type: ColumnType.INTEGER, optional: true }),
      new Column({ name: 'region', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'province', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'municipality', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'barangay', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'udi', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'loan_released', type: ColumnType.BOOLEAN }),
      new Column({ name: 'loan_released_at', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'created_at', type: ColumnType.TEXT }),
      new Column({ name: 'updated_at', type: ColumnType.TEXT }),
    ],
  }),

  // ============================================================
  // ADDRESSES
  // ============================================================

  new Table({
    name: 'addresses',
    columns: [
      new Column({ name: 'id', type: ColumnType.TEXT, primary_key: true }),
      new Column({ name: 'client_id', type: ColumnType.TEXT }),
      new Column({ name: 'type', type: ColumnType.TEXT }),
      new Column({ name: 'street', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'barangay', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'city', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'province', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'postal_code', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'latitude', type: ColumnType.REAL, optional: true }),
      new Column({ name: 'longitude', type: ColumnType.REAL, optional: true }),
      new Column({ name: 'is_primary', type: ColumnType.BOOLEAN }),
      new Column({ name: 'created_at', type: ColumnType.TEXT }),
    ],
  }),

  // ============================================================
  // PHONE NUMBERS
  // ============================================================

  new Table({
    name: 'phone_numbers',
    columns: [
      new Column({ name: 'id', type: ColumnType.TEXT, primary_key: true }),
      new Column({ name: 'client_id', type: ColumnType.TEXT }),
      new Column({ name: 'type', type: ColumnType.TEXT }),
      new Column({ name: 'number', type: ColumnType.TEXT }),
      new Column({ name: 'label', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'is_primary', type: ColumnType.BOOLEAN }),
      new Column({ name: 'created_at', type: ColumnType.TEXT }),
    ],
  }),

  // ============================================================
  // TOUCHPOINTS
  // ============================================================

  new Table({
    name: 'touchpoints',
    columns: [
      new Column({ name: 'id', type: ColumnType.TEXT, primary_key: true }),
      new Column({ name: 'client_id', type: ColumnType.TEXT }),
      new Column({ name: 'user_id', type: ColumnType.TEXT }),
      new Column({ name: 'touchpoint_number', type: ColumnType.INTEGER }),
      new Column({ name: 'type', type: ColumnType.TEXT }),
      new Column({ name: 'date', type: ColumnType.TEXT }),
      new Column({ name: 'address', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'time_arrival', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'time_departure', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'odometer_arrival', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'odometer_departure', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'reason', type: ColumnType.TEXT }),
      new Column({ name: 'status', type: ColumnType.TEXT }),
      new Column({ name: 'next_visit_date', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'notes', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'photo_url', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'audio_url', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'latitude', type: ColumnType.REAL, optional: true }),
      new Column({ name: 'longitude', type: ColumnType.REAL, optional: true }),
      new Column({ name: 'time_in', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'time_in_gps_lat', type: ColumnType.REAL, optional: true }),
      new Column({ name: 'time_in_gps_lng', type: ColumnType.REAL, optional: true }),
      new Column({ name: 'time_in_gps_address', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'time_out', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'time_out_gps_lat', type: ColumnType.REAL, optional: true }),
      new Column({ name: 'time_out_gps_lng', type: ColumnType.REAL, optional: true }),
      new Column({ name: 'time_out_gps_address', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'rejection_reason', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'created_at', type: ColumnType.TEXT }),
      new Column({ name: 'updated_at', type: ColumnType.TEXT }),
    ],
  }),

  // ============================================================
  // ITINERARIES
  // ============================================================

  new Table({
    name: 'itineraries',
    columns: [
      new Column({ name: 'id', type: ColumnType.TEXT, primary_key: true }),
      new Column({ name: 'user_id', type: ColumnType.TEXT }),
      new Column({ name: 'client_id', type: ColumnType.TEXT }),
      new Column({ name: 'scheduled_date', type: ColumnType.TEXT }),
      new Column({ name: 'scheduled_time', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'status', type: ColumnType.TEXT }),
      new Column({ name: 'priority', type: ColumnType.TEXT }),
      new Column({ name: 'notes', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'created_by', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'created_at', type: ColumnType.TEXT }),
      new Column({ name: 'updated_at', type: ColumnType.TEXT }),
    ],
  }),

  // ============================================================
  // APPROVALS
  // ============================================================

  new Table({
    name: 'approvals',
    columns: [
      new Column({ name: 'id', type: ColumnType.TEXT, primary_key: true }),
      new Column({ name: 'touchpoint_id', type: ColumnType.TEXT }),
      new Column({ name: 'approver_id', type: ColumnType.TEXT }),
      new Column({ name: 'status', type: ColumnType.TEXT }),
      new Column({ name: 'notes', type: ColumnType.TEXT, optional: true }),
      new Column({ name: 'created_at', type: ColumnType.TEXT }),
      new Column({ name: 'updated_at', type: ColumnType.TEXT }),
    ],
  }),

  // ============================================================
  // USER LOCATIONS (for municipality-based filtering)
  // ============================================================

  new Table({
    name: 'user_locations',
    columns: [
      new Column({ name: 'id', type: ColumnType.TEXT, primary_key: true }),
      new Column({ name: 'user_id', type: ColumnType.TEXT }),
      new Column({ name: 'province', type: ColumnType.TEXT }),
      new Column({ name: 'municipality', type: ColumnType.TEXT }),
      new Column({ name: 'assigned_at', type: ColumnType.TEXT }),
      new Column({ name: 'assigned_by', type: ColumnType.TEXT }),
      new Column({ name: 'deleted_at', type: ColumnType.TEXT }),
      new Column({ name: 'created_at', type: ColumnType.TEXT }),
      new Column({ name: 'updated_at', type: ColumnType.TEXT }),
    ],
  }),

  // ============================================================
  // PSGC (Philippine Geographic Codes)
  // ============================================================

  new Table({
    name: 'psgc',
    columns: [
      new Column({ name: 'id', type: ColumnType.INTEGER, primary_key: true }),
      new Column({ name: 'code', type: ColumnType.TEXT }),
      new Column({ name: 'name', type: ColumnType.TEXT }),
      new Column({ name: 'region', type: ColumnType.TEXT }),
      new Column({ name: 'province', type: ColumnType.TEXT }),
      new Column({ name: 'municipality', type: ColumnType.TEXT }),
      new Column({ name: 'level', type: ColumnType.TEXT }),
    ],
  }),

  // ============================================================
  // TOUCHPOINT REASONS
  // ============================================================

  new Table({
    name: 'touchpoint_reasons',
    columns: [
      new Column({ name: 'id', type: ColumnType.TEXT, primary_key: true }),
      new Column({ name: 'reason', type: ColumnType.TEXT }),
      new Column({ name: 'category', type: ColumnType.TEXT }),
      new Column({ name: 'is_active', type: ColumnType.BOOLEAN }),
      new Column({ name: 'sort_order', type: ColumnType.INTEGER }),
      new Column({ name: 'created_at', type: ColumnType.TEXT }),
    ],
  }),
];
