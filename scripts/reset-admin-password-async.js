import bcrypt from 'bcryptjs';

// This uses the EXACT same method as the registration code
async function generatePasswordHash(password) {
  // Same as: const password_hash = await hash(password, 10);
  return await bcrypt.hash(password, 10);
}

async function verifyPassword(password, hash) {
  // Same as: const valid = await compare(password, user.password_hash);
  return await bcrypt.compare(password, hash);
}

async function main() {
  const email = 'admin@imu.test';
  const newPassword = 'password123';

  console.log('🔑 Generating hash using SAME method as registration...');
  console.log('   Method: bcrypt.hash(password, 10)');
  console.log('   Password:', newPassword);

  const hash = await generatePasswordHash(newPassword);
  console.log('\n✅ Generated Hash:');
  console.log(hash);

  console.log('\n🔍 Verifying...');
  const isValid = await verifyPassword(newPassword, hash);
  console.log('   Verification:', isValid ? '✅ PASS' : '❌ FAIL');

  console.log('\n📝 SQL to update database:');
  console.log(`UPDATE users
SET password_hash = '${hash}',
    updated_at = NOW()
WHERE email = '${email}';`);

  console.log('\n🧪 Test with wrong password:');
  const isWrong = await verifyPassword('wrongpassword', hash);
  console.log('   Verification:', isWrong ? '❌ FAIL (should be false)' : '✅ PASS');
}

main().catch(console.error);
