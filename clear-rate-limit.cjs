require('dotenv').config();
const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL, {
  tls: { rejectUnauthorized: false }
});

async function clearRateLimit() {
  try {
    console.log('Connected to Redis');

    // Get all keys
    let cursor = '0';
    const allKeys = [];

    do {
      const result = await redis.scan(cursor, 'MATCH', '*', 'COUNT', 100);
      cursor = result[0];
      allKeys.push(...result[1]);
    } while (cursor !== '0');

    console.log(`Total keys in Redis: ${allKeys.length}`);

    // Find keys related to auth, login, or rate limit
    const relevantKeys = allKeys.filter(key =>
      key.toLowerCase().includes('auth') ||
      key.toLowerCase().includes('login') ||
      key.toLowerCase().includes('rate') ||
      key.toLowerCase().includes('limit') ||
      key.toLowerCase().includes('attempts')
    );

    console.log('Auth/rate-limit related keys:');
    relevantKeys.forEach(key => {
      console.log('  -', key);
    });

    // Delete all relevant keys
    if (relevantKeys.length > 0) {
      await redis.del(...relevantKeys);
      console.log(`Cleared ${relevantKeys.length} rate limit keys`);
    } else {
      console.log('No rate limit keys found to clear');
    }

    await redis.quit();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

clearRateLimit();
