import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { visitService, createVisitSchema, updateVisitSchema } from '../services/visit.service.js';
import { ValidationError } from '../errors/index.js';
import { storageService } from '../services/storage.js';

const visits = new Hono();

// Get all visits (with filters)
visits.get('/', authMiddleware, async (c) => {
  const user = c.get('user');
  const filters = c.req.query();
  const visits = await visitService.findAll(user.sub, filters);
  return c.json(visits);
});

// Get visit by ID
visits.get('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Invalid ID' }, 400);
  const visit = await visitService.findById(id);
  if (!visit) return c.json({ error: 'Visit not found' }, 404);
  return c.json(visit);
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

    if (contentType.includes('multipart/form-data')) {
      console.log('[Visits] Parsing FormData request...');

      // Parse FormData to extract file and visit data
      const body = await c.req.parseBody();
      const file = body['photo'];

      console.log('[Visits] FormData parsed, file present:', !!file);

      // Extract visit data from form fields
      const formDataFields = ['client_id', 'type', 'time_in', 'time_out', 'odometer_arrival', 'odometer_departure', 'notes', 'reason', 'status', 'address', 'latitude', 'longitude'];
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
            folder: 'touchpoint_photo',
            maxSize: 10 * 1024 * 1024,
            allowedMimeTypes: allowedTypes,
          });

          console.log('[Visits] Upload result:', JSON.stringify(uploadResult, null, 2));

          if (!uploadResult.success) {
            console.error('[Visits] Photo upload failed:', uploadResult.error);
            return c.json({
              success: false,
              message: `Photo upload failed: ${uploadResult.error || 'Unknown error'}`
            }, 500);
          }

          photoUrl = uploadResult.url;
          visitData.photo_url = photoUrl;

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

    console.log('[Visits] Creating visit with data:', JSON.stringify(visitData, null, 2));
    const visit = await visitService.create(visitData);
    console.log('[Visits] Visit created successfully:', visit.id);
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

export default visits;
