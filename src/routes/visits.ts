import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { visitService, createVisitSchema, updateVisitSchema, type Visit } from '../services/visit.service.js';
import { ValidationError } from '../errors/index.js';
import { storageService } from '../services/storage.js';
import { pool } from '../db/index.js';

const visits = new Hono();

const SIGNED_URL_EXPIRY = 3600; // 1 hour

function extractS3Key(url: string): string | null {
  if (!url) return null;
  const bucket = process.env.STORAGE_BUCKET || 'imu-uploads';
  const region = process.env.AWS_REGION || 'ap-southeast-1';
  const prefix = `https://${bucket}.s3.${region}.amazonaws.com/`;
  if (url.startsWith(prefix)) return url.slice(prefix.length);
  return null;
}

async function signVisitPhoto<T extends { photo_url?: string | null }>(visit: T): Promise<T> {
  if (!visit.photo_url || !storageService.isS3Ready()) return visit;
  const key = extractS3Key(visit.photo_url);
  if (!key) return visit;
  try {
    const signed = await storageService.getSignedUrl(key, SIGNED_URL_EXPIRY);
    return { ...visit, photo_url: signed };
  } catch {
    return visit;
  }
}

async function signVisitPhotos<T extends { photo_url?: string | null }>(items: T[]): Promise<T[]> {
  return Promise.all(items.map(signVisitPhoto));
}

// Get all visits (with filters)
// If client_id is provided, returns all visits for that client (any user) so CMS history panel works
visits.get('/', authMiddleware, async (c) => {
  const user = c.get('user');
  const filters = c.req.query();
  let results: Visit[];
  if (filters.client_id) {
    results = await visitService.findByClientId(filters.client_id, filters);
  } else {
    results = await visitService.findAll(user.sub, filters);
  }
  return c.json(await signVisitPhotos(results));
});

// Create visit (supports FormData with photo upload or JSON)
visits.post('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    let visitData: any = { user_id: user.sub };
    let photoUrl: string | null = null;

    // Check if request is FormData (multipart) or JSON
    const contentType = c.req.header('content-type') || '';
    console.log('[Visits] Content-Type:', contentType);

    // Log all headers
    const headers: Record<string, string> = {};
    c.req.raw.headers.forEach((value, key) => {
      headers[key] = value;
    });
    console.log('[Visits] All headers:', JSON.stringify(headers, null, 2));

    // Check raw header value
    const rawContentType = c.req.raw.headers.get('content-type');
    console.log('[Visits] Raw Content-Type:', rawContentType);

    if (contentType.includes('multipart/form-data')) {
      console.log('[Visits] Parsing FormData request...');

      // Use pre-parsed data from middleware
      const body = c.get('parsedFormData' as any) as Record<string, string | File>;

      if (!body) {
        console.error('[Visits] No parsed FormData found in context');
        return c.json({ success: false, message: 'Failed to parse FormData' }, 500);
      }

      console.log('[Visits] FormData parsed successfully with busboy');
      const file = body['photo'];

      console.log('[Visits] FormData parsed, file present:', !!file);

      // Extract visit data from form fields
      const formDataFields = ['client_id', 'type', 'time_in', 'time_out', 'odometer_arrival', 'odometer_departure', 'notes', 'reason', 'status', 'address', 'latitude', 'longitude', 'source'];
      formDataFields.forEach(field => {
        if (body[field] !== undefined) {
          visitData[field] = body[field];
        }
      });

      console.log('[Visits] Visit data:', JSON.stringify(visitData, null, 2));

      // If photo file is present, upload it to S3
      if (file && file instanceof File) {
        console.log('[Visits] Photo file detected:', file.name, 'type:', file.type, 'size:', file.size);

        try {
          // Validate file type
          const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
          if (!allowedTypes.includes(file.type)) {
            console.error('[Visits] Invalid photo type:', file.type);
            return c.json({ success: false, message: `Invalid photo type. Only JPEG, PNG, and WebP are allowed` }, 400);
          }

          // Validate file size (max 10MB)
          if (file.size > 10 * 1024 * 1024) {
            console.error('[Visits] Photo too large:', file.size);
            return c.json({ success: false, message: `Photo too large. Maximum size is 10MB` }, 400);
          }

          console.log('[Visits] Converting file to buffer...');
          // Convert File to Buffer for storage service
          const arrayBuffer = await file.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          console.log('[Visits] Calling storage service upload...');
          // Upload photo to S3 using storage service
          const uploadResult = await storageService.upload({
            file: buffer,
            filename: file.name,
            mimetype: file.type,
            folder: 'visit_photo',
            maxSize: 10 * 1024 * 1024,
            allowedMimeTypes: allowedTypes,
          });

          console.log('[Visits] Upload result:', JSON.stringify(uploadResult, null, 2));

          if (!uploadResult.success || !uploadResult.url) {
            console.error('[Visits] Photo upload failed:', uploadResult.error);
            return c.json({
              success: false,
              message: `Photo upload failed: ${uploadResult.error || 'Unknown error'}`
            }, 500);
          }

          photoUrl = uploadResult.url;
          visitData.photo_url = photoUrl;
          visitData._uploadKey = uploadResult.key;
          visitData._uploadSize = file.size;
          visitData._uploadMime = file.type;
          visitData._uploadOriginalName = file.name;

          console.log('[Visits] Photo uploaded successfully:', photoUrl);
        } catch (uploadError: any) {
          console.error('[Visits] Photo upload error:', uploadError);
          console.error('[Visits] Error stack:', uploadError.stack);
          return c.json({
            success: false,
            message: `Photo upload failed: ${uploadError.message || 'Unknown error'}`
          }, 500);
        }
      } else {
        console.log('[Visits] No photo file in FormData');
      }
    } else {
      console.log('[Visits] Parsing JSON request...');
      // Regular JSON request
      const data = await c.req.json();
      visitData = { ...visitData, ...data };
    }

    // Extract upload metadata before passing to service (these are not DB columns)
    const uploadKey = visitData._uploadKey;
    const uploadSize = visitData._uploadSize;
    const uploadMime = visitData._uploadMime;
    const uploadOriginalName = visitData._uploadOriginalName;
    delete visitData._uploadKey;
    delete visitData._uploadSize;
    delete visitData._uploadMime;
    delete visitData._uploadOriginalName;

    console.log('[Visits] Creating visit with data:', JSON.stringify(visitData, null, 2));
    const visit = await visitService.create(visitData);
    console.log('[Visits] Visit created successfully:', visit.id);

    // Save file record if photo was uploaded
    if (uploadKey && visit.id) {
      await pool.query(
        `INSERT INTO files (filename, original_filename, mime_type, size, url, storage_key, storage_provider, uploaded_by, entity_type, entity_id)
         VALUES ($1, $2, $3, $4, $5, $6, 's3', $7, 'visit', $8)`,
        [uploadKey, uploadOriginalName, uploadMime, uploadSize, visitData.photo_url, uploadKey, user.sub, visit.id]
      );
      console.log('[Visits] File record saved for visit:', visit.id);
    }

    return c.json(visit, 201);
  } catch (error: any) {
    console.error('[Visits] Error creating visit:', error);
    console.error('[Visits] Error stack:', error.stack);

    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }

    // Return proper JSON error response
    return c.json({
      success: false,
      message: error.message || 'Failed to create visit'
    }, 500);
  }
});

// Update visit
visits.patch('/:id', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    if (!id) return c.json({ error: 'Invalid ID' }, 400);
    const data = await c.req.json();
    const visit = await visitService.update(id, data);
    if (!visit) return c.json({ error: 'Visit not found' }, 404);
    return c.json(visit);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    throw error;
  }
});

// Delete visit
visits.delete('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Invalid ID' }, 400);
  await visitService.delete(id);
  return c.json({ success: true });
});

// Admin: paginated visits list with full JOINs
visits.get('/admin', authMiddleware, requireRole('admin'), async (c) => {
  const client = await pool.connect();
  try {
    const q = c.req.query();
    const page = Math.max(1, parseInt(q.page || '1'));
    const perPage = Math.min(100, Math.max(1, parseInt(q.per_page || '20')));
    const offset = (page - 1) * perPage;

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (q.search) {
      conditions.push(`(c.first_name ILIKE $${idx} OR c.last_name ILIKE $${idx} OR c.middle_name ILIKE $${idx})`);
      params.push(`%${q.search}%`);
      idx++;
    }
    if (q.date_from) {
      conditions.push(`COALESCE(v.time_in, v.created_at) >= $${idx}`);
      params.push(q.date_from);
      idx++;
    }
    if (q.date_to) {
      conditions.push(`COALESCE(v.time_in, v.created_at) <= $${idx}`);
      params.push(q.date_to);
      idx++;
    }
    if (q.status && q.status !== 'all') {
      conditions.push(`v.status = $${idx}`);
      params.push(q.status);
      idx++;
    }
    if (q.agent_id && q.agent_id !== 'all') {
      const agentIds = Array.isArray(q.agent_id) ? q.agent_id : [q.agent_id];
      conditions.push(`v.user_id = ANY($${idx})`);
      params.push(agentIds);
      idx++;
    }
    if (q.visit_type && q.visit_type !== 'all') {
      const types = Array.isArray(q.visit_type) ? q.visit_type : [q.visit_type];
      const typeClauses = types.map((t: string) => {
        if (t === 'touchpoint') return 'tp.id IS NOT NULL';
        if (t === 'release_loan') return '(r.id IS NOT NULL AND tp.id IS NULL)';
        if (t === 'regular_visit') return '(tp.id IS NULL AND r.id IS NULL)';
        return null;
      }).filter(Boolean);
      if (typeClauses.length) conditions.push(`(${typeClauses.join(' OR ')})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const baseQuery = `
      FROM visits v
      JOIN clients c ON c.id = v.client_id
      JOIN users u ON u.id = v.user_id
      LEFT JOIN touchpoints tp ON tp.visit_id = v.id
      LEFT JOIN releases r ON r.visit_id = v.id
      ${where}
    `;

    const countResult = await client.query(`SELECT COUNT(*) ${baseQuery}`, params);
    const totalItems = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalItems / perPage);

    const dataResult = await client.query(`
      SELECT
        v.id,
        v.client_id,
        (c.first_name || ' ' || c.last_name) AS client_name,
        COALESCE(v.time_in, v.created_at) AS visit_date,
        CASE
          WHEN tp.id IS NOT NULL THEN 'touchpoint'
          WHEN r.id IS NOT NULL THEN 'release_loan'
          ELSE 'regular_visit'
        END AS visit_type,
        tp.id AS touchpoint_id,
        tp.touchpoint_number,
        r.id AS release_id,
        r.product_type,
        r.loan_type,
        r.amount AS udi_amount,
        v.user_id AS agent_id,
        (u.first_name || ' ' || u.last_name) AS agent_name,
        v.status,
        v.reason,
        v.notes,
        v.photo_url,
        v.address,
        v.latitude,
        v.longitude,
        v.time_in,
        v.time_out,
        v.source
      ${baseQuery}
      ORDER BY COALESCE(v.time_in, v.created_at) DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, perPage, offset]);

    return c.json({
      items: await signVisitPhotos(dataResult.rows),
      page,
      perPage,
      totalItems,
      totalPages,
    });
  } finally {
    client.release();
  }
});

// Admin: CSV export (all matching records, no pagination)
visits.get('/admin/export', authMiddleware, requireRole('admin'), async (c) => {
  const client = await pool.connect();
  try {
    const q = c.req.query();

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (q.search) {
      conditions.push(`(c.first_name ILIKE $${idx} OR c.last_name ILIKE $${idx} OR c.middle_name ILIKE $${idx})`);
      params.push(`%${q.search}%`);
      idx++;
    }
    if (q.date_from) {
      conditions.push(`COALESCE(v.time_in, v.created_at) >= $${idx}`);
      params.push(q.date_from);
      idx++;
    }
    if (q.date_to) {
      conditions.push(`COALESCE(v.time_in, v.created_at) <= $${idx}`);
      params.push(q.date_to);
      idx++;
    }
    if (q.status && q.status !== 'all') {
      conditions.push(`v.status = $${idx}`);
      params.push(q.status);
      idx++;
    }
    if (q.agent_id && q.agent_id !== 'all') {
      const agentIds = Array.isArray(q.agent_id) ? q.agent_id : [q.agent_id];
      conditions.push(`v.user_id = ANY($${idx})`);
      params.push(agentIds);
      idx++;
    }
    if (q.visit_type && q.visit_type !== 'all') {
      const types = Array.isArray(q.visit_type) ? q.visit_type : [q.visit_type];
      const typeClauses = types.map((t: string) => {
        if (t === 'touchpoint') return 'tp.id IS NOT NULL';
        if (t === 'release_loan') return '(r.id IS NOT NULL AND tp.id IS NULL)';
        if (t === 'regular_visit') return '(tp.id IS NULL AND r.id IS NULL)';
        return null;
      }).filter(Boolean);
      if (typeClauses.length) conditions.push(`(${typeClauses.join(' OR ')})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await client.query(`
      SELECT
        (c.first_name || ' ' || c.last_name) AS "Client Name",
        TO_CHAR(COALESCE(v.time_in, v.created_at), 'YYYY-MM-DD HH24:MI') AS "Visit Date",
        CASE
          WHEN tp.id IS NOT NULL THEN 'Touchpoint'
          WHEN r.id IS NOT NULL THEN 'Release Loan'
          ELSE 'Regular Visit'
        END AS "Visit Type",
        COALESCE(tp.touchpoint_number::text, '') AS "Touchpoint #",
        COALESCE(r.product_type, '') AS "Product Type",
        COALESCE(r.loan_type, '') AS "Loan Type",
        COALESCE(r.amount::text, '') AS "UDI Amount",
        (u.first_name || ' ' || u.last_name) AS "Agent",
        COALESCE(v.status, '') AS "Status",
        COALESCE(v.reason, '') AS "Reason"
      FROM visits v
      JOIN clients c ON c.id = v.client_id
      JOIN users u ON u.id = v.user_id
      LEFT JOIN touchpoints tp ON tp.visit_id = v.id
      LEFT JOIN releases r ON r.visit_id = v.id
      ${where}
      ORDER BY COALESCE(v.time_in, v.created_at) DESC
    `, params);

    const headers = ['Client Name', 'Visit Date', 'Visit Type', 'Touchpoint #', 'Product Type', 'Loan Type', 'UDI Amount', 'Agent', 'Status', 'Reason'];
    const csvRows = [
      headers.join(','),
      ...result.rows.map((row: any) =>
        headers.map(h => {
          const val = String(row[h] ?? '');
          return val.includes(',') || val.includes('"') || val.includes('\n')
            ? `"${val.replace(/"/g, '""')}"`
            : val;
        }).join(',')
      )
    ];

    const filename = `visits-export-${new Date().toISOString().slice(0, 10)}.csv`;
    c.header('Content-Type', 'text/csv');
    c.header('Content-Disposition', `attachment; filename="${filename}"`);
    return c.text(csvRows.join('\n'));
  } finally {
    client.release();
  }
});

// Get visit by ID (must be after /admin and /admin/export to avoid route shadowing)
visits.get('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Invalid ID' }, 400);
  const visit = await visitService.findById(id);
  if (!visit) return c.json({ error: 'Visit not found' }, 404);
  return c.json(await signVisitPhoto(visit));
});

export default visits;
