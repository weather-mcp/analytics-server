// Test setup file
// Runs before all tests

import { config as dotenvConfig } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

// Load .env.test if it exists, otherwise fallback to .env
const testEnvPath = resolve(process.cwd(), '.env.test');
const defaultEnvPath = resolve(process.cwd(), '.env');

if (existsSync(testEnvPath)) {
  dotenvConfig({ path: testEnvPath });
  console.log('Loaded .env.test for testing');
} else if (existsSync(defaultEnvPath)) {
  dotenvConfig({ path: defaultEnvPath });
  console.log('Loaded .env for testing (no .env.test found)');
}

// Set NODE_ENV to test if not already set
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}

// Increase max listeners to prevent warnings during tests
// Worker tests use vi.resetModules() which creates new module instances
// Each instance adds SIGTERM/SIGINT handlers, causing MaxListeners warnings
process.setMaxListeners(20);
