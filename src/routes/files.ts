import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { pool } from '../db/index.js';
import { storageService } from '../services/storage.js';
import { cacheService } from '../services/cache.js';

const files = new Hono();

// Cache duration: 5 minutes (300 seconds)
const URL_CACHE_TTL = 300;

/**
 * GET /api/files/:id/url - Get presigned URL for a file
 *
 * Generates presigned S3 URLs for secure file access
 * Caches URLs for 5 minutes to reduce S3 API calls
 *
 * Query Parameters:
 * - id: File UUID from database
 *
 * Response:
 * {
 *   url: string (presigned URL)
 *   cached: boolean (true if from cache, false if newly generated)
 *   expiresAt: string (ISO datetime when URL expires)
 * }
 *
 * Error Responses:
 * - 404: File not found
 * - 500: Failed to generate file URL
 */
files.get('/files/:id/url', authMiddleware, async (c) => {
  const fileId = c.req.param('id');

  try {
    // Check cache first
    const cacheKey = `file:url:${fileId}`;
    const cachedUrl = await cacheService.get(cacheKey);

    if (cachedUrl) {
      console.log(`[Files] ✅ Cache HIT for file ${fileId}`);
      return c.json({
        url: cachedUrl,
        cached: true,
        expiresAt: new Date(Date.now() + URL_CACHE_TTL * 1000).toISOString(),
      });
    }

    console.log(`[Files] ❌ Cache MISS for file ${fileId}, generating...`);

    // Fetch file metadata from database
    const result = await pool.query(
      'SELECT storage_key, mime_type, created_at FROM files WHERE id = $1',
      [fileId]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'File not found' }, 404);
    }

    const file = result.rows[0];

    // Check if storage provider is S3
    if (storageService.getProvider() !== 's3') {
      return c.json({
        error: 'Presigned URLs only supported for S3 storage',
        storageProvider: storageService.getProvider(),
      }, 400);
    }

    // Generate presigned URL (5 minute expiry)
    const signedUrl = await storageService.getSignedUrl(
      file.storage_key,
      URL_CACHE_TTL
    );

    // Cache the URL
    await cacheService.set(cacheKey, signedUrl, URL_CACHE_TTL);

    console.log(`[Files] ✅ Generated presigned URL for file ${fileId}, cached for ${URL_CACHE_TTL}s`);

    return c.json({
      url: signedUrl,
      cached: false,
      expiresAt: new Date(Date.now() + URL_CACHE_TTL * 1000).toISOString(),
      storageKey: file.storage_key,
      mimeType: file.mime_type,
    });
  } catch (error) {
    console.error('[Files] Error generating URL:', error);

    // Check if it's a database error
    if (error instanceof Object && 'code' in error) {
      const dbError = error as { code: string; message: string };
      console.error('[Files] Database error:', dbError.code, dbError.message);
    }

    return c.json({ error: 'Failed to generate file URL' }, 500);
  }
});

/**
 * GET /api/files/cache/stats - Get cache statistics (for debugging/monitoring)
 *
 * Requires admin permission
 *
 * Response:
 * {
 *   redisConnected: boolean,
 *   cacheEnabled: boolean
 * }
 */
files.get('/cache/stats', authMiddleware, requirePermission('system', 'read'), async (c) => {
  const redisReady = cacheService.isReady();

  return c.json({
    redisConnected: redisReady,
    cacheEnabled: redisReady,
    cacheTtl: URL_CACHE_TTL,
  });
});

export default files;
