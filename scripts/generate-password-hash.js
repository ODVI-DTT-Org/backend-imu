import bcrypt from 'bcryptjs';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Enter new password: ', (password) => {
  const hash = bcrypt.hashSync(password, 10);
  console.log('\nBCrypt hash:');
  console.log(hash);
  console.log('\nSQL to update user:');
  console.log(`UPDATE users SET password_hash = '${hash}', updated_at = NOW() WHERE email = 'admin@imu.text';`);
  rl.close();
});
