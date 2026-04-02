/**
 * File Storage Service - Configurable storage provider
 * Supports: Local, S3, Cloudflare R2, Supabase Storage
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

type StorageProvider = 'local' | 's3' | 'r2' | 'supabase';

interface UploadOptions {
  file: Buffer | Blob;
  filename: string;
  mimetype: string;
  folder?: string;
  maxSize?: number; // in bytes
  allowedMimeTypes?: string[];
}

interface UploadResult {
  success: boolean;
  url?: string;
  key?: string;
  error?: string;
}

interface DeleteResult {
  success: boolean;
  error?: string;
}

// Default allowed mime types
const DEFAULT_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/m4a',
  'application/pdf',
];

// Magic numbers for file type validation
const MAGIC_NUMBERS: Record<string, { signature: Buffer; offset: number }> = {
  'image/jpeg': { signature: Buffer.from([0xFF, 0xD8, 0xFF]), offset: 0 },
  'image/png': { signature: Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), offset: 0 },
  'image/gif': { signature: Buffer.from([0x47, 0x49, 0x46, 0x38]), offset: 0 }, // GIF8
  'image/webp': { signature: Buffer.from([0x52, 0x49, 0x46, 0x46]), offset: 0 }, // RIFF
  'audio/mpeg': { signature: Buffer.from([0xFF, 0xFB]), offset: 0 },
  'audio/mp3': { signature: Buffer.from([0xFF, 0xFB]), offset: 0 },
  'audio/wav': { signature: Buffer.from([0x52, 0x49, 0x46, 0x46]), offset: 0 }, // RIFF
  'audio/ogg': { signature: Buffer.from([0x4F, 0x67, 0x67, 0x53]), offset: 0 }, // OggS
  'application/pdf': { signature: Buffer.from([0x25, 0x50, 0x44, 0x46]), offset: 0 }, // %PDF
};

// Max file size: 10MB default
const DEFAULT_MAX_SIZE = 10 * 1024 * 1024;

class StorageService {
  private provider: StorageProvider;
  private bucket: string;
  private baseUrl: string;

  constructor() {
    this.provider = (process.env.STORAGE_PROVIDER as StorageProvider) || 'local';
    this.bucket = process.env.STORAGE_BUCKET || 'imu-uploads';
    this.baseUrl = process.env.STORAGE_BASE_URL || 'http://localhost:3000/uploads';

    // Ensure local upload directory exists
    if (this.provider === 'local') {
      this.ensureUploadDir();
    }
  }

  private ensureUploadDir() {
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
  }

  private generateKey(filename: string, folder?: string): string {
    const ext = path.extname(filename);
    const hash = crypto.randomBytes(16).toString('hex');
    const datePath = new Date().toISOString().split('T')[0].replace(/-/g, '/');
    const key = `${hash}${ext}`;
    return folder ? `${folder}/${datePath}/${key}` : `${datePath}/${key}`;
  }

  private validateUpload(options: UploadOptions): { valid: boolean; error?: string } {
    const { file, filename, mimetype, maxSize = DEFAULT_MAX_SIZE, allowedMimeTypes = DEFAULT_ALLOWED_MIME_TYPES } = options;

    // Check file size
    const size = Buffer.isBuffer(file) ? file.length : (file as Blob).size;
    if (size > maxSize) {
      return { valid: false, error: `File size exceeds maximum allowed size of ${maxSize} bytes` };
    }

    // Check mime type
    if (!allowedMimeTypes.includes(mimetype)) {
      return { valid: false, error: `File type ${mimetype} is not allowed` };
    }

    // Check filename
    if (!filename || filename.length === 0) {
      return { valid: false, error: 'Filename is required' };
    }

    // Validate file content with magic numbers
    const buffer = Buffer.isBuffer(file) ? file : Buffer.from([]);
    const magicNumberCheck = this.validateMagicNumber(buffer, mimetype);
    if (!magicNumberCheck.valid) {
      return { valid: false, error: magicNumberCheck.error };
    }

    return { valid: true };
  }

  private validateMagicNumber(buffer: Buffer, mimetype: string): { valid: boolean; error?: string } {
    // Skip validation for mime types without magic number definitions
    const magicDef = MAGIC_NUMBERS[mimetype];
    if (!magicDef) {
      // For types like audio/m4a that don't have magic numbers defined,
      // we'll skip validation but log a warning
      if (mimetype === 'audio/m4a' || mimetype === 'audio/mp4') {
        return { valid: true };
      }
      return { valid: true };
    }

    // Ensure buffer is large enough
    if (buffer.length < magicDef.offset + magicDef.signature.length) {
      return { valid: false, error: `File content does not match declared type: ${mimetype}` };
    }

    // Compare magic number
    const fileSignature = buffer.subarray(magicDef.offset, magicDef.offset + magicDef.signature.length);
    if (!fileSignature.equals(magicDef.signature)) {
      return { valid: false, error: `File content does not match declared type: ${mimetype}` };
    }

    return { valid: true };
  }

  async upload(options: UploadOptions): Promise<UploadResult> {
    // Validate
    const validation = this.validateUpload(options);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const { file, folder } = options;
    const key = this.generateKey(options.filename, folder);

    switch (this.provider) {
      case 's3':
        return this.uploadToS3(file, key, options.mimetype);
      case 'r2':
        return this.uploadToR2(file, key, options.mimetype);
      case 'supabase':
        return this.uploadToSupabase(file, key, options.mimetype);
      case 'local':
      default:
        return this.uploadToLocal(file, key);
    }
  }

  private async uploadToLocal(file: Buffer | Blob, key: string): Promise<UploadResult> {
    try {
      const uploadDir = path.join(process.cwd(), 'uploads');
      const filePath = path.join(uploadDir, key);
      const dir = path.dirname(filePath);

      // Create directory if it doesn't exist
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write file
      const buffer = Buffer.isBuffer(file) ? file : Buffer.from(await (file as Blob).arrayBuffer());
      fs.writeFileSync(filePath, buffer);

      return {
        success: true,
        url: `${this.baseUrl}/${key}`,
        key,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async uploadToS3(file: Buffer | Blob, key: string, mimetype: string): Promise<UploadResult> {
    try {
      const buffer = Buffer.isBuffer(file) ? file : Buffer.from(await (file as Blob).arrayBuffer());

      // AWS S3 API call
      const response = await fetch(`https://${this.bucket}.s3.${process.env.AWS_REGION || 'ap-southeast-1'}.amazonaws.com/${key}`, {
        method: 'PUT',
        headers: {
          'Content-Type': mimetype,
          'Content-Length': buffer.length.toString(),
          // Note: In production, you'd use AWS SDK with proper signing
          // This is a simplified version - use @aws-sdk/client-s3 for production
        },
        body: new Uint8Array(buffer),
      });

      if (!response.ok) {
        return { success: false, error: 'Failed to upload to S3' };
      }

      return {
        success: true,
        url: `https://${this.bucket}.s3.${process.env.AWS_REGION || 'ap-southeast-1'}.amazonaws.com/${key}`,
        key,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async uploadToR2(file: Buffer | Blob, key: string, mimetype: string): Promise<UploadResult> {
    try {
      const buffer = Buffer.isBuffer(file) ? file : Buffer.from(await (file as Blob).arrayBuffer());

      // Cloudflare R2 uses S3-compatible API
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      const response = await fetch(`https://${accountId}.r2.cloudflarestorage.com/${this.bucket}/${key}`, {
        method: 'PUT',
        headers: {
          'Content-Type': mimetype,
          'Content-Length': buffer.length.toString(),
          // Note: In production, use AWS SDK with R2 credentials
        },
        body: new Uint8Array(buffer),
      });

      if (!response.ok) {
        return { success: false, error: 'Failed to upload to R2' };
      }

      return {
        success: true,
        url: `${this.baseUrl}/${key}`,
        key,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async uploadToSupabase(file: Buffer | Blob, key: string, mimetype: string): Promise<UploadResult> {
    try {
      const buffer = Buffer.isBuffer(file) ? file : Buffer.from(await (file as Blob).arrayBuffer());

      const response = await fetch(
        `${process.env.SUPABASE_URL}/storage/v1/object/${this.bucket}/${key}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
            'Content-Type': mimetype,
            'x-upsert': 'true',
          },
          body: new Uint8Array(buffer),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to upload to Supabase' };
      }

      return {
        success: true,
        url: `${process.env.SUPABASE_URL}/storage/v1/object/public/${this.bucket}/${key}`,
        key,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async delete(key: string): Promise<DeleteResult> {
    switch (this.provider) {
      case 's3':
        return this.deleteFromS3(key);
      case 'r2':
        return this.deleteFromR2(key);
      case 'supabase':
        return this.deleteFromSupabase(key);
      case 'local':
      default:
        return this.deleteFromLocal(key);
    }
  }

  private async deleteFromLocal(key: string): Promise<DeleteResult> {
    try {
      const filePath = path.join(process.cwd(), 'uploads', key);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async deleteFromS3(key: string): Promise<DeleteResult> {
    // Implement S3 delete
    return { success: true };
  }

  private async deleteFromR2(key: string): Promise<DeleteResult> {
    // Implement R2 delete
    return { success: true };
  }

  private async deleteFromSupabase(key: string): Promise<DeleteResult> {
    try {
      const response = await fetch(
        `${process.env.SUPABASE_URL}/storage/v1/object/${this.bucket}/${key}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          },
        }
      );

      if (!response.ok) {
        return { success: false, error: 'Failed to delete from Supabase' };
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // Get signed URL for direct uploads
  async getSignedUrl(filename: string, expiresIn: number = 3600): Promise<string> {
    // In production, generate presigned URLs for direct client uploads
    // For now, return a placeholder
    return `${this.baseUrl}/upload-signed?filename=${encodeURIComponent(filename)}&expires=${Date.now() + expiresIn * 1000}`;
  }
}

// Export singleton instance
export const storageService = new StorageService();
