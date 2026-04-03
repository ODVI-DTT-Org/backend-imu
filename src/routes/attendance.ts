import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { auditMiddleware } from '../middleware/audit.js';
import { pool } from '../db/index.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  AuthorizationError,
} from '../errors/index.js';

const attendance = new Hono();

// Helper function to get local date string (not UTC)
function getLocalDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Validation schemas
const checkInSchema = z.object({
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  notes: z.string().optional(),
});

const checkOutSchema = z.object({
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  notes: z.string().optional(),
});

// Helper to map DB row to Attendance type
function mapRowToAttendance(row: Record<string, any>) {
  return {
    id: row.id,
    user_id: row.user_id,
    date: row.date,
    time_in: row.time_in,
    time_out: row.time_out,
    location_in_lat: row.location_in_lat,
    location_in_lng: row.location_in_lng,
    location_out_lat: row.location_out_lat,
    location_out_lng: row.location_out_lng,
    notes: row.notes,
    created: row.created_at,
  };
}

// POST /api/attendance/check-in - Check in for the day
attendance.post('/check-in', authMiddleware, requirePermission('attendance', 'create'), auditMiddleware('attendance'), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const validated = checkInSchema.parse(body);

    const today = getLocalDateString();

    // Check if already checked in today
    const existing = await pool.query(
      'SELECT * FROM attendance WHERE user_id = $1 AND date = $2',
      [user.sub, today]
    );

    if (existing.rows.length > 0) {
      const error = new ConflictError('Already checked in for today');
      error.addDetail('attendance', mapRowToAttendance(existing.rows[0]));
      throw error;
    }

    // Create new attendance record
    const result = await pool.query(
      `INSERT INTO attendance (id, user_id, date, time_in, location_in_lat, location_in_lng, notes)
       VALUES (gen_random_uuid(), $1, $2, NOW(), $3, $4, $5)
       RETURNING *`,
      [user.sub, today, validated.latitude, validated.longitude, validated.notes]
    );

    return c.json(mapRowToAttendance(result.rows[0]), 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Check-in error:', error);
    throw new Error('Failed to check in');
  }
});

// POST /api/attendance/check-out - Check out for the day
attendance.post('/check-out', authMiddleware, requirePermission('attendance', 'update'), auditMiddleware('attendance'), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const validated = checkOutSchema.parse(body);

    const today = getLocalDateString();

    // Find today's attendance record
    const existing = await pool.query(
      'SELECT * FROM attendance WHERE user_id = $1 AND date = $2',
      [user.sub, today]
    );

    if (existing.rows.length === 0) {
      throw new NotFoundError('No check-in record found for today');
    }

    const attendanceRecord = existing.rows[0];

    if (attendanceRecord.time_out) {
      throw new ConflictError('Already checked out for today');
    }

    // Update with check-out time and location
    const result = await pool.query(
      `UPDATE attendance
       SET time_out = NOW(),
           location_out_lat = $1,
           location_out_lng = $2,
           notes = COALESCE($3, notes)
       WHERE id = $4
       RETURNING *`,
      [validated.latitude, validated.longitude, validated.notes, attendanceRecord.id]
    );

    return c.json(mapRowToAttendance(result.rows[0]));
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Check-out error:', error);
    throw new Error('Failed to check out');
  }
});

// GET /api/attendance/today - Get today's attendance
attendance.get('/today', authMiddleware, requirePermission('attendance', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const today = getLocalDateString();

    const result = await pool.query(
      'SELECT * FROM attendance WHERE user_id = $1 AND date = $2',
      [user.sub, today]
    );

    if (result.rows.length === 0) {
      return c.json({ checked_in: false, attendance: null });
    }

    const record = result.rows[0];
    return c.json({
      checked_in: true,
      checked_out: !!record.time_out,
      attendance: mapRowToAttendance(record),
    });
  } catch (error) {
    console.error('Get today attendance error:', error);
    throw new Error();
  }
});

// GET /api/attendance/history - Get attendance history
attendance.get('/history', authMiddleware, requirePermission('attendance', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const page = parseInt(c.req.query('page') || '1');
    const perPage = parseInt(c.req.query('perPage') || '30');
    const userId = c.req.query('user_id'); // For admin to view other users

    // Only admin can view other users' attendance
    const targetUserId = (user.role === 'admin' || user.role === 'staff') && userId ? userId : user.sub;

    const offset = (page - 1) * perPage;

    // Get total count
    const countResult = await pool.query(
      'SELECT COUNT(*) as count FROM attendance WHERE user_id = $1',
      [targetUserId]
    );
    const totalItems = parseInt(countResult.rows[0].count);

    // Get paginated results
    const result = await pool.query(
      `SELECT a.*, u.first_name, u.last_name, u.email
       FROM attendance a
       JOIN users u ON u.id = a.user_id
       WHERE a.user_id = $1
       ORDER BY a.date DESC
       LIMIT $2 OFFSET $3`,
      [targetUserId, perPage, offset]
    );

    return c.json({
      items: result.rows.map(row => ({
        ...mapRowToAttendance(row),
        user: {
          first_name: row.first_name,
          last_name: row.last_name,
          email: row.email,
        },
      })),
      page,
      perPage,
      totalItems,
      totalPages: Math.ceil(totalItems / perPage),
    });
  } catch (error) {
    console.error('Get attendance history error:', error);
    throw new Error();
  }
});

// GET /api/attendance - List all attendance (admin only)
attendance.get('/', authMiddleware, requirePermission('attendance', 'read'), async (c) => {
  try {
    const user = c.get('user');

    if (user.role !== 'admin' && user.role !== 'staff') {
      throw new AuthorizationError('Unauthorized');
    }

    const page = parseInt(c.req.query('page') || '1');
    const perPage = parseInt(c.req.query('perPage') || '30');
    const date = c.req.query('date');
    const userId = c.req.query('user_id');

    const offset = (page - 1) * perPage;
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (date) {
      conditions.push(`a.date = $${paramIndex}`);
      params.push(date);
      paramIndex++;
    }

    if (userId) {
      conditions.push(`a.user_id = $${paramIndex}`);
      params.push(userId);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM attendance a ${whereClause}`,
      params
    );
    const totalItems = parseInt(countResult.rows[0].count);

    // Get paginated results
    const result = await pool.query(
      `SELECT a.*, u.first_name, u.last_name, u.email
       FROM attendance a
       JOIN users u ON u.id = a.user_id
       ${whereClause}
       ORDER BY a.date DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, perPage, offset]
    );

    return c.json({
      items: result.rows.map(row => ({
        ...mapRowToAttendance(row),
        user: {
          id: row.user_id,
          first_name: row.first_name,
          last_name: row.last_name,
          email: row.email,
        },
      })),
      page,
      perPage,
      totalItems,
      totalPages: Math.ceil(totalItems / perPage),
    });
  } catch (error) {
    console.error('List attendance error:', error);
    throw new Error();
  }
});

// GET /api/attendance/:id - Get single attendance record
attendance.get('/:id', authMiddleware, requirePermission('attendance', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const attendanceId = c.req.param('id');

    const result = await pool.query(
      `SELECT a.*, u.first_name, u.last_name, u.email
       FROM attendance a
       JOIN users u ON u.id = a.user_id
       WHERE a.id = $1
       LIMIT 1`,
      [attendanceId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Attendance record');
    }

    const record = result.rows[0];

    // Check ownership or admin/staff role
    if (record.user_id !== user.sub && user.role !== 'admin' && user.role !== 'staff') {
      throw new AuthorizationError('You do not have permission to view this attendance record');
    }

    return c.json({
      ...mapRowToAttendance(record),
      user: {
        id: record.user_id,
        first_name: record.first_name,
        last_name: record.last_name,
        email: record.email,
      },
    });
  } catch (error) {
    console.error('Get attendance by ID error:', error);
    throw error;
  }
});

// POST /api/attendance/:id/check-out - Check out for specific attendance record
attendance.post('/:id/check-out', authMiddleware, requirePermission('attendance', 'update'), auditMiddleware('attendance'), async (c) => {
  try {
    const user = c.get('user');
    const attendanceId = c.req.param('id');
    const body = await c.req.json();
    const validated = checkOutSchema.parse(body);

    // Find attendance record
    const existing = await pool.query(
      'SELECT * FROM attendance WHERE id = $1',
      [attendanceId]
    );

    if (existing.rows.length === 0) {
      throw new NotFoundError('Attendance record');
    }

    const attendanceRecord = existing.rows[0];

    // Check ownership or admin/staff role
    if (attendanceRecord.user_id !== user.sub && user.role !== 'admin' && user.role !== 'staff') {
      throw new AuthorizationError('You do not have permission to check out this attendance record');
    }

    if (attendanceRecord.time_out) {
      throw new ConflictError('Already checked out');
    }

    // Update with check-out time and location
    const result = await pool.query(
      `UPDATE attendance
       SET time_out = NOW(),
           location_out_lat = $1,
           location_out_lng = $2,
           notes = COALESCE($3, notes)
       WHERE id = $4
       RETURNING *`,
      [validated.latitude, validated.longitude, validated.notes, attendanceId]
    );

    return c.json(mapRowToAttendance(result.rows[0]));
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Check-out by ID error:', error);
    throw error;
  }
});

export default attendance;
