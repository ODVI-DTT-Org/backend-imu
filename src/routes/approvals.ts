import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { auditMiddleware, auditLog } from '../middleware/audit.js';
import { pool } from '../db/index.js';
import {
  ValidationError,
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
} from '../errors/index.js';
import { addBulkJob } from '../queues/utils/job-helpers.js';
import { BulkJobType } from '../queues/jobs/job-types.js';

const approvals = new Hono();

// Manager roles for authorization
const MANAGER_ROLES = ['admin', 'area_manager', 'assistant_area_manager'] as const;
// Approval roles: managers and staff can approve
const APPROVAL_ROLES = [...MANAGER_ROLES, 'staff'] as const;

// Validation schemas
const createApprovalSchema = z.object({
  type: z.enum(['client', 'udi']),
  client_id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
  touchpoint_number: z.number().int().min(1).max(7).optional(),
  role: z.string().optional(),
  reason: z.string().optional(),
  notes: z.string().optional(),
  updated_client_information: z.record(z.unknown()).optional(),
  updated_udi: z.string().optional(),
  udi_number: z.string().optional(),
});

const updateApprovalSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  notes: z.string().optional(),
});

const approveSchema = z.object({
  notes: z.string().optional(),
});

const rejectSchema = z.object({
  rejection_reason: z.string().optional(),
  notes: z.string().optional(),
});

// Bulk approve validation schema
const bulkApproveSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

// Bulk reject validation schema
const bulkRejectSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  reason: z.string().min(1).max(500),
});

// Helper to map DB row to Approval type
function mapRowToApproval(row: Record<string, any>) {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    client_id: row.client_id,
    user_id: row.user_id,
    touchpoint_number: row.touchpoint_number,
    role: row.role,
    reason: row.reason,
    notes: row.notes,
    updated_client_information: row.updated_client_information,
    updated_udi: row.updated_udi,
    udi_number: row.udi_number,
    approved_by: row.approved_by,
    approved_at: row.approved_at,
    rejected_by: row.rejected_by,
    rejected_at: row.rejected_at,
    rejection_reason: row.rejection_reason,
    created: row.created_at,
    updated: row.updated_at,
  };
}

// GET /api/approvals - List all approvals
approvals.get('/', authMiddleware, requirePermission('approvals', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const page = parseInt(c.req.query('page') || '1');
    const perPage = parseInt(c.req.query('perPage') || '20');
    const search = c.req.query('search');
    const status = c.req.query('status');
    const type = c.req.query('type');
    const touchpoint = c.req.query('touchpoint_number');
    const role = c.req.query('role');

    const offset = (page - 1) * perPage;
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Field agents (caravan/tele) can only see their own approvals
    if (user.role === 'caravan' || user.role === 'tele') {
      conditions.push(`a.user_id = $${paramIndex}`);
      params.push(user.sub);
      paramIndex++;
    }

    if (status && status !== 'all') {
      conditions.push(`a.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (type && type !== 'all') {
      conditions.push(`a.type = $${paramIndex}`);
      params.push(type);
      paramIndex++;
    }

    if (touchpoint && touchpoint !== 'all') {
      conditions.push(`a.touchpoint_number = $${paramIndex}`);
      params.push(parseInt(touchpoint));
      paramIndex++;
    }

    if (role && role !== 'all') {
      conditions.push(`a.role = $${paramIndex}`);
      params.push(role);
      paramIndex++;
    }

    if (search) {
      conditions.push(`(c.first_name ILIKE $${paramIndex} OR c.last_name ILIKE $${paramIndex} OR c.email ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM approvals a
       LEFT JOIN clients c ON c.id = a.client_id
       ${whereClause}`,
      params
    );
    const totalItems = parseInt(countResult.rows[0].count);

    // Get paginated results with expansions
    const result = await pool.query(
      `SELECT a.*,
              c.first_name as client_first_name, c.last_name as client_last_name,
              c.middle_name as client_middle_name, c.email as client_email,
              c.phone as client_phone, c.client_type,
              car.first_name as caravan_first_name, car.last_name as caravan_last_name,
              car.email as caravan_email, car.phone as caravan_phone,
              u.first_name as approver_first_name, u.last_name as approver_last_name
       FROM approvals a
       LEFT JOIN clients c ON c.id = a.client_id
       LEFT JOIN users car ON car.id = a.user_id
       LEFT JOIN users u ON u.id = a.approved_by
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, perPage, offset]
    );

    const items = result.rows.map(row => ({
      ...mapRowToApproval(row),
      expand: {
        client_id: row.client_id ? {
          id: row.client_id,
          first_name: row.client_first_name,
          last_name: row.client_last_name,
          middle_name: row.client_middle_name,
          email: row.client_email,
          phone: row.client_phone,
          client_type: row.client_type,
        } : undefined,
        user_id: row.user_id ? {
          id: row.user_id,
          name: `${row.caravan_first_name} ${row.caravan_last_name}`,
          email: row.caravan_email,
          phone: row.caravan_phone,
        } : undefined,
        approved_by: row.approved_by ? {
          id: row.approved_by,
          name: `${row.approver_first_name} ${row.approver_last_name}`,
        } : undefined,
      },
    }));

    return c.json({
      items,
      page,
      perPage,
      totalItems,
      totalPages: Math.ceil(totalItems / perPage),
    });
  } catch (error) {
    console.error('Fetch approvals error:', error);
    throw new Error();
  }
});

// GET /api/approvals/:id - Get single approval
approvals.get('/:id', authMiddleware, requirePermission('approvals', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');

    const result = await pool.query(
      `SELECT a.*,
              c.first_name as client_first_name, c.last_name as client_last_name,
              c.middle_name as client_middle_name, c.email as client_email,
              c.phone as client_phone, c.client_type,
              car.first_name as caravan_first_name, car.last_name as caravan_last_name,
              car.email as caravan_email, car.phone as caravan_phone
       FROM approvals a
       LEFT JOIN clients c ON c.id = a.client_id
       LEFT JOIN users car ON car.id = a.user_id
       WHERE a.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Approval');
    }

    const row = result.rows[0];

    // Field agents (caravan/tele) can only see their own approvals
    if ((user.role === 'caravan' || user.role === 'tele') && row.user_id !== user.sub) {
      throw new NotFoundError('Approval');
    }

    return c.json({
      ...mapRowToApproval(row),
      expand: {
        client_id: row.client_id ? {
          id: row.client_id,
          first_name: row.client_first_name,
          last_name: row.client_last_name,
          middle_name: row.client_middle_name,
          email: row.client_email,
          phone: row.client_phone,
          client_type: row.client_type,
        } : undefined,
        user_id: row.user_id ? {
          id: row.user_id,
          name: `${row.caravan_first_name} ${row.caravan_last_name}`,
          email: row.caravan_email,
          phone: row.caravan_phone,
        } : undefined,
      },
    });
  } catch (error) {
    console.error('Fetch approval error:', error);
    throw new Error();
  }
});

// POST /api/approvals - Create new approval
approvals.post('/', authMiddleware, requirePermission('approvals', 'create'), auditMiddleware('approval'), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const validated = createApprovalSchema.parse(body);

    const result = await pool.query(
      `INSERT INTO approvals (id, type, client_id, user_id, touchpoint_number, role, reason, notes, status)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING *`,
      [
        validated.type,
        validated.client_id,
        validated.user_id || user.sub,
        validated.touchpoint_number,
        validated.role,
        validated.reason,
        validated.notes,
      ]
    );

    const newApproval = result.rows[0];

    // Audit log the approval creation
    await auditLog({
      userId: user.sub,
      action: 'create',
      entity: 'approval',
      entityId: newApproval.id,
      newValues: {
        type: validated.type,
        client_id: validated.client_id,
        touchpoint_number: validated.touchpoint_number,
        reason: validated.reason,
        notes: validated.notes,
      },
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
      userAgent: c.req.header('user-agent'),
    });

    return c.json(mapRowToApproval(newApproval), 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Create approval error:', error);
    throw new Error('Failed to create approval');
  }
});

// PUT /api/approvals/:id - Update approval
approvals.put('/:id', authMiddleware, requirePermission('approvals', 'update'), auditMiddleware('approval'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const validated = updateApprovalSchema.parse(body);

    // Check if approval exists
    const existing = await pool.query(
      'SELECT * FROM approvals WHERE id = $1',
      [id]
    );

    if (existing.rows.length === 0) {
      throw new NotFoundError('Approval');
    }

    // Only admin/staff can update status
    if (validated.status && (user.role === 'caravan' || user.role === 'tele')) {
      throw new AuthorizationError('Not authorized to update status');
    }

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (validated.notes !== undefined) {
      updates.push(`notes = $${paramIndex}`);
      params.push(validated.notes);
      paramIndex++;
    }

    if (validated.status !== undefined) {
      updates.push(`status = $${paramIndex}`);
      params.push(validated.status);
      paramIndex++;
    }

    if (updates.length === 0) {
      throw new ValidationError('No fields to update');
    }

    params.push(id);
    const result = await pool.query(
      `UPDATE approvals SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    return c.json(mapRowToApproval(result.rows[0]));
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Update approval error:', error);
    throw new Error('Failed to update approval');
  }
});

// POST /api/approvals/:id/approve - Approve an approval
approvals.post('/:id/approve', authMiddleware, requirePermission('approvals', 'update'), async (c) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const validated = approveSchema.optional().parse(body);

    // Check if approval exists and is pending
    const existing = await client.query(
      'SELECT * FROM approvals WHERE id = $1',
      [id]
    );

    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new NotFoundError('Approval');
    }

    if (existing.rows[0].status !== 'pending') {
      await client.query('ROLLBACK');
      throw new ValidationError('Approval is not in pending status');
    }

    const approval = existing.rows[0];

    // For UDI approvals, parse and store UDI number
    let udiNumber: string | null = null;
    if (approval.type === 'udi') {
      try {
        // Parse UDI from notes (format: "UDI Number: 12345")
        const udiMatch = approval.notes?.match(/UDI Number:\s*(\d+)/);
        if (udiMatch) {
          udiNumber = udiMatch[1];

          // Update client's UDI
          await client.query(
            'UPDATE clients SET udi = $1, updated_at = NOW() WHERE id = $2',
            [udiNumber, approval.client_id]
          );

          // Remove client from itinerary after loan release approval
          // This prevents the client from appearing in My Day and Itinerary
          await client.query(
            'DELETE FROM itineraries WHERE client_id = $1',
            [approval.client_id]
          );
          console.log(`Removed client ${approval.client_id} from itinerary after loan release approval`);
        }
      } catch (error) {
        console.error('Failed to parse UDI number or remove from itinerary:', error);
      }
    }

    // For client creation approvals, create the client
    let newClientId: string | null = null;
    if (approval.type === 'client' && approval.reason === 'Client Creation Request') {
      try {
        const clientData = JSON.parse(approval.notes);

        // Insert the new client
        const insertResult = await client.query(
          `INSERT INTO clients (
            first_name, last_name, middle_name, birth_date, email, phone,
            agency_name, department, position, employment_status, payroll_date, tenure,
            client_type, product_type, market_type, pension_type, pan, facebook_link, remarks,
            agency_id, caravan_id, is_starred
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
          ) RETURNING id`,
          [
            clientData.first_name, clientData.last_name, clientData.middle_name, clientData.birth_date,
            clientData.email, clientData.phone, clientData.agency_name, clientData.department,
            clientData.position, clientData.employment_status, clientData.payroll_date, clientData.tenure,
            clientData.client_type, clientData.product_type, clientData.market_type, clientData.pension_type,
            clientData.pan, clientData.facebook_link, clientData.remarks, clientData.agency_id,
            clientData.caravan_id, clientData.is_starred
          ]
        );

        newClientId = insertResult.rows[0].id;
        console.log(`Created new client ${newClientId} from approval`);
      } catch (parseError) {
        console.error('Failed to parse client creation data or create client:', parseError);
        await client.query('ROLLBACK');
        throw new Error('Failed to create client from approval');
      }
    }

    // For client edit approvals, apply the changes to the client
    let clientChanges: Record<string, any> | null = null;
    if (approval.type === 'client' && approval.reason === 'Client Edit Request') {
      try {
        clientChanges = JSON.parse(approval.notes);

        // Build dynamic update query
        const updateFields: string[] = [];
        const updateValues: any[] = [];
        let paramIndex = 1;

        const fieldMappings: Record<string, string> = {
          first_name: 'first_name',
          last_name: 'last_name',
          middle_name: 'middle_name',
          birth_date: 'birth_date',
          email: 'email',
          phone: 'phone',
          agency_name: 'agency_name',
          department: 'department',
          position: 'position',
          employment_status: 'employment_status',
          payroll_date: 'payroll_date',
          tenure: 'tenure',
          client_type: 'client_type',
          product_type: 'product_type',
          market_type: 'market_type',
          pension_type: 'pension_type',
          pan: 'pan',
          facebook_link: 'facebook_link',
          remarks: 'remarks',
          agency_id: 'agency_id',
          caravan_id: 'caravan_id',
          region: 'region',
          province: 'province',
          municipality: 'municipality',
          barangay: 'barangay',
          is_starred: 'is_starred',
        };

        for (const [key, dbField] of Object.entries(fieldMappings)) {
          if (clientChanges && key in clientChanges && clientChanges[key] !== undefined) {
            updateFields.push(`${dbField} = $${paramIndex}`);
            updateValues.push(clientChanges[key]);
            paramIndex++;
          }
        }

        if (updateFields.length > 0) {
          updateValues.push(approval.client_id);
          await client.query(
            `UPDATE clients SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex}`,
            updateValues
          );
        }
      } catch (parseError) {
        console.error('Failed to parse client edit changes:', parseError);
      }
    }

    // Update approval status with the new columns
    const result = await client.query(
      `UPDATE approvals
       SET status = 'approved',
           approved_by = $1,
           approved_at = NOW(),
           notes = COALESCE($2, notes),
           updated_udi = $3,
           updated_client_information = $4,
           client_id = COALESCE($5, client_id),
           updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [user.sub, validated?.notes, udiNumber, clientChanges ? JSON.stringify(clientChanges) : null, newClientId, id]
    );

    await client.query('COMMIT');

    // Audit log the approval action
    await auditLog({
      userId: user.sub,
      action: 'approve',
      entity: 'approval',
      entityId: id,
      newValues: {
        approval_type: approval.type,
        client_id: approval.client_id,
        notes: validated?.notes,
      },
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
      userAgent: c.req.header('user-agent'),
      metadata: {
        original_user_id: approval.user_id,
        reason: approval.reason,
        touchpoint_number: approval.touchpoint_number,
      },
    });

    return c.json({
      message: 'Approval approved successfully',
      approval: mapRowToApproval(result.rows[0]),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Approve error:', error);
    throw new Error('Failed to approve');
  } finally {
    client.release();
  }
});

// POST /api/approvals/:id/reject - Reject an approval
approvals.post('/:id/reject', authMiddleware, requirePermission('approvals', 'update'), async (c) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const validated = rejectSchema.parse(body);

    // Check if approval exists and is pending
    const existing = await client.query(
      'SELECT * FROM approvals WHERE id = $1',
      [id]
    );

    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new NotFoundError('Approval');
    }

    if (existing.rows[0].status !== 'pending') {
      await client.query('ROLLBACK');
      throw new ValidationError('Approval is not in pending status');
    }

    const approval = existing.rows[0];

    const result = await client.query(
      `UPDATE approvals
       SET status = 'rejected',
           rejected_by = $1,
           rejected_at = NOW(),
           rejection_reason = $2,
           notes = COALESCE($3, notes),
           updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [user.sub, validated.rejection_reason, validated.notes, id]
    );

    await client.query('COMMIT');

    // Audit log the rejection action
    await auditLog({
      userId: user.sub,
      action: 'reject',
      entity: 'approval',
      entityId: id,
      newValues: {
        rejection_reason: validated.rejection_reason,
        notes: validated.notes,
      },
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
      userAgent: c.req.header('user-agent'),
      metadata: {
        approval_type: approval.type,
        client_id: approval.client_id,
        original_user_id: approval.user_id,
      },
    });

    return c.json({
      message: 'Approval rejected',
      approval: mapRowToApproval(result.rows[0]),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Reject error:', error);
    throw new Error('Failed to reject');
  } finally {
    client.release();
  }
});

// POST /api/approvals/bulk-approve - Bulk approve multiple approvals (now queued)
approvals.post('/bulk-approve', authMiddleware, requirePermission('approvals', 'update'), auditMiddleware('approval', 'bulk_approve'), async (c) => {
  const user = c.get('user');
  if (!user) throw new AuthenticationError('Unauthorized');

  try {
    const body = await c.req.json();
    const { ids } = bulkApproveSchema.parse(body);

    // Create bulk approve job
    const job = await addBulkJob(
      BulkJobType.BULK_APPROVE,
      user.sub,
      ids
    );

    // Return immediately with job information
    return c.json({
      success: true,
      job_id: job.id,
      message: `Bulk approve job started for ${ids.length} approvals`,
      status_url: `/api/jobs/queue/${job.id}`,
      estimated_time: `${Math.ceil(ids.length / 50)} minutes`,
    }, 201);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      const validationError = new ValidationError('Invalid request body');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Bulk approve approvals error:', error);
    throw new Error('Failed to create bulk approve job');
  }
});

// POST /api/approvals/bulk-reject - Bulk reject multiple approvals (now queued)
approvals.post('/bulk-reject', authMiddleware, requirePermission('approvals', 'update'), auditMiddleware('approval', 'bulk_reject'), async (c) => {
  const user = c.get('user');
  if (!user) throw new AuthenticationError('Unauthorized');

  try {
    const body = await c.req.json();
    const { ids, reason } = bulkRejectSchema.parse(body);

    // Create bulk reject job with reason as parameter
    const job = await addBulkJob(
      BulkJobType.BULK_REJECT,
      user.sub,
      ids,
      { reason }
    );

    // Return immediately with job information
    return c.json({
      success: true,
      job_id: job.id,
      message: `Bulk reject job started for ${ids.length} approvals`,
      status_url: `/api/jobs/queue/${job.id}`,
      estimated_time: `${Math.ceil(ids.length / 50)} minutes`,
    }, 201);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      const validationError = new ValidationError('Invalid request body');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Bulk reject approvals error:', error);
    throw new Error('Failed to create bulk reject job');
  }
});

// DELETE /api/approvals/:id - Delete approval
approvals.delete('/:id', authMiddleware, requirePermission('approvals', 'delete'), auditMiddleware('approval'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');

    const existing = await pool.query(
      'SELECT * FROM approvals WHERE id = $1',
      [id]
    );

    if (existing.rows.length === 0) {
      throw new NotFoundError('Approval');
    }

    const oldApproval = existing.rows[0];

    await pool.query('DELETE FROM approvals WHERE id = $1', [id]);

    // Audit log the approval deletion
    await auditLog({
      userId: user.sub,
      action: 'delete',
      entity: 'approval',
      entityId: id,
      oldValues: {
        type: oldApproval.type,
        client_id: oldApproval.client_id,
        status: oldApproval.status,
        reason: oldApproval.reason,
      },
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
      userAgent: c.req.header('user-agent'),
    });

    return c.json({ message: 'Approval deleted successfully' });
  } catch (error) {
    console.error('Delete approval error:', error);
    throw new Error();
  }
});

// GET /api/approvals/stats - Get approval statistics
approvals.get('/stats/summary', authMiddleware, requirePermission('approvals', 'read'), async (c) => {
  try {
    const user = c.get('user');

    let whereClause = '';
    const params: any[] = [];

    // Field agents (caravan/tele) can only see their own stats
    if (user.role === 'caravan' || user.role === 'tele') {
      whereClause = 'WHERE user_id = $1';
      params.push(user.sub);
    }

    const result = await pool.query(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'approved') as approved,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
        COUNT(*) FILTER (WHERE type = 'client') as client_approvals,
        COUNT(*) FILTER (WHERE type = 'udi') as udi_approvals
       FROM approvals ${whereClause}`,
      params
    );

    const stats = result.rows[0];

    return c.json({
      total: parseInt(stats.total),
      pending: parseInt(stats.pending),
      approved: parseInt(stats.approved),
      rejected: parseInt(stats.rejected),
      client_approvals: parseInt(stats.client_approvals),
      udi_approvals: parseInt(stats.udi_approvals),
    });
  } catch (error) {
    console.error('Get approval stats error:', error);
    throw new Error();
  }
});

// POST /api/approvals/loan-release - Submit loan release for approval (Admin, Caravan, Tele)
approvals.post('/loan-release', authMiddleware, requirePermission('approvals', 'create'), async (c) => {
  const client = await pool.connect(); // Use transaction
  try {
    await client.query('BEGIN'); // Start transaction

    const user = c.get('user');
    const body = await c.req.json();

    // Validate that user is Admin, Caravan or Tele
    if (!['admin', 'caravan', 'tele'].includes(user.role)) {
      throw new AuthorizationError('Loan release is only available for Admin, Caravan and Tele users');
    }

    // Validate request body
    const loanReleaseSchema = z.object({
      client_id: z.string().uuid('Valid client ID is required'),
      udi_number: z.string().min(1, 'UDI number is required').max(50, 'UDI number must be 50 characters or less'),
      notes: z.string().optional(),
    });

    const validated = loanReleaseSchema.parse(body);

    // Check if client exists and if loan already released
    const clientCheck = await client.query(
      'SELECT id, first_name, last_name, loan_released FROM clients WHERE id = $1',
      [validated.client_id]
    );

    if (clientCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new NotFoundError('Client');
    }

    if (clientCheck.rows[0].loan_released) {
      await client.query('ROLLBACK');
      throw new ConflictError('Loan already released for this client');
    }

    const clientData = clientCheck.rows[0];

    // Step 1: Mark client as loan_released
    await client.query(
      'UPDATE clients SET loan_released = TRUE, loan_released_at = NOW(), updated_at = NOW() WHERE id = $1',
      [validated.client_id]
    );

    // Step 1.5: Create touchpoint #7 as Completed when loan is released
    await client.query(
      `INSERT INTO touchpoints (id, client_id, user_id, touchpoint_number, type, date, reason, status, time_in, time_out)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, CURRENT_DATE, $5, $6, NOW(), NOW())
       ON CONFLICT (client_id, touchpoint_number)
       DO UPDATE SET status = $6, type = $4, reason = $5, updated_at = NOW()`,
      [
        validated.client_id,
        user.sub, // user_id
        7, // touchpoint_number - final touchpoint
        'Visit', // type - touchpoint #7 is a Visit
        'Loan released', // reason
        'Completed', // status - loan is released
      ]
    );

    // Step 2: Create UDI approval for loan release
    const result = await client.query(
      `INSERT INTO approvals (id, type, client_id, user_id, role, reason, notes, udi_number, status)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING *`,
      [
        'udi', // type: UDI approval
        validated.client_id,
        user.sub, // user_id
        user.role, // role
        'Loan Release Request', // reason
        validated.notes || `Loan release requested by ${user.role}`,
        validated.udi_number,
      ]
    );

    await client.query('COMMIT'); // Commit transaction

    return c.json({
      message: 'Loan release submitted for approval. Touchpoint #7 marked as completed.',
      approval: {
        id: result.rows[0].id,
        type: result.rows[0].type,
        status: result.rows[0].status,
        udi_number: result.rows[0].udi_number,
        client: {
          id: clientData.id,
          name: `${clientData.first_name} ${clientData.last_name}`,
        },
        created_at: result.rows[0].created_at,
      },
    }, 201);
  } catch (error: any) {
    await client.query('ROLLBACK'); // Rollback on error
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Loan release error:', error);
    throw new Error('Failed to release loan');
  } finally {
    client.release(); // Release connection back to pool
  }
});

export default approvals;
