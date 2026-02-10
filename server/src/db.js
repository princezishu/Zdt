// backend/db.js
const { Pool } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

// Check if env variables are loaded
['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME', 'DB_PORT'].forEach(key => {
  if (!process.env[key]) {
    console.error(`❌ Missing env variable: ${key}`);
  }
});

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT),
});

pool.connect()
  .then(client => {
    console.log('✅ Connected to PostgreSQL database');
    client.release();
  })
  .catch(err => {
    console.error('❌ PostgreSQL connection error:', err.message);
    process.exit(1); // stops the app if DB connection fails
  });

module.exports = pool;
