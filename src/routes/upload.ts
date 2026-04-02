import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { storageService } from '../services/storage.js';
import { pool } from '../db/index.js';
import {
  ValidationError,
  NotFoundError,
} from '../errors/index.js';

const upload = new Hono();

// Apply auth middleware to all upload routes
upload.use('/*', authMiddleware);

// File category configuration
const FILE_CATEGORIES: Record<string, {
  allowedTypes: string[];
  maxSize: number;
  description: string;
}> = {
  selfie: {
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSize: 10 * 1024 * 1024, // 10MB
    description: 'Attendance verification selfie'
  },
  avatar: {
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    maxSize: 5 * 1024 * 1024, // 5MB
    description: 'Profile picture'
  },
  touchpoint_photo: {
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSize: 10 * 1024 * 1024, // 10MB
    description: 'Visit/touchpoint photo'
  },
  audio: {
    allowedTypes: ['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm'],
    maxSize: 25 * 1024 * 1024, // 25MB
    description: 'Voice recording'
  },
  document: {
    allowedTypes: [
      'image/jpeg', 'image/png', 'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    maxSize: 20 * 1024 * 1024, // 20MB
    description: 'Document (ID card, contract, etc.)'
  },
  general: {
    allowedTypes: [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'application/pdf',
      'audio/mpeg', 'audio/wav', 'audio/webm'
    ],
    maxSize: 20 * 1024 * 1024, // 20MB
    description: 'General file upload'
  }
};

// PowerSync upload endpoint
// Receives CRUD operations from the mobile app and applies them to PostgreSQL
upload.post('/', async (c) => {
  const user = c.get('user');

  try {
    const body = await c.req.json();
    const { operations } = body;

    if (!operations || !Array.isArray(operations)) {
      throw new ValidationError('Invalid operations format');
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const results = [];

      for (const op of operations) {
        const { table, op: operation, id, data } = op;

        // Validate table name to prevent SQL injection
        const allowedTables = ['clients', 'addresses', 'phone_numbers', 'touchpoints', 'itineraries', 'user_profiles'];
        if (!allowedTables.includes(table)) {
          throw new Error(`Invalid table: ${table}`);
        }

        let result;

        if (operation === 'PUT') {
          // Upsert operation
          const columns = Object.keys(data);
          const values = Object.values(data);
          const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

          // Build update set clause
          const updateSet = columns
            .map((col, i) => `${col} = $${i + 1}`)
            .join(', ');

          const query = `
            INSERT INTO ${table} (id, ${columns.join(', ')})
            VALUES ($${values.length + 1}, ${placeholders})
            ON CONFLICT (id) DO UPDATE SET ${updateSet}
            RETURNING *
          `;

          result = await client.query(query, [...values, id]);
          results.push({ id, operation: 'PUT', success: true });
        } else if (operation === 'DELETE') {
          // Delete operation
          const query = `DELETE FROM ${table} WHERE id = $1 RETURNING id`;
          result = await client.query(query, [id]);
          results.push({ id, operation: 'DELETE', success: true });
        } else if (operation === 'PATCH') {
          // Partial update operation
          const columns = Object.keys(data);
          const values = Object.values(data);
          const updateSet = columns
            .map((col, i) => `${col} = $${i + 1}`)
            .join(', ');

          const query = `
            UPDATE ${table}
            SET ${updateSet}
            WHERE id = $${values.length + 1}
            RETURNING *
          `;

          result = await client.query(query, [...values, id]);
          results.push({ id, operation: 'PATCH', success: true });
        } else {
          results.push({ id, operation, success: false, error: 'Unknown operation' });
        }
      }

      await client.query('COMMIT');

      return c.json({
        success: true,
        processed: results.length,
        results,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Upload error:', error);
    return c.json({
      message: 'Upload failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Get pending uploads count (for sync status)
upload.get('/pending', async (c) => {
  const user = c.get('user');

  try {
    // Count records that might need sync (based on updated_at)
    const tables = ['clients', 'touchpoints', 'itineraries'];
    const counts: Record<string, number> = {};

    for (const table of tables) {
      // Use appropriate column name based on table
      const columnName = (table === 'touchpoints' || table === 'itineraries') ? 'user_id' : 'caravan_id';
      const result = await pool.query(
        `SELECT COUNT(*) as count FROM ${table} WHERE ${columnName} = $1`,
        [user.sub]
      );
      counts[table] = parseInt(result.rows[0].count);
    }

    return c.json({ counts });
  } catch (error) {
    console.error('Pending count error:', error);
    throw new Error('Failed to get pending count');
  }
});

// Get allowed file categories and their constraints
upload.get('/categories', (c) => {
  return c.json({
    categories: Object.entries(FILE_CATEGORIES).map(([key, config]) => ({
      name: key,
      description: config.description,
      allowed_types: config.allowedTypes,
      max_size: config.maxSize,
      max_size_formatted: `${Math.round(config.maxSize / 1024 / 1024)}MB`
    }))
  });
});

// Unified file upload endpoint
// Supports multiple categories: selfie, avatar, touchpoint_photo, audio, document, general
upload.post('/file', async (c) => {
  const user = c.get('user');

  try {
    const body = await c.req.parseBody();
    const file = body['file'];
    const category = (body['category'] as string) || 'general';
    const entityId = body['entity_id'] as string | undefined; // Optional: link to entity (client, touchpoint, etc.)
    const entityType = body['entity_type'] as string | undefined; // Optional: entity type (client, touchpoint, etc.)

    if (!file || !(file instanceof File)) {
      throw new ValidationError('No file uploaded');
    }

    // Validate category
    const categoryConfig = FILE_CATEGORIES[category];
    if (!categoryConfig) {
      return c.json({
        message: `Invalid category. Allowed: ${Object.keys(FILE_CATEGORIES).join(', ')}`
      }, 400);
    }

    // Validate file type
    if (!categoryConfig.allowedTypes.includes(file.type)) {
      return c.json({
        message: `Invalid file type for category '${category}'. Allowed: ${categoryConfig.allowedTypes.join(', ')}`
      }, 400);
    }

    // Validate file size
    if (file.size > categoryConfig.maxSize) {
      return c.json({
        message: `File too large for category '${category}'. Maximum: ${Math.round(categoryConfig.maxSize / 1024 / 1024)}MB`
      }, 400);
    }

    // Convert File to Buffer for storage service
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload file using storage service
    const uploadResult = await storageService.upload({
      file: buffer,
      filename: file.name,
      mimetype: file.type,
      folder: category,
      maxSize: categoryConfig.maxSize,
      allowedMimeTypes: categoryConfig.allowedTypes,
    });

    if (!uploadResult.success) {
      throw new ValidationError(uploadResult.error || 'Failed to upload file');
    }

    // Store file metadata in database
    const fileRecord = await pool.query(
      `INSERT INTO files (filename, original_filename, mime_type, size, url, storage_key, uploaded_by, entity_type, entity_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        uploadResult.key?.split('/').pop() || file.name,
        file.name,
        file.type,
        file.size,
        uploadResult.url,
        uploadResult.key,
        user.sub,
        entityType,
        entityId,
      ]
    );

    return c.json({
      message: 'File uploaded successfully',
      url: uploadResult.url,
      key: uploadResult.key,
      filename: uploadResult.key?.split('/').pop(),
      category,
      original_name: file.name,
      size: file.size,
      type: file.type,
      entity_id: entityId,
      file_id: fileRecord.rows[0]?.id,
    });
  } catch (error) {
    console.error('File upload error:', error);
    throw new Error('Failed to upload file');
  }
});

// Legacy endpoints for backward compatibility (redirect to /file)

// Upload selfie photo (for attendance verification)
upload.post('/selfie', async (c) => {
  const user = c.get('user');

  try {
    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || !(file instanceof File)) {
      throw new ValidationError('No file uploaded');
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      throw new ValidationError('Invalid file type. Only JPEG, PNG, and WebP are allowed');
    }

    // Validate file size (max 10MB for selfies)
    if (file.size > 10 * 1024 * 1024) {
      throw new ValidationError('File too large. Maximum size is 10MB');
    }

    // Generate unique filename
    const timestamp = Date.now();
    const extension = file.name.split('.').pop() || 'jpg';
    const filename = `selfies/${user.sub}/${timestamp}.${extension}`;

    // In production, upload to S3 or similar storage
    const selfieUrl = process.env.NODE_ENV === 'development'
      ? `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.sub}-${timestamp}`
      : `${process.env.STORAGE_URL || 'https://storage.example.com'}/${filename}`;

    return c.json({
      message: 'Selfie uploaded successfully',
      url: selfieUrl,
      filename,
      size: file.size,
      type: file.type,
    });
  } catch (error) {
    console.error('Selfie upload error:', error);
    throw new Error('Failed to upload selfie');
  }
});

// Upload document (generic file upload with category)
upload.post('/document', async (c) => {
  const user = c.get('user');

  try {
    const body = await c.req.parseBody();
    const file = body['file'];
    const category = body['category'] as string || 'general';

    if (!file || !(file instanceof File)) {
      throw new ValidationError('No file uploaded');
    }

    // Validate file type
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (!allowedTypes.includes(file.type)) {
      throw new ValidationError('Invalid file type');
    }

    // Validate file size (max 20MB)
    if (file.size > 20 * 1024 * 1024) {
      throw new ValidationError('File too large. Maximum size is 20MB');
    }

    // Generate unique filename
    const timestamp = Date.now();
    const extension = file.name.split('.').pop() || 'bin';
    const safeCategory = category.replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = `documents/${user.sub}/${safeCategory}/${timestamp}.${extension}`;

    const documentUrl = process.env.NODE_ENV === 'development'
      ? `https://via.placeholder.com/400x300?text=${safeCategory}`
      : `${process.env.STORAGE_URL || 'https://storage.example.com'}/${filename}`;

    return c.json({
      message: 'Document uploaded successfully',
      url: documentUrl,
      filename,
      category,
      size: file.size,
      type: file.type,
    });
  } catch (error) {
    console.error('Document upload error:', error);
    throw new Error('Failed to upload document');
  }
});

export default upload;
