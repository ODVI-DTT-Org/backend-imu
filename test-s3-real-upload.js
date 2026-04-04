import 'dotenv/config';
import { storageService } from './src/services/storage.js';

async function testS3Upload() {
  console.log('=== S3 Upload Test ===');
  console.log('Provider:', process.env.STORAGE_PROVIDER);
  console.log('Bucket:', process.env.STORAGE_BUCKET);
  console.log('Region:', process.env.AWS_REGION);

  // Create a minimal JPEG file
  const jpegMagicNumber = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00]);
  const testFile = Buffer.concat([jpegMagicNumber, Buffer.from('Test photo content')]);

  console.log('\nUploading test photo...');
  const result = await storageService.upload({
    file: testFile,
    filename: 'test-photo.jpg',
    mimetype: 'image/jpeg',
    folder: 'touchpoint_photo',
  });

  console.log('\n--- Result ---');
  console.log('Success:', result.success);
  console.log('URL:', result.url);
  console.log('Key:', result.key);
  
  if (result.success) {
    console.log('\n✅ S3 Upload Successful!');
    console.log('Photo URL:', result.url);
  } else {
    console.log('\n❌ S3 Upload Failed!');
    console.log('Error:', result.error);
  }
}

testS3Upload().catch(console.error);
