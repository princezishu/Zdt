import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import { pingDb } from './db.js';

dotenv.config();

const app = express();

const {
  PORT = 4000,
  CORS_ORIGIN = 'http://localhost:5173',
} = process.env;

app.use(
  cors({
    origin: CORS_ORIGIN.split(',').map((origin) => origin.trim()),
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));

app.get('/health', async (req, res) => {
  try {
    await pingDb();
    return res.json({ ok: true });
  } catch (error) {
    return res.status(503).json({ ok: false });
  }
});

app.use('/auth', authRoutes);

app.use((err, req, res, next) => {
  if (err?.name === 'ZodError') {
    return res.status(400).json({
      error: 'Invalid request',
      details: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  console.error(err);
  return res.status(500).json({ error: 'Server error' });
});

app.listen(Number(PORT), () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
