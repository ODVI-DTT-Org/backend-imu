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

const approvals = new Hono();

// Manager roles for authorization
const MANAGER_ROLES = ['admin', 'area_manager', 'assistant_area_manager'] as const;
// Approval roles: managers and staff can approve
const APPROVAL_ROLES = [...MANAGER_ROLES, 'staff'] as const;

// Validation schemas
const createApprovalSchema = z.object({
  type: z.enum(['client', 'udi', 'address_add', 'address_edit', 'address_delete', 'phone_add', 'phone_edit', 'phone_delete', 'client_delete', 'loan_release', 'loan_release_v2']),
  client_id: z.string().uuid().optional(),
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
    visit_remarks: row.visit_remarks ?? null,
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
      if (type === 'client_group') {
        conditions.push(`a.type = ANY($${paramIndex}::text[])`);
        params.push(['client', 'address_add', 'address_edit', 'address_delete', 'phone_add', 'phone_edit', 'phone_delete', 'client_delete', 'loan_release_v2']);
        paramIndex++;
      } else if (type.includes(',')) {
        const types = type.split(',').map(t => t.trim()).filter(Boolean);
        const placeholders = types.map((_, i) => `$${paramIndex + i}`).join(', ');
        conditions.push(`a.type IN (${placeholders})`);
        params.push(...types);
        paramIndex += types.length;
      } else {
        conditions.push(`a.type = $${paramIndex}`);
        params.push(type);
        paramIndex++;
      }
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
              u.first_name as approver_first_name, u.last_name as approver_last_name,
              v.remarks as visit_remarks
       FROM approvals a
       LEFT JOIN clients c ON c.id = a.client_id
       LEFT JOIN users car ON car.id = a.user_id
       LEFT JOIN users u ON u.id = a.approved_by
       LEFT JOIN LATERAL (
         SELECT remarks FROM visits
         WHERE a.type = 'udi'
           AND left(a.notes, 1) = '{'
           AND id = (a.notes::jsonb->>'visit_id')::uuid
         LIMIT 1
       ) v ON true
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
      `INSERT INTO approvals (id, type, client_id, user_id, touchpoint_number, role, reason, notes, updated_client_information, status)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       RETURNING *`,
      [
        validated.type,
        validated.client_id ?? null,
        validated.user_id || user.sub,
        validated.touchpoint_number,
        validated.role,
        validated.reason,
        validated.notes,
        validated.updated_client_information ? JSON.stringify(validated.updated_client_information) : null,
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

    // For UDI approvals, handle both loan release and legacy UDI update
    let udiNumber: string | null = null;
    if (approval.type === 'udi') {
      try {
        let parsedNotes: any = null;
        try { parsedNotes = JSON.parse(approval.notes); } catch (_) {}

        if (parsedNotes && (parsedNotes.visit_id || parsedNotes.call_id)) {
          // Loan release approval: create release record and mark client released
          udiNumber = approval.udi_number || parsedNotes.udi_number || null;

          await client.query(`
            INSERT INTO releases (
              id, client_id, user_id, visit_id, call_id, product_type, loan_type,
              udi_number, approval_notes, status
            ) VALUES (
              gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, 'approved'
            )
          `, [approval.client_id, approval.user_id,
              parsedNotes.visit_id ?? null, parsedNotes.call_id ?? null,
              parsedNotes.product_type, parsedNotes.loan_type,
              udiNumber, 'Approved by admin']);

          await client.query(
            'UPDATE clients SET loan_released = TRUE, loan_released_at = NOW() WHERE id = $1',
            [approval.client_id]
          );

          if (parsedNotes.visit_id) {
            await client.query(`
              UPDATE itineraries
              SET status = 'completed', updated_at = NOW()
              WHERE client_id = $1 AND user_id = $2
            `, [approval.client_id, approval.user_id]);
          }
        } else {
          // Legacy UDI-only update: parse from notes text or udi_number column
          udiNumber = approval.udi_number
            || approval.notes?.match(/UDI Number:\s*(\d+)/)?.[1]
            || null;
          if (udiNumber) {
            await client.query(
              'UPDATE clients SET udi = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL',
              [udiNumber, approval.client_id]
            );
          }
        }
      } catch (error) {
        console.error('Failed to process UDI approval:', error);
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
            agency_id, user_id, is_starred
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
          ) RETURNING id`,
          [
            clientData.first_name, clientData.last_name, clientData.middle_name, clientData.birth_date,
            clientData.email, clientData.phone, clientData.agency_name, clientData.department,
            clientData.position, clientData.employment_status, clientData.payroll_date, clientData.tenure,
            clientData.client_type, clientData.product_type, clientData.market_type, clientData.pension_type,
            clientData.pan, clientData.facebook_link, clientData.remarks, clientData.agency_id,
            clientData.user_id, clientData.is_starred
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

    // For loan_release_v2 approvals, create release and update client
    if (approval.type === 'loan_release_v2') {
      try {
        const notes = JSON.parse(approval.notes);
        const visitId = notes.visit_id;  // For Caravan releases
        const callId = notes.call_id;    // For Tele releases

        // CREATE releases record (references visit_id OR call_id)
        await client.query(`
          INSERT INTO releases (
            id, client_id, user_id, visit_id, call_id, product_type, loan_type,
            udi_number, approval_notes, status
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, 'approved'
          )
        `, [approval.client_id, approval.user_id, visitId, callId,
            notes.product_type, notes.loan_type, notes.udi_number ?? notes.amount,
            'Approved by admin']);

        // UPDATE clients
        await client.query(`
          UPDATE clients
          SET loan_released = TRUE, loan_released_at = NOW()
          WHERE id = $1
        `, [approval.client_id]);

        // UPDATE itineraries (now completed) - only for Caravan (visit-based)
        if (visitId) {
          await client.query(`
            UPDATE itineraries
            SET status = 'completed', updated_at = NOW()
            WHERE client_id = $1
              AND scheduled_date = CURRENT_DATE
              AND user_id = $2
          `, [approval.client_id, approval.user_id]);
        }
        // Note: Tele releases don't update itineraries (no scheduled visit)
      } catch (parseError) {
        console.error('Failed to process loan release approval:', parseError);
        await client.query('ROLLBACK');
        throw new Error('Failed to process loan release approval');
      }
    }

    // For address_add approvals, create address record
    if (approval.type === 'address_add') {
      try {
        const notes = JSON.parse(approval.notes);

        // CREATE addresses record (matching existing schema)
        await client.query(`
          INSERT INTO addresses (
            id, client_id, type, street, barangay, city, province, postal_code, latitude, longitude, is_primary
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
          )
        `, [approval.client_id, notes.type, notes.street, notes.barangay, notes.city,
            notes.province, notes.postal_code, notes.latitude, notes.longitude, notes.is_primary]);
      } catch (parseError) {
        console.error('Failed to process address approval:', parseError);
        await client.query('ROLLBACK');
        throw new Error('Failed to process address approval');
      }
    }

    // For phone_add approvals, create phone record
    if (approval.type === 'phone_add') {
      try {
        const notes = JSON.parse(approval.notes);

        // CREATE phone_numbers record (matching existing schema)
        await client.query(`
          INSERT INTO phone_numbers (
            id, client_id, number, label, is_primary
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4
          )
        `, [approval.client_id, notes.number, notes.label, notes.is_primary]);
      } catch (parseError) {
        console.error('Failed to process phone approval:', parseError);
        await client.query('ROLLBACK');
        throw new Error('Failed to process phone approval');
      }
    }

    // For client_delete approvals, soft-delete the client
    if (approval.type === 'client_delete') {
      try {
        await client.query(
          'UPDATE clients SET deleted_at = NOW(), deleted_by = $1 WHERE id = $2 AND deleted_at IS NULL',
          [approval.user_id, approval.client_id]
        );
        console.log(`Soft-deleted client ${approval.client_id} from approval`);
      } catch (deleteError) {
        console.error('Failed to soft-delete client from approval:', deleteError);
        await client.query('ROLLBACK');
        throw new Error('Failed to delete client from approval');
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
          user_id: 'user_id',
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
            `UPDATE clients SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} AND deleted_at IS NULL`,
            updateValues
          );
        }
      } catch (parseError) {
        console.error('Failed to parse client edit changes:', parseError);
      }
    }

    // For address_edit approvals, apply changes to address
    if (approval.type === 'address_edit') {
      try {
        const notes = JSON.parse(approval.notes);
        const { address_id, ...fields } = notes;
        const allowed = ['type', 'street', 'barangay', 'city', 'province', 'postal_code', 'latitude', 'longitude', 'is_primary'];
        const updates: string[] = [];
        const vals: any[] = [];
        let idx = 1;
        for (const [k, v] of Object.entries(fields)) {
          if (allowed.includes(k) && v !== undefined) {
            updates.push(`${k} = $${idx++}`);
            vals.push(v);
          }
        }
        if (updates.length > 0) {
          vals.push(address_id);
          await client.query(`UPDATE addresses SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} AND deleted_at IS NULL`, vals);
        }
      } catch (e) {
        console.error('Failed to process address_edit approval:', e);
        await client.query('ROLLBACK');
        throw new Error('Failed to process address_edit approval');
      }
    }

    // For address_delete approvals, soft-delete the address
    if (approval.type === 'address_delete') {
      try {
        const notes = JSON.parse(approval.notes);
        await client.query('UPDATE addresses SET deleted_at = NOW() WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL', [notes.address_id, approval.client_id]);
      } catch (e) {
        console.error('Failed to process address_delete approval:', e);
        await client.query('ROLLBACK');
        throw new Error('Failed to process address_delete approval');
      }
    }

    // For phone_edit approvals, apply changes to phone number
    if (approval.type === 'phone_edit') {
      try {
        const notes = JSON.parse(approval.notes);
        const { phone_id, ...fields } = notes;
        const allowed = ['label', 'number', 'is_primary'];
        const updates: string[] = [];
        const vals: any[] = [];
        let idx = 1;
        for (const [k, v] of Object.entries(fields)) {
          if (allowed.includes(k) && v !== undefined) {
            updates.push(`${k} = $${idx++}`);
            vals.push(v);
          }
        }
        if (updates.length > 0) {
          vals.push(phone_id);
          await client.query(`UPDATE phone_numbers SET ${updates.join(', ')} WHERE id = $${idx} AND deleted_at IS NULL`, vals);
        }
      } catch (e) {
        console.error('Failed to process phone_edit approval:', e);
        await client.query('ROLLBACK');
        throw new Error('Failed to process phone_edit approval');
      }
    }

    // For phone_delete approvals, soft-delete the phone number
    if (approval.type === 'phone_delete') {
      try {
        const notes = JSON.parse(approval.notes);
        await client.query('UPDATE phone_numbers SET deleted_at = NOW() WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL', [notes.phone_id, approval.client_id]);
      } catch (e) {
        console.error('Failed to process phone_delete approval:', e);
        await client.query('ROLLBACK');
        throw new Error('Failed to process phone_delete approval');
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

// POST /api/approvals/bulk-approve - Bulk approve multiple approvals
approvals.post('/bulk-approve', authMiddleware, requirePermission('approvals', 'update'), auditMiddleware('approval', 'bulk_approve'), async (c) => {
  const user = c.get('user');
  if (!user) throw new AuthenticationError('Unauthorized');

  const client = await pool.connect();
  try {
    const body = await c.req.json();
    const { ids } = bulkApproveSchema.parse(body);

    await client.query('BEGIN');

    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    const fieldMappings: Record<string, string> = {
      first_name: 'first_name', last_name: 'last_name', middle_name: 'middle_name',
      birth_date: 'birth_date', email: 'email', phone: 'phone',
      agency_name: 'agency_name', department: 'department', position: 'position',
      employment_status: 'employment_status', payroll_date: 'payroll_date', tenure: 'tenure',
      client_type: 'client_type', product_type: 'product_type', market_type: 'market_type',
      pension_type: 'pension_type', pan: 'pan', facebook_link: 'facebook_link',
      remarks: 'remarks', agency_id: 'agency_id', caravan_id: 'caravan_id', is_starred: 'is_starred',
    };

    for (const id of ids) {
      try {
        const existing = await client.query('SELECT * FROM approvals WHERE id = $1', [id]);
        if (existing.rows.length === 0) { succeeded.push(id); continue; }

        const approval = existing.rows[0];
        if (approval.status !== 'pending') {
          failed.push({ id, error: 'Approval is not in pending status' });
          continue;
        }

        if (approval.type === 'client' && approval.reason === 'Client Edit Request') {
          try {
            const changes = JSON.parse(approval.notes || '{}');
            const updateFields: string[] = [];
            const updateValues: any[] = [];
            let paramIndex = 1;
            for (const [key, dbField] of Object.entries(fieldMappings)) {
              if (key in changes && changes[key] !== undefined) {
                updateFields.push(`${dbField} = $${paramIndex}`);
                updateValues.push(changes[key]);
                paramIndex++;
              }
            }
            if (updateFields.length > 0) {
              updateValues.push(approval.client_id);
              await client.query(
                `UPDATE clients SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} AND deleted_at IS NULL`,
                updateValues
              );
            }
          } catch (_) { /* skip parse errors */ }
        }

        await client.query(
          `UPDATE approvals SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW() WHERE id = $2`,
          [user.sub, id]
        );
        succeeded.push(id);
      } catch (err: any) {
        failed.push({ id, error: err.message || 'Unknown error' });
      }
    }

    await client.query('COMMIT');

    return c.json({ success: succeeded, failed, message: `${succeeded.length} approval(s) approved` });
  } catch (error: any) {
    await client.query('ROLLBACK');
    if (error.name === 'ZodError') {
      const validationError = new ValidationError('Invalid request body');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Bulk approve approvals error:', error);
    throw new Error('Failed to bulk approve approvals');
  } finally {
    client.release();
  }
});

// POST /api/approvals/bulk-reject - Bulk reject multiple approvals
approvals.post('/bulk-reject', authMiddleware, requirePermission('approvals', 'update'), auditMiddleware('approval', 'bulk_reject'), async (c) => {
  const user = c.get('user');
  if (!user) throw new AuthenticationError('Unauthorized');

  const client = await pool.connect();
  try {
    const body = await c.req.json();
    const { ids, reason } = bulkRejectSchema.parse(body);

    await client.query('BEGIN');

    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      try {
        const existing = await client.query('SELECT * FROM approvals WHERE id = $1', [id]);
        if (existing.rows.length === 0) { succeeded.push(id); continue; }

        const approval = existing.rows[0];
        if (approval.status !== 'pending') {
          failed.push({ id, error: 'Approval is not in pending status' });
          continue;
        }

        await client.query(
          `UPDATE approvals SET status = 'rejected', rejected_by = $1, rejected_at = NOW(), rejection_reason = $2, updated_at = NOW() WHERE id = $3`,
          [user.sub, reason, id]
        );
        succeeded.push(id);
      } catch (err: any) {
        failed.push({ id, error: err.message || 'Unknown error' });
      }
    }

    await client.query('COMMIT');

    return c.json({ success: succeeded, failed, message: `${succeeded.length} approval(s) rejected` });
  } catch (error: any) {
    await client.query('ROLLBACK');
    if (error.name === 'ZodError') {
      const validationError = new ValidationError('Invalid request body');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Bulk reject approvals error:', error);
    throw new Error('Failed to bulk reject approvals');
  } finally {
    client.release();
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
      'SELECT id, first_name, last_name, loan_released FROM clients WHERE id = $1 AND deleted_at IS NULL',
      [validated.client_id]
    );

    if (clientCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new NotFoundError('Client');
    }

    const clientData = clientCheck.rows[0];

    // Step 1: Mark client as loan_released
    await client.query(
      'UPDATE clients SET loan_released = TRUE, loan_released_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
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

// POST /api/approvals/loan-release-v2 - Submit loan release with role-based processing
approvals.post('/loan-release-v2', authMiddleware, async (c) => {
  const user = c.get('user');

  // Validate user role
  if (!['admin', 'caravan', 'tele'].includes(user.role)) {
    return c.json({ message: 'Loan release is only available for Admin, Caravan and Tele users' }, 403);
  }

  // Admin bypass: Direct release
  if (user.role === 'admin') {
    const schema = z.object({
      client_id: z.string().uuid(),
      udi_number: z.string().min(1).max(50),
      product_type: z.enum(['BFP_ACTIVE', 'BFP_PENSION', 'PNP_PENSION', 'NAPOLCOM', 'BFP_STP']),
      loan_type: z.enum(['NEW', 'ADDITIONAL', 'RENEWAL', 'PRETERM']),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      address: z.string().optional(),
      photo_url: z.string().optional(),
      remarks: z.string().optional(),
    });

    const validated = schema.parse(await c.req.json());

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check if client exists
      const clientCheck = await client.query(
        'SELECT id, loan_released FROM clients WHERE id = $1 AND deleted_at IS NULL',
        [validated.client_id]
      );

      if (clientCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return c.json({ message: 'Client not found' }, 404);
      }

      // CREATE releases record (no visit_id, no call_id)
      await client.query(`
        INSERT INTO releases (
          id, client_id, user_id, visit_id, call_id, product_type, loan_type,
          udi_number, approval_notes, status
        ) VALUES (
          gen_random_uuid(), $1, $2, NULL, NULL, $3, $4, $5, $6, 'approved'
        )
      `, [validated.client_id, user.sub, validated.product_type,
          validated.loan_type, validated.udi_number, validated.remarks]);

      // UPDATE clients
      await client.query(`
        UPDATE clients
        SET loan_released = TRUE, loan_released_at = NOW()
        WHERE id = $1
      `, [validated.client_id]);

      await client.query('COMMIT');

      return c.json({
        message: 'Loan release processed successfully',
        client_id: validated.client_id,
        loan_released: true,
        loan_released_at: new Date().toISOString()
      });
    } catch (error: any) {
      await client.query('ROLLBACK');
      if (error instanceof z.ZodError) {
        return c.json({ message: 'Invalid input', errors: error.errors }, 400);
      }
      console.error('Admin loan release error:', error);
      return c.json({ message: 'Internal server error' }, 500);
    } finally {
      client.release();
    }
  }

  // Caravan/Tele: Create approval request
  else {
    const schema = z.object({
      client_id: z.string().uuid(),
      udi_number: z.string().min(1).max(50),
      product_type: z.enum(['BFP_ACTIVE', 'BFP_PENSION', 'PNP_PENSION', 'NAPOLCOM', 'BFP_STP']).optional(),
      loan_type: z.enum(['NEW', 'ADDITIONAL', 'RENEWAL', 'PRETERM']).optional(),
      // Caravan-specific fields
      time_in: z.preprocess(v => {
        if (!v) return undefined;
        // Accept HH:MM format and convert to full ISO timestamp (today's date)
        if (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v)) {
          return new Date().toISOString().slice(0, 10) + 'T' + v + ':00.000Z';
        }
        return v;
      }, z.string().datetime().optional()),
      time_out: z.preprocess(v => {
        if (!v) return undefined;
        if (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v)) {
          return new Date().toISOString().slice(0, 10) + 'T' + v + ':00.000Z';
        }
        return v;
      }, z.string().datetime().optional()),
      odometer_in: z.string().max(50).optional(),
      odometer_out: z.string().max(50).optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      address: z.string().optional(),
      photo_url: z.string().url('photo_url must be a valid URL'),
      // Tele-specific fields
      phone_number: z.string().regex(/^09\d{9}$/).optional(),
      duration: z.number().int().positive().optional(),
      // Common fields
      notes: z.string().optional(),
    });

    const validated = schema.parse(await c.req.json());

    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');

      // Check if client exists
      const clientCheck = await dbClient.query(
        'SELECT id, loan_released FROM clients WHERE id = $1 AND deleted_at IS NULL',
        [validated.client_id]
      );

      if (clientCheck.rows.length === 0) {
        await dbClient.query('ROLLBACK');
        return c.json({ message: 'Client not found' }, 404);
      }

      let activityId: string | undefined;

      // Caravan: CREATE visits record
      if (user.role === 'caravan') {
        if (!validated.photo_url) {
          await dbClient.query('ROLLBACK');
          return c.json({ error: 'Photo is required for loan release', errorCode: 'PHOTO_REQUIRED' }, 400);
        }

        const visitResult = await dbClient.query(`
          INSERT INTO visits (
            id, client_id, user_id, type, time_in, time_out,
            odometer_arrival, odometer_departure,
            latitude, longitude, address, photo_url, notes,
            reason, status, source
          ) VALUES (
            gen_random_uuid(), $1, $2, 'release_loan', $3, $4, $5, $6, $7, $8, $9, $10, $11,
            'Loan Release', 'Completed', 'IMU'
          ) RETURNING id
        `, [validated.client_id, user.sub, validated.time_in, validated.time_out,
            validated.odometer_in ?? null, validated.odometer_out ?? null,
            validated.latitude, validated.longitude, validated.address,
            validated.photo_url, validated.notes]);

        activityId = visitResult.rows[0].id;

        // UPDATE itineraries (stays in_progress)
        await dbClient.query(`
          UPDATE itineraries
          SET status = 'in_progress', updated_at = NOW()
          WHERE client_id = $1
            AND scheduled_date = CURRENT_DATE
            AND user_id = $2
        `, [validated.client_id, user.sub]);
      }

      // Tele: CREATE calls record
      else if (user.role === 'tele') {
        const callResult = await dbClient.query(`
          INSERT INTO calls (
            id, client_id, user_id, phone_number, dial_time, duration, notes, reason, type
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, NOW(), $4, $5, $6, 'release_loan'
          ) RETURNING id
        `, [validated.client_id, user.sub, validated.phone_number,
            validated.duration, validated.notes, 'Loan Release Request']);

        activityId = callResult.rows[0].id;
      }

      // CREATE approval request
      const approvalResult = await dbClient.query(`
        INSERT INTO approvals (
          id, type, client_id, user_id, role, reason, notes, udi_number, status
        ) VALUES (
          gen_random_uuid(), 'udi', $1, $2, $3, $4, $5, $6, 'pending'
        ) RETURNING id
      `, [validated.client_id, user.sub, user.role,
          user.role === 'tele' ? 'Loan Release Request (Tele)' : 'Loan Release Request',
          JSON.stringify({
            [user.role === 'caravan' ? 'visit_id' : 'call_id']: activityId,
            udi_number: validated.udi_number,
            product_type: validated.product_type,
            loan_type: validated.loan_type,
          }),
          validated.udi_number]);

      await dbClient.query('COMMIT');

      return c.json({
        message: 'Loan release submitted for approval',
        approval_id: approvalResult.rows[0].id,
        status: 'pending'
      }, 201);
    } catch (error: any) {
      await dbClient.query('ROLLBACK');
      if (error instanceof z.ZodError) {
        return c.json({ message: 'Invalid input', errors: error.errors }, 400);
      }
      console.error('Loan release approval error:', error);
      return c.json({ message: 'Internal server error' }, 500);
    } finally {
      dbClient.release();
    }
  }
});

export default approvals;
