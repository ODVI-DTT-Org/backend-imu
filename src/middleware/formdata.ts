/**
 * FormData Parsing Middleware
 *
 * Workaround for Hono's parseBody() bug with undici
 * Intercepts multipart/form-data requests early and parses with busboy
 */

import { Context, Next } from 'hono';
import Busboy from 'busboy';

export interface ParsedFormData {
  [key: string]: string | File;
}

/**
 * Middleware to parse multipart/form-data requests using busboy
 * This must be placed BEFORE auth middleware to intercept the body early
 */
export async function formDataMiddleware(c: Context, next: Next) {
  // Check for multipart/form-data (case-insensitive)
  const contentType = c.req.raw.headers.get('content-type') || c.req.header('content-type');

  console.log('[FormData Middleware] Checking request, Content-Type:', contentType);

  // Only process multipart/form-data requests
  if (contentType && contentType.toLowerCase().includes('multipart/form-data')) {
    console.log('[FormData Middleware] Processing multipart/form-data request');

    try {
      const arrayBuffer = await c.req.raw.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      console.log('[FormData Middleware] Body size:', buffer.length, 'bytes');

      const fields: ParsedFormData = {};

      await new Promise<void>((resolve, reject) => {
        const busboy = Busboy({
          headers: {
            'content-type': contentType,
          },
        });

        busboy.on('field', (fieldname: string, value: string) => {
          console.log('[FormData Middleware] Field:', fieldname, '=', value);
          fields[fieldname] = value;
        });

        // busboy v1.x API: (name, stream, info) where info = { filename, encoding, mimeType }
        busboy.on('file', (fieldname: string, stream: any, info: { filename: string; encoding: string; mimeType: string }) => {
          const { filename, mimeType } = info;
          console.log('[FormData Middleware] File:', fieldname, 'filename:', filename, 'mimetype:', mimeType);
          const chunks: Buffer[] = [];

          stream.on('data', (data: any) => {
            chunks.push(data);
          });

          stream.on('end', () => {
            const fileBuffer = Buffer.concat(chunks);
            console.log('[FormData Middleware] File size:', fileBuffer.length, 'bytes');
            const fileObj = new File([fileBuffer], filename || 'unknown', { type: mimeType || 'application/octet-stream' });
            fields[fieldname] = fileObj;
            console.log('[FormData Middleware] File object created:', filename);
          });
        });

        busboy.on('finish', () => {
          console.log('[FormData Middleware] Busboy finished, fields:', Object.keys(fields));
          resolve();
        });

        busboy.on('error', (error) => {
          console.error('[FormData Middleware] Busboy error:', error);
          reject(error);
        });

        busboy.write(buffer);
        busboy.end();
      });

      // Store parsed data in context
      c.set('parsedFormData' as any, fields);
      console.log('[FormData Middleware] Stored parsedFormData in context with', Object.keys(fields).length, 'fields');
    } catch (error: unknown) {
      console.error('[FormData Middleware] Error parsing FormData:', error);
      // Don't throw - let the route handle it
    }
  } else {
    console.log('[FormData Middleware] Skipping non-FormData request');
  }

  await next();
}
