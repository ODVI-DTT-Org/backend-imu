# File Upload Implementation Guide

This document provides a comprehensive guide for implementing file upload functionality for the IMU app.

## Overview

The IMU app now supports file uploads for touchpoints, including:
- **Photo uploads** for visit evidence (JPEG, PNG, WebP up to 10MB)
- **Audio uploads** for voice notes (MP3, WAV, M4A up to 25MB)

## Architecture

### Backend Components

#### 1. Storage Service (`backend/src/services/storage.ts`)

The storage service provides a unified interface for uploading files to multiple storage providers:
- **Local storage** (development)
- **AWS S3**
- **Cloudflare R2** (S3-compatible)
- **Supabase Storage**

**Key Features:**
- File type validation using magic numbers
- File size limits
- Automatic filename generation with timestamps
- Folder organization by category and date

**Configuration (Environment Variables):**
```bash
STORAGE_PROVIDER=local|s3|r2|supabase
STORAGE_BUCKET=imu-uploads
STORAGE_BASE_URL=http://localhost:3000/uploads
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=ap-southeast-1
CLOUDFLARE_ACCOUNT_ID=your_account_id
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_key
```

#### 2. Upload Routes (`backend/src/routes/upload.ts`)

**POST `/api/upload/file`** - Main file upload endpoint

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Authentication: Bearer token (JWT)

**Form Data:**
- `file`: The file to upload (required)
- `category`: File category (required)
  - `selfie` - Attendance verification photos
  - `avatar` - Profile pictures
  - `touchpoint_photo` - Visit photos
  - `audio` - Voice recordings
  - `document` - General documents
  - `general` - Any file type
- `entity_id`: Optional entity ID to link file to (e.g., touchpoint ID)
- `entity_type`: Optional entity type (e.g., 'touchpoint')

**Response (Success):**
```json
{
  "message": "File uploaded successfully",
  "url": "https://storage.example.com/touchpoint_photo/2024/01/15/abc123.jpg",
  "key": "touchpoint_photo/2024/01/15/abc123.jpg",
  "filename": "abc123.jpg",
  "category": "touchpoint_photo",
  "original_name": "photo.jpg",
  "size": 1234567,
  "type": "image/jpeg",
  "entity_id": "touchpoint_123",
  "file_id": "file_456"
}
```

**GET `/api/upload/categories`** - Get allowed file categories

**Response:**
```json
{
  "categories": [
    {
      "name": "touchpoint_photo",
      "description": "Visit/touchpoint photo",
      "allowed_types": ["image/jpeg", "image/png", "image/webp"],
      "max_size": 10485760,
      "max_size_formatted": "10MB"
    },
    {
      "name": "audio",
      "description": "Voice recording",
      "allowed_types": ["audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav", "audio/webm"],
      "max_size": 26214400,
      "max_size_formatted": "25MB"
    }
  ]
}
```

### Mobile App Components

#### 1. Upload API Service (`mobile/imu_flutter/lib/services/api/upload_api_service.dart`)

The `UploadApiService` class provides methods for uploading files to the backend.

**Usage Example:**
```dart
// Get the service instance
final uploadService = ref.read(uploadApiServiceProvider);

// Upload a photo
final photo = File('/path/to/photo.jpg');
final result = await uploadService.uploadPhoto(photo, touchpointId: 'tp_123');

if (result != null) {
  print('Photo URL: ${result.url}');
  print('File ID: ${result.fileId}');
} else {
  print('Upload failed');
}

// Upload an audio file
final audio = File('/path/to/audio.m4a');
final audioResult = await uploadService.uploadAudio(audio, touchpointId: 'tp_123');

// Upload with retry and progress tracking
final result = await uploadService.uploadWithRetry(
  photo,
  category: 'touchpoint_photo',
  touchpointId: 'tp_123',
  maxRetries: 3,
  onProgress: (progress) {
    print('Upload progress: $progress%');
  },
);
```

#### 2. Touchpoint File Service (`mobile/imu_flutter/lib/services/touchpoint/touchpoint_file_service.dart`)

The `TouchpointFileService` provides a higher-level interface for managing touchpoint file uploads.

**Usage Example:**
```dart
// Get the service instance
final fileService = ref.read(touchpointFileServiceProvider);

// Upload both photo and audio for a touchpoint
final result = await fileService.uploadFiles(
  photo: photoFile,
  audio: audioFile,
  touchpointId: 'tp_123',
  onPhotoProgress: (progress) => print('Photo: $progress%'),
  onAudioProgress: (progress) => print('Audio: $progress%'),
);

if (result.success) {
  print('Photo URL: ${result.photoUrl}');
  print('Audio URL: ${result.audioUrl}');
}

// Upload files for a new touchpoint (before touchpoint is created)
final urls = await fileService.uploadFilesForNewTouchpoint(
  photo: photoFile,
  audio: audioFile,
);

// Later, when creating the touchpoint:
final touchpoint = Touchpoint(
  // ... other fields
  photoPath: urls['photoUrl'],
  audioPath: urls['audioUrl'],
);
```

#### 3. Touchpoint Model Updates

The `Touchpoint` model now includes an `audioPath` field:

```dart
class Touchpoint {
  // ... existing fields
  final String? photoPath;
  final String? audioPath;  // NEW
  // ... other fields
}
```

## Integration Guide

### Scenario 1: Upload Files During Touchpoint Creation

**Step 1: User captures photo/audio in the form**

The touchpoint form already captures photos using the camera service. The captured photo is stored in `_capturedPhoto` as a `File` object.

**Step 2: Upload files before creating touchpoint**

```dart
// In the touchpoint form submission handler
Future<void> _handleSubmit() async {
  if (!_formKey.currentState!.validate()) return;

  // Show loading indicator
  setState(() => _isUploading = true);

  try {
    // Upload files first (before creating touchpoint)
    final fileService = ref.read(touchpointFileServiceProvider);

    final urls = await fileService.uploadFilesForNewTouchpoint(
      photo: _capturedPhoto,
      audio: _capturedAudio,
    );

    // Now create the touchpoint with the uploaded URLs
    Navigator.pop(context, {
      'reason': _selectedReason,
      'photoPath': urls['photoUrl'],  // Use uploaded URL
      'audioPath': urls['audioUrl'],  // Use uploaded URL
      // ... other fields
    });
  } catch (e) {
    // Handle upload error
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Upload failed: $e')),
    );
  } finally {
    setState(() => _isUploading = false);
  }
}
```

### Scenario 2: Upload Files After Touchpoint Creation

If you need to upload files after the touchpoint has been created:

```dart
// Upload files for existing touchpoint
final fileService = ref.read(touchpointFileServiceProvider);

final result = await fileService.uploadFiles(
  photo: photoFile,
  audio: audioFile,
  touchpointId: touchpoint.id,
  onPhotoProgress: (progress) {
    // Update UI with progress
  },
);

if (result.success) {
  // Update touchpoint with new URLs
  final updatedTouchpoint = touchpoint.copyWith(
    photoPath: result.photoUrl,
    audioPath: result.audioUrl,
  );

  // Save to database
  await ref.read(touchpointRepositoryProvider).updateTouchpoint(updatedTouchpoint);
}
```

### Scenario 3: Retry Failed Uploads

The upload service includes automatic retry logic with exponential backoff:

```dart
final uploadService = ref.read(uploadApiServiceProvider);

// Upload with 3 retries (default)
final result = await uploadService.uploadWithRetry(
  file,
  category: 'touchpoint_photo',
  touchpointId: touchpointId,
  maxRetries: 3,
);

// Custom retry count
final result = await uploadService.uploadWithRetry(
  file,
  category: 'audio',
  touchpointId: touchpointId,
  maxRetries: 5,  // Try up to 5 times
);
```

## Error Handling

### Network Errors

The upload service throws `ApiException` for network errors:

```dart
try {
  final result = await uploadService.uploadPhoto(file);
} on ApiException catch (e) {
  print('Upload failed: ${e.message}');
  // Show error to user
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text(e.message)),
  );
}
```

### File Validation Errors

The backend validates files before upload:

- **File size exceeds limit:** `413 Payload Too Large`
- **Invalid file type:** `400 Bad Request` with error message
- **Missing file:** `400 Bad Request`

### Progress Tracking

Track upload progress to show feedback to users:

```dart
final result = await uploadService.uploadWithRetry(
  file,
  category: 'touchpoint_photo',
  touchpointId: touchpointId,
  onProgress: (progress) {
    // Update progress indicator
    setState(() => _uploadProgress = progress);
  },
);
```

## Testing

### Backend Testing

Test the upload endpoint using curl:

```bash
# Upload a photo
curl -X POST http://localhost:3000/api/upload/file \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@/path/to/photo.jpg" \
  -F "category=touchpoint_photo" \
  -F "entity_id=tp_123" \
  -F "entity_type=touchpoint"

# Upload an audio file
curl -X POST http://localhost:3000/api/upload/file \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@/path/to/audio.m4a" \
  -F "category=audio" \
  -F "entity_id=tp_123" \
  -F "entity_type=touchpoint"
```

### Mobile Testing

Test the upload service in the mobile app:

```dart
// Test photo upload
testWidgets('Upload photo for touchpoint', (tester) async {
  final uploadService = tester.widget<UploadApiService>(
    find.byType(UploadApiService),
  );

  final file = File('test/fixtures/photo.jpg');
  final result = await uploadService.uploadPhoto(
    file,
    touchpointId: 'test_tp_123',
  );

  expect(result, isNotNull);
  expect(result!.url, startsWith('http'));
});
```

## Database Schema

### Files Table

The backend stores file metadata in the `files` table:

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

### Touchpoints Table

The `touchpoints` table has columns for file URLs:

```sql
ALTER TABLE touchpoints ADD COLUMN photo_url TEXT;
ALTER TABLE touchpoints ADD COLUMN audio_url TEXT;
```

## Security Considerations

1. **Authentication:** All upload endpoints require JWT authentication
2. **File Type Validation:** Magic number validation prevents file type spoofing
3. **File Size Limits:** Prevents DoS attacks via large file uploads
4. **Storage Isolation:** Files are organized by user and category
5. **URL Signing:** In production, use signed URLs with expiration

## Performance Optimization

1. **Compression:** Compress images before upload
2. **Thumbnails:** Generate thumbnails for large images
3. **Chunked Upload:** For large files, use chunked upload with resumption
4. **Background Upload:** Use background tasks for uploads when app is minimized

## Troubleshooting

### Common Issues

**Issue:** Upload fails with "Not authenticated"
**Solution:** Ensure JWT token is valid and not expired

**Issue:** File size exceeds limit
**Solution:** Compress file before upload or increase backend limit

**Issue:** Invalid file type
**Solution:** Check file MIME type matches allowed types for category

**Issue:** Upload progress not updating
**Solution:** Ensure `onSendProgress` callback is properly configured

### Debug Logging

Enable debug logging for upload operations:

```dart
// In upload_api_service.dart
debugPrint('UploadApiService: Uploading file...');
debugPrint('UploadApiService: Progress: $progress%');
debugPrint('UploadApiService: Upload successful: $result');
```

## Future Enhancements

1. **Batch Upload:** Upload multiple files in a single request
2. **Resumable Upload:** Support for resuming interrupted uploads
3. **Background Sync:** Upload files in background when network is available
4. **Caching:** Cache uploaded files locally for offline access
5. **Video Support:** Add support for video file uploads
