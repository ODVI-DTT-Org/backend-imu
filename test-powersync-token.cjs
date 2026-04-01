const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
require('dotenv/config');

const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);

// Load PowerSync private key
const privateKeyPath = path.join(__dirname, 'powersync-private-key.pem');
let privateKey;

try {
  privateKey = fs.readFileSync(privateKeyPath, 'utf-8');
  console.log('✅ PowerSync private key loaded');
} catch (error) {
  console.error('❌ Failed to load PowerSync private key:', error);
  process.exit(1);
}

// Test user IDs from database
const testUserIds = [
  '318b5407-1ecf-4623-b9f2-4914383d6424', // caravan1
  '6993709d-e2c3-4049-b2c8-2b4ccdf80806', // caravan2
  '895b05e7-a9a0-495b-a2b5-3f5aa0b3ea34', // field_agent with clients
];

console.log('\n=== GENERATING TEST POWERSYNC TOKENS ===\n');

testUserIds.forEach((userId, index) => {
  const token = jwt.sign(
    {
      sub: userId,
      aud: 'https://69ba260fe44c66e817793c98.powersync.journeyapps.com',
      email: `test${index + 1}@imu.com`,
      first_name: 'Test',
      last_name: `User${index + 1}`,
      role: 'caravan',
    },
    privateKey,
    {
      algorithm: 'RS256',
      keyid: 'imu-production-key-20260326',
      expiresIn: '24h',
    }
  );

  console.log(`User ${index + 1} (${userId}):`);
  console.log(token);
  console.log('');
});

// Decode a sample token to verify
const sampleToken = jwt.sign(
  {
    sub: testUserIds[0],
    aud: 'https://69ba260fe44c66e817793c98.powersync.journeyapps.com',
    email: 'caravan1@test.com',
    first_name: 'Caravan',
    last_name: 'User 1',
    role: 'caravan',
  },
  privateKey,
  {
    algorithm: 'RS256',
    keyid: 'imu-production-key-20260326',
    expiresIn: '24h',
  }
);

console.log('\n=== DECODED SAMPLE TOKEN ===');
const decoded = jwt.decode(sampleToken, { complete: true });
console.log(JSON.stringify(decoded, null, 2));

console.log('\n=== AUTH.USER_ID() VALUE ===');
console.log('auth.user_id() will return:', decoded.payload.sub);
