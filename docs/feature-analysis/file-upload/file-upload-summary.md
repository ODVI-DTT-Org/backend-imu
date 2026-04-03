# File Upload Implementation Summary

## Overview

This document provides a complete summary of the file upload functionality implementation for the IMU app, including all file paths, line numbers, and integration points.

## Backend Implementation

### 1. Storage Service

**File:** `backend/src/services/storage.ts`

**Lines:** 1-358

**Key Methods:**
- `upload(options: UploadOptions): Promise<UploadResult>` - Main upload method (line 149)
- `delete(key: string): Promise<DeleteResult>` - Delete uploaded file (line 290)
- `getSignedUrl(filename: string, expiresIn?: number): Promise<string>` - Get presigned URL (line 349)

**Supported Storage Providers:**
- Local (development)
- AWS S3
- Cloudflare R2
- Supabase Storage

**File Categories:**
- `selfie` - Attendance verification (10MB max)
- `avatar` - Profile pictures (5MB max)
- `touchpoint_photo` - Visit photos (10MB max)
- `audio` - Voice recordings (25MB max)
- `document` - General documents (20MB max)
- `general` - Any file type (20MB max)

### 2. Upload Routes

**File:** `backend/src/routes/upload.ts`

**Lines:** 1-389

**Endpoints:**
- `POST /upload/file` - Main file upload endpoint (line 197)
- `POST /upload/selfie` - Legacy selfie upload (line 290)
- `POST /upload/document` - Legacy document upload (line 336)
- `GET /upload/categories` - Get allowed categories (line 183)
- `GET /upload/pending` - Get pending uploads count (line 159)
- `POST /upload` - PowerSync CRUD operations endpoint (line 60)

**Database Integration:**
- Creates file records in `files` table with metadata
- Links files to entities via `entity_type` and `entity_id`
- Stores file URL, storage key, and original filename

### 3. Main Application Router

**File:** `backend/src/index.ts`

**Lines:** 1-100+

**Upload Routes Registration:**
```typescript
import uploadRoutes from './routes/upload.js';
app.route('/api/upload', uploadRoutes);
```

## Mobile App Implementation

### 1. Upload API Service (NEW)

**File:** `mobile/imu_flutter/lib/services/api/upload_api_service.dart`

**Lines:** 1-339

**Key Methods:**
- `uploadPhoto(File file, {String? touchpointId})` - Upload photo file (line 60)
- `uploadAudio(File file, {String? touchpointId})` - Upload audio file (line 114)
- `uploadWithRetry(...)` - Upload with retry logic and progress (line 183)
- `getUploadCategories()` - Get upload categories and constraints (line 290)

**Provider:**
```dart
final uploadApiServiceProvider = Provider<UploadApiService>((ref) {
  final jwtAuth = ref.watch(jwtAuthProvider);
  return UploadApiService(authService: jwtAuth);
});
```

### 2. Touchpoint File Service (NEW)

**File:** `mobile/imu_flutter/lib/services/touchpoint/touchpoint_file_service.dart`

**Lines:** 1-180

**Key Methods:**
- `uploadPhoto(File file, String touchpointId, ...)` - Upload photo for touchpoint (line 28)
- `uploadAudio(File file, String touchpointId, ...)` - Upload audio for touchpoint (line 52)
- `uploadFiles({...})` - Upload both photo and audio (line 90)
- `uploadFilesForNewTouchpoint({...})` - Upload before touchpoint creation (line 149)

**Provider (requires Riverpod code generation):**
```dart
@riverpod
TouchpointFileService touchpointFileService(TouchpointFileServiceRef ref) {
  final uploadApi = ref.watch(uploadApiServiceProvider);
  return TouchpointFileService(uploadApi);
}
```

### 3. Touchpoint Model Updates

**File:** `mobile/imu_flutter/lib/features/clients/data/models/client_model.dart`

**Changes:**
- Added `audioPath` field to `Touchpoint` class (line 408)
- Updated `copyWith` method to include `audioPath` (line 503)
- Updated `toJson` to include `audio_path` (line 538)
- Updated `fromJson` to parse `audio_url`/`audioPath` (line 583)

### 4. Touchpoint API Service Updates

**File:** `mobile/imu_flutter/lib/services/api/touchpoint_api_service.dart`

**Changes:**
- `createTouchpoint` - Added `audio_url` to request data (line 162)
- `updateTouchpoint` - Added `audio_url` to request data (line 238)

### 5. Touchpoint Repository Updates

**File:** `mobile/imu_flutter/lib/features/touchpoints/data/repositories/touchpoint_repository.dart`

**Changes:**
- INSERT query - Added `audio_url` parameter (line 100)
- INSERT values - Uses `touchpoint.audioPath` (line 122)
- UPDATE query - Added `audio_url` parameter (line 167)
- UPDATE values - Uses `touchpoint.audioPath` (line 189)
- `_mapRowToTouchpoint` - Maps `audio_url` to `audioPath` (line 263)
- Constructor call in create method - Added `audioPath` (line 146)

### 6. PowerSync Schema

**File:** `mobile/imu_flutter/lib/services/sync/powersync_service.dart`

**Lines:** 58-76

**Touchpoints Table:**
```dart
Table('touchpoints', [
  // ... other columns
  Column.text('photo_url'),
  Column.text('audio_url'),  // Already present in schema
  // ... other columns
]),
```

## Integration Points

### Touchpoint Form Integration

**File:** `mobile/imu_flutter/lib/features/touchpoints/presentation/widgets/touchpoint_form.dart`

**Current State:**
- Form captures photo via `_cameraService.capturePhoto()`
- Photo is stored in `_capturedPhoto` as `File` object
- On submit, returns `'photoPath': _capturedPhoto?.path` (line 431)

**Recommended Integration:**

1. **Before form submission**, upload files:
```dart
// In _handleSubmit method
final fileService = ref.read(touchpointFileServiceProvider);

final urls = await fileService.uploadFilesForNewTouchpoint(
  photo: _capturedPhoto,
  audio: _capturedAudio,
);
```

2. **Include uploaded URLs** in form result:
```dart
Navigator.pop(context, {
  // ... other fields
  'photoPath': urls['photoUrl'],  // Use uploaded URL instead of local path
  'audioPath': urls['audioUrl'],
});
```

### Touchpoint Form Provider

**File:** `mobile/imu_flutter/lib/features/touchpoints/providers/touchpoint_form_provider.dart`

**Current State:**
- `TouchpointFormState` includes `audioPath` field (line 60)
- `setAudioPath` method available (line 250)

**Usage:**
```dart
ref.read(touchpointFormProvider.notifier).setAudioPath(uploadResult.audioUrl);
```

## Database Schema

### Files Table (Backend)

```sql
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  url TEXT NOT NULL,
  storage_key TEXT UNIQUE NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  entity_type TEXT,
  entity_id TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Touchpoints Table (Backend & Mobile)

**Columns:**
- `photo_url TEXT` - URL to uploaded photo
- `audio_url TEXT` - URL to uploaded audio

**Note:** PowerSync schema already includes `audio_url` column.

## Configuration

### Backend Environment Variables

```bash
# Storage Configuration
STORAGE_PROVIDER=local|s3|r2|supabase
STORAGE_BUCKET=imu-uploads
STORAGE_BASE_URL=http://localhost:3000/uploads

# AWS S3 (if using S3)
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=ap-southeast-1

# Cloudflare R2 (if using R2)
CLOUDFLARE_ACCOUNT_ID=your_account_id

# Supabase (if using Supabase)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_key
```

### Mobile Environment Variables

**File:** `mobile/imu_flutter/.env.dev` or `mobile/imu_flutter/.env.prod`

```bash
POSTGRES_API_URL=http://localhost:3000/api
```

## Usage Examples

### Example 1: Upload Photo During Touchpoint Creation

```dart
// In touchpoint form submission
final fileService = ref.read(touchpointFileServiceProvider);

// Upload files before creating touchpoint
final urls = await fileService.uploadFilesForNewTouchpoint(
  photo: _capturedPhoto,
  audio: _capturedAudio,
);

// Create touchpoint with uploaded URLs
final touchpoint = Touchpoint(
  id: uuid.v4(),
  clientId: clientId,
  // ... other fields
  photoPath: urls['photoUrl'],
  audioPath: urls['audioUrl'],
);

// Save to database
await ref.read(touchpointRepositoryProvider).createTouchpoint(touchpoint);
```

### Example 2: Upload Files for Existing Touchpoint

```dart
final fileService = ref.read(touchpointFileServiceProvider);

final result = await fileService.uploadFiles(
  photo: photoFile,
  audio: audioFile,
  touchpointId: touchpoint.id,
  onPhotoProgress: (progress) => print('Photo: $progress%'),
  onAudioProgress: (progress) => print('Audio: $progress%'),
);

if (result.success) {
  final updated = touchpoint.copyWith(
    photoPath: result.photoUrl,
    audioPath: result.audioUrl,
  );
  await ref.read(touchpointRepositoryProvider).updateTouchpoint(updated);
}
```

### Example 3: Direct Upload API Usage

```dart
final uploadService = ref.read(uploadApiServiceProvider);

// Upload with retry and progress
final result = await uploadService.uploadWithRetry(
  photoFile,
  category: 'touchpoint_photo',
  touchpointId: touchpointId,
  maxRetries: 3,
  onProgress: (progress) {
    print('Upload: $progress%');
  },
);

if (result != null) {
  print('URL: ${result.url}');
  print('File ID: ${result.fileId}');
}
```

## Testing

### Backend Testing with cURL

```bash
# Upload photo
curl -X POST http://localhost:3000/api/upload/file \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@photo.jpg" \
  -F "category=touchpoint_photo" \
  -F "entity_id=tp_123" \
  -F "entity_type=touchpoint"

# Upload audio
curl -X POST http://localhost:3000/api/upload/file \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@audio.m4a" \
  -F "category=audio" \
  -F "entity_id=tp_123" \
  -F "entity_type=touchpoint"

# Get categories
curl http://localhost:3000/api/upload/categories
```

### Mobile Testing

```dart
// Test upload service
test('Upload photo for touchpoint', () async {
  final service = UploadApiService();
  final file = File('test/fixtures/photo.jpg');

  final result = await service.uploadPhoto(
    file,
    touchpointId: 'test_tp',
  );

  expect(result, isNotNull);
  expect(result!.url, startsWith('http'));
});
```

## Error Handling

### Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `Not authenticated` | Missing/invalid JWT token | Ensure user is logged in |
| `File too large` | Exceeds category size limit | Compress file or increase limit |
| `Invalid file type` | MIME type not allowed | Check file type matches category |
| `Network error` | Connection failed | Enable retry logic (built-in) |
| `Upload failed` | Server error | Check logs, retry with exponential backoff |

## Next Steps

1. **Generate Riverpod code** for `TouchpointFileService`:
   ```bash
   cd mobile/imu_flutter
   dart run build_runner build --delete-conflicting-outputs
   ```

2. **Update touchpoint form** to upload files before submission

3. **Add progress indicators** to show upload status to users

4. **Test file uploads** on actual devices with various file sizes

5. **Configure production storage** (S3/R2/Supabase)

6. **Implement background upload** for offline scenarios

7. **Add file compression** for images before upload

## Related Documentation

- `docs/file-upload-implementation.md` - Detailed implementation guide
- `master_plan_mobile_tablet.md` - Touchpoint feature specifications
- `elephant-carpaccio-version-2.md` - Development methodology

## File Changes Summary

### New Files Created
1. `mobile/imu_flutter/lib/services/api/upload_api_service.dart` (339 lines)
2. `mobile/imu_flutter/lib/services/touchpoint/touchpoint_file_service.dart` (180 lines)
3. `docs/file-upload-implementation.md` (comprehensive guide)
4. `docs/file-upload-summary.md` (this file)

### Files Modified
1. `mobile/imu_flutter/lib/features/clients/data/models/client_model.dart`
   - Added `audioPath` field to `Touchpoint`
   - Updated `copyWith`, `toJson`, `fromJson` methods

2. `mobile/imu_flutter/lib/services/api/touchpoint_api_service.dart`
   - Added `audio_url` to create/update request data

3. `mobile/imu_flutter/lib/features/touchpoints/data/repositories/touchpoint_repository.dart`
   - Added `audioPath` to INSERT/UPDATE queries
   - Updated `_mapRowToTouchpoint` to map `audio_url`

### Backend Files (No Changes Needed)
- `backend/src/services/storage.ts` - Already supports file uploads
- `backend/src/routes/upload.ts` - Already has upload endpoints
- `backend/src/index.ts` - Already registers upload routes

## Line Numbers Reference

| File | Line Numbers | Description |
|------|-------------|-------------|
| `backend/src/routes/upload.ts` | 197-285 | POST /upload/file endpoint |
| `backend/src/routes/upload.ts` | 12-56 | File category configuration |
| `mobile/imu_flutter/lib/services/api/upload_api_service.dart` | 60-112 | uploadPhoto method |
| `mobile/imu_flutter/lib/services/api/upload_api_service.dart` | 114-170 | uploadAudio method |
| `mobile/imu_flutter/lib/services/api/upload_api_service.dart` | 183-288 | uploadWithRetry method |
| `mobile/imu_flutter/lib/services/touchpoint/touchpoint_file_service.dart` | 28-50 | Upload photo for touchpoint |
| `mobile/imu_flutter/lib/services/touchpoint/touchpoint_file_service.dart` | 52-76 | Upload audio for touchpoint |
| `mobile/imu_flutter/lib/features/clients/data/models/client_model.dart` | 408 | audioPath field declaration |
| `mobile/imu_flutter/lib/services/api/touchpoint_api_service.dart` | 162 | audio_url in create request |
| `mobile/imu_flutter/lib/services/api/touchpoint_api_service.dart` | 238 | audio_url in update request |
| `mobile/imu_flutter/lib/features/touchpoints/data/repositories/touchpoint_repository.dart` | 122 | audioPath in INSERT |
| `mobile/imu_flutter/lib/features/touchpoints/data/repositories/touchpoint_repository.dart` | 189 | audioPath in UPDATE |
