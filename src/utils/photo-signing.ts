import { storageService } from '../services/storage.js';

const SIGNED_URL_EXPIRY_SECONDS = 3600;

export function extractS3Key(url: string | null | undefined): string | null {
  if (!url) return null;
  const bucket = process.env.STORAGE_BUCKET || 'imu-uploads';
  const region = process.env.AWS_REGION || 'ap-southeast-1';
  const prefix = `https://${bucket}.s3.${region}.amazonaws.com/`;
  if (url.startsWith(prefix)) return url.slice(prefix.length);
  return null;
}

async function signUrl(url: string | null | undefined): Promise<string | null | undefined> {
  if (!url || !storageService.isS3Ready()) return url;
  const key = extractS3Key(url);
  if (!key) return url;
  try {
    return await storageService.getSignedUrl(key, SIGNED_URL_EXPIRY_SECONDS);
  } catch {
    return url;
  }
}

// Parses a remarks JSON envelope produced by mobile, signs any embedded
// additional_photos URLs, and returns the re-serialised envelope. Leaves
// plain (non-JSON) remarks untouched.
async function signRemarksEnvelope(remarks: string | null | undefined): Promise<string | null | undefined> {
  if (!remarks || typeof remarks !== 'string') return remarks;
  const trimmed = remarks.trim();
  if (!trimmed.startsWith('{')) return remarks;
  let parsed: any;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return remarks;
  }
  if (!Array.isArray(parsed?.additional_photos)) return remarks;
  const signed = await Promise.all(
    parsed.additional_photos.map((u: unknown) =>
      typeof u === 'string' ? signUrl(u) : Promise.resolve(u)
    )
  );
  parsed.additional_photos = signed;
  return JSON.stringify(parsed);
}

export async function signVisitPhotoFields<T extends {
  photo_url?: string | null;
  visit_photo_url?: string | null;
  remarks?: string | null;
  visit_remarks?: string | null;
}>(item: T): Promise<T> {
  if (!item) return item;
  const next: any = { ...item };
  if ('photo_url' in next) next.photo_url = await signUrl(next.photo_url);
  if ('visit_photo_url' in next) next.visit_photo_url = await signUrl(next.visit_photo_url);
  if ('remarks' in next) next.remarks = await signRemarksEnvelope(next.remarks);
  if ('visit_remarks' in next) next.visit_remarks = await signRemarksEnvelope(next.visit_remarks);
  return next;
}

export async function signVisitPhotoFieldsAll<T extends Record<string, any>>(items: T[]): Promise<T[]> {
  return Promise.all(items.map((it) => signVisitPhotoFields(it)));
}
