const { Client } = require('pg');

const client = new Client({
  host: '127.0.0.1',
  port: 54320,
  database: 'analytics',
  user: 'analytics',
  password: 'dev_password',
  connectionTimeoutMillis: 10000,
});

client.connect((err) => {
  if (err) {
    console.error('Connection error:', err.stack);
    process.exit(1);
  }
  console.log('Connected successfully!');

  client.query('SELECT NOW()', (err, res) => {
    if (err) {
      console.error('Query error:', err.stack);
    } else {
      console.log('Query result:', res.rows[0]);
    }
    client.end();
  });
});
