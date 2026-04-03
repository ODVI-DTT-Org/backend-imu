import bcrypt from 'bcryptjs';

const password = 'password123';

const correctHash = '$2a$10$dfn.Sky9VTKDnPw5vqeZnO1wyb8OtrYoCwV.nf8o7rYuR/giLflMe';
const wrongHash = '$2b$10$rKZyJJ8VZjGhYXqVYqVYQuJ8VZjGhYXqVYqVYQuJ8VZjGhYXqVYqV..';

console.log('Testing password: password123\n');

console.log('1. Testing CORRECT hash:');
console.log('Hash:', correctHash);
const test1 = bcrypt.compareSync(password, correctHash);
console.log('Result:', test1 ? '✅ PASS - Password matches!' : '❌ FAIL - Password does not match');

console.log('\n2. Testing WRONG hash (from your production):');
console.log('Hash:', wrongHash);
const test2 = bcrypt.compareSync(password, wrongHash);
console.log('Result:', test2 ? '✅ PASS - Password matches!' : '❌ FAIL - Password does not match');

console.log('\n3. Generating new hash for password123:');
const newHash = bcrypt.hashSync(password, 10);
console.log('New Hash:', newHash);
const test3 = bcrypt.compareSync(password, newHash);
console.log('Verification:', test3 ? '✅ PASS' : '❌ FAIL');
