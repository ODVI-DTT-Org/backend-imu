// Bootstrap file - loads environment variables before importing main app
import { config } from 'dotenv';
import { pathToFileURL } from 'url';

// Load dotenv synchronously before any other imports
if (process.env.NODE_ENV !== 'production') {
  const result = config();
  if (result.error) {
    console.error('❌ Bootstrap: Failed to load .env file:', result.error);
    throw result.error;
  }
  console.log('✅ Bootstrap: Environment variables loaded');
}

// Now import and start the main app
await import('./index.js');
