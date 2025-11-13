import { Pool } from 'pg';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'analytics',
  user: process.env.DB_USER || 'analytics',
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 10000,
  ssl: false, // Explicitly disable SSL for local development
});

async function testConnection() {
  console.log('Testing database connection...');
  console.log('Config:', {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ? '***' : 'undefined',
  });

  try {
    const result = await pool.query('SELECT NOW() as time, version() as version');
    console.log('✓ Connection successful!');
    console.log('Time:', result.rows[0].time);
    console.log('Version:', result.rows[0].version);
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('✗ Connection failed!');
    console.error('Error:', error);
    await pool.end();
    process.exit(1);
  }
}

testConnection();
