import bcrypt from 'bcryptjs';

const email = 'admin@imu.test';
const newPassword = 'password123';

// Generate new hash
const hash = bcrypt.hashSync(newPassword, 10);
console.log('Email:', email);
console.log('New Password:', newPassword);
console.log('\nNew Bcrypt Hash:');
console.log(hash);
console.log('\nSQL to update:');
console.log(`UPDATE users SET password_hash = '${hash}', updated_at = NOW() WHERE email = '${email}';`);

// Verify it works
const isValid = bcrypt.compareSync(newPassword, hash);
console.log('\nVerification test:', isValid ? '✅ PASS' : '❌ FAIL');
