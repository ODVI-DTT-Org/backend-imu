/**
 * FormData Parser Utility
 *
 * Workaround for Hono's parseBody() bug with undici
 * Uses busboy to parse multipart/form-data requests
 */

import Busboy from 'busboy';
import { Context } from 'hono';

export interface ParsedFormData {
  [key: string]: string | File;
}

/**
 * Parse multipart/form-data request using busboy
 * This is a workaround for Hono's parseBody() bug
 */
export async function parseFormData(c: Context): Promise<ParsedFormData> {
  return new Promise(async (resolve, reject) => {
    try {
      const contentType = c.req.raw.headers.get('content-type');
      if (!contentType) {
        return reject(new Error('Missing Content-Type header'));
      }

      const fields: ParsedFormData = {};

      // Get raw body as ArrayBuffer
      const arrayBuffer = await c.req.raw.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Create busboy instance
      const busboy = Busboy({
        headers: {
          'content-type': contentType,
        },
      });

      // Handle field parsing
      busboy.on('field', (fieldname: string, value: string) => {
        fields[fieldname] = value;
      });

      // Handle file parsing
      busboy.on('file', (fieldname: string, file: any, filename: string, encoding: string, mimetype: string) => {
        const chunks: Buffer[] = [];

        file.on('data', (data: any) => {
          chunks.push(data);
        });

        file.on('end', () => {
          const fileBuffer = Buffer.concat(chunks);
          const fileObj = new File([fileBuffer], filename || 'unknown', { type: mimetype || 'application/octet-stream' });
          fields[fieldname] = fileObj;
        });
      });

      // Handle finish
      busboy.on('finish', () => {
        resolve(fields);
      });

      // Handle error
      busboy.on('error', (error) => {
        reject(error);
      });

      // Write buffer to busboy and end
      busboy.write(buffer);
      busboy.end();
    } catch (error) {
      reject(error);
    }
  });
}
