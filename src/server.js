const express    = require('express');
const cookieParser = require('cookie-parser');
const path       = require('path');
const { initDB } = require('./db');

const authRoutes      = require('./routes/auth');
const projectRoutes   = require('./routes/projects');
const taskRoutes      = require('./routes/tasks');
const userRoutes      = require('./routes/users');
const dashboardRoutes = require('./routes/dashboard');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));

// ── API Routes ────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/projects',  projectRoutes);
app.use('/api/tasks',     taskRoutes);
app.use('/api/users',     userRoutes);
app.use('/api/dashboard', dashboardRoutes);

// ── Health check (Railway uses this to verify the app is up) ─────
app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

// ── SPA fallback ──────────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── Global error handler ──────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err.stack || err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Boot: init DB first (async), then listen ─────────────────────
(async () => {
  try {
    await initDB();                     // sql.js needs one async init
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 TaskFlow running on port ${PORT}`);
    });
  } catch (err) {
    console.error('❌ Failed to start:', err.message || err);
    process.exit(1);
  }
})();
