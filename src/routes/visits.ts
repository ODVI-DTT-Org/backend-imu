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
    if (contentType.includes('multipart/form-data')) {
      // Parse FormData to extract file and visit data
      const body = await c.req.parseBody();
      const file = body['photo'];

      // Extract visit data from form fields
      const formDataFields = ['client_id', 'type', 'time_in', 'time_out', 'odometer_arrival', 'odometer_departure', 'notes', 'reason', 'status', 'address', 'latitude', 'longitude'];
      formDataFields.forEach(field => {
        if (body[field] !== undefined) {
          visitData[field] = body[field];
        }
      });

      // If photo file is present, upload it to S3
      if (file && file instanceof File) {
        try {
          // Validate file type
          const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
          if (!allowedTypes.includes(file.type)) {
            throw new ValidationError('Invalid photo type. Only JPEG, PNG, and WebP are allowed');
          }

          // Validate file size (max 10MB)
          if (file.size > 10 * 1024 * 1024) {
            throw new ValidationError('Photo too large. Maximum size is 10MB');
          }

          // Convert File to Buffer for storage service
          const arrayBuffer = await file.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          // Upload photo to S3 using storage service
          const uploadResult = await storageService.upload({
            file: buffer,
            filename: file.name,
            mimetype: file.type,
            folder: 'touchpoint_photo',
            maxSize: 10 * 1024 * 1024,
            allowedMimeTypes: allowedTypes,
          });

          if (!uploadResult.success) {
            console.error('Photo upload failed:', uploadResult.error);
            throw new ValidationError(`Photo upload failed: ${uploadResult.error || 'Unknown error'}`);
          }

          photoUrl = uploadResult.url;
          visitData.photo_url = photoUrl;

          console.log('Photo uploaded successfully:', photoUrl);
        } catch (uploadError: any) {
          console.error('Photo upload error:', uploadError);
          throw new ValidationError(`Photo upload failed: ${uploadError.message}`);
        }
      }
    } else {
      // Regular JSON request
      const data = await c.req.json();
      visitData = { ...visitData, ...data };
    }

    const visit = await visitService.create(visitData);
    return c.json(visit, 201);
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
