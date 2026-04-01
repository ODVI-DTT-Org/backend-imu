// Test if JWT has iss claim
const jwt = require('jsonwebtoken');
const fs = require('fs');

const privateKey = fs.readFileSync('./powersync-private-key.pem', 'utf8');

const testToken = jwt.sign({
    sub: 'test-user-id',
    iss: 'imu-backend',
    aud: 'https://69cb46b4f69619e9d4830ea1.powersync.journeyapps.com',
    email: 'test@example.com'
}, privateKey, {
    algorithm: 'RS256',
    keyid: 'imu-production-key-20260401'
});

console.log('Test token:', testToken);
console.log('\nDecoded:', JSON.stringify(jwt.decode(testToken), null, 2));
