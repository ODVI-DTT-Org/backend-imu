/**
 * File Storage Service - Configurable storage provider
 * Supports: Local, S3, Cloudflare R2, Supabase Storage
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

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
  private s3Client: S3Client | null = null;

  constructor() {
    this.provider = (process.env.STORAGE_PROVIDER as StorageProvider) || 'local';
    this.bucket = process.env.STORAGE_BUCKET || 'imu-uploads';
    this.baseUrl = process.env.STORAGE_BASE_URL || 'http://localhost:3000/uploads';

    console.log(`[StorageService] Provider: ${this.provider}, Bucket: ${this.bucket}`);

    // Initialize S3 client if using S3
    if (this.provider === 's3') {
      if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        this.s3Client = new S3Client({
          region: process.env.AWS_REGION || 'us-east-1',
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          },
        });
        console.log(`[StorageService] S3 client initialized: bucket=${this.bucket}, region=${process.env.AWS_REGION || 'us-east-1'}`);

        // Test S3 connection on startup
        this.checkS3Connection().then(result => {
          if (result.connected) {
            console.log(`[StorageService] ✅ S3 connection verified: ${this.bucket}`);
          } else {
            console.warn(`[StorageService] ⚠️  S3 connection failed, will fall back to local storage:`, result.details);
          }
        }).catch(err => {
          console.warn(`[StorageService] ⚠️  S3 health check error, will fall back to local storage:`, err.message);
        });
      } else {
        console.warn('[StorageService] ⚠️  S3 provider selected but AWS credentials not configured');
        console.warn('[StorageService]    Required: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY');
        console.warn('[StorageService]    Will fall back to local storage for uploads');
      }
    }

    // Ensure local upload directory exists (needed for local or fallback)
    this.ensureUploadDir();
    console.log(`[StorageService] Local storage directory ready (for fallback or local mode)`);
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
        const s3Result = await this.uploadToS3(file, key, options.mimetype);
        // If S3 fails, fall back to local storage
        if (!s3Result.success) {
          console.warn(`[StorageService] S3 upload failed, falling back to local storage:`, s3Result.error);
          return this.uploadToLocal(file, key);
        }
        return s3Result;
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
      if (!this.s3Client) {
        console.error('[StorageService] S3 upload failed: S3 client not initialized');
        return {
          success: false,
          error: 'S3 client not initialized. Ensure AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION are set.'
        };
      }

      const buffer = Buffer.isBuffer(file) ? file : Buffer.from(await (file as Blob).arrayBuffer());
      const region = process.env.AWS_REGION || 'us-east-1';

      console.log(`[StorageService] Uploading to S3: bucket=${this.bucket}, key=${key}, size=${buffer.length} bytes`);

      // Upload to S3 using AWS SDK with proper signing
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimetype,
      });

      await this.s3Client.send(command);

      const url = `https://${this.bucket}.s3.${region}.amazonaws.com/${key}`;
      console.log(`[StorageService] ✅ S3 upload successful: ${url}`);

      return {
        success: true,
        url,
        key,
      };
    } catch (error: any) {
      console.error('[StorageService] S3 upload error:', {
        name: error.name,
        message: error.message,
        bucket: this.bucket,
        region: process.env.AWS_REGION || 'us-east-1',
        key: key,
        fullError: error.toString()
      });

      // Provide specific error messages for common issues
      if (error.name === 'InvalidAccessKeyId') {
        return { success: false, error: 'Invalid AWS Access Key ID. Check AWS_ACCESS_KEY_ID.' };
      }
      if (error.name === 'SignatureDoesNotMatch') {
        return { success: false, error: 'AWS Secret Access Key is incorrect. Check AWS_SECRET_ACCESS_KEY.' };
      }
      if (error.name === 'NoSuchBucket') {
        return { success: false, error: `S3 bucket '${this.bucket}' does not exist in region ${process.env.AWS_REGION || 'us-east-1'}.` };
      }
      if (error.name === 'AccessDenied') {
        return { success: false, error: 'Access denied. Check IAM permissions for s3:PutObject on bucket ${this.bucket}.' };
      }
      if (error.name === 'UnknownError') {
        // Network error or bucket not in specified region
        return {
          success: false,
          error: `S3 connection failed. Check that bucket '${this.bucket}' exists in region ${process.env.AWS_REGION || 'us-east-1'}.`
        };
      }

      return { success: false, error: error.message || 'Failed to upload to S3' };
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
    try {
      if (!this.s3Client) {
        return { success: false, error: 'S3 client not initialized' };
      }

      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.s3Client.send(command);

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
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

  // Check S3 connection health
  async checkS3Connection(): Promise<{ connected: boolean; details?: any }> {
    if (this.provider !== 's3') {
      return { connected: false, details: { message: 'S3 not configured as storage provider' } };
    }

    if (!this.s3Client) {
      return {
        connected: false,
        details: {
          message: 'S3 client not initialized',
          reason: 'AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY not set'
        }
      };
    }

    try {
      const { HeadBucketCommand } = await import('@aws-sdk/client-s3');
      const command = new HeadBucketCommand({ Bucket: this.bucket });
      await this.s3Client.send(command);

      return {
        connected: true,
        details: {
          bucket: this.bucket,
          region: process.env.AWS_REGION || 'us-east-1',
          message: 'S3 connection successful'
        }
      };
    } catch (error: any) {
      // Provide detailed error information
      const details: any = {
        bucket: this.bucket,
        region: process.env.AWS_REGION || 'us-east-1',
        error: error.name,
        message: error.message
      };

      // Add specific guidance for common errors
      if (error.name === 'NoSuchBucket') {
        details.reason = `Bucket '${this.bucket}' does not exist in region ${process.env.AWS_REGION || 'us-east-1'}`;
        details.fix = `Create the bucket or update STORAGE_BUCKET environment variable`;
      } else if (error.name === 'InvalidAccessKeyId') {
        details.reason = 'AWS Access Key ID is invalid';
        details.fix = 'Check AWS_ACCESS_KEY_ID environment variable';
      } else if (error.name === 'SignatureDoesNotMatch') {
        details.reason = 'AWS Secret Access Key is incorrect';
        details.fix = 'Check AWS_SECRET_ACCESS_KEY environment variable';
      } else if (error.name === 'AccessDenied') {
        details.reason = 'IAM user lacks s3:ListBucket permission';
        details.fix = 'Grant s3:ListBucket and s3:PutObject permissions to IAM user';
      } else if (error.name === 'UnknownError') {
        details.reason = 'Network error or bucket not accessible';
        details.fix = 'Check bucket name, region, and network connectivity';
        details.fullError = error.toString();
      }

      return { connected: false, details };
    }
  }
}

// Export singleton instance
export const storageService = new StorageService();
