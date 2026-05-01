/**
 * db.js — SQLite via sql.js (pure JavaScript, zero native deps)
 * Works on Railway, Vercel, any platform — no node-gyp needed.
 *
 * FIXES applied:
 *  - Explicit locateFile for WASM binary (required in Node.js / Railway)
 *  - Robust param handling for null values
 *  - Safe .get() returns null when no rows found
 */

const path   = require('path');
const fs     = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// ── Persistence path ─────────────────────────────────────────────
const DB_DIR  = process.env.DB_DIR || path.join(__dirname, '../../data');
const DB_FILE = path.join(DB_DIR, 'taskmanager.db');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

// ── Internal state ────────────────────────────────────────────────
let _sqlDb = null;
let _ready = false;

// Save DB to disk after every write
function _save() {
  if (!_sqlDb) return;
  const data = _sqlDb.export();
  fs.writeFileSync(DB_FILE, Buffer.from(data));
}

// ── Normalise params — sql.js wants an array, never undefined ────
function _p(params) {
  if (!params || params.length === 0) return [];
  return Array.isArray(params) ? params : Array.from(params);
}

// ── DB proxy — same interface used in all route files ────────────
const db = {
  // Run a write statement (INSERT / UPDATE / DELETE / CREATE)
  run(sql, params = []) {
    _sqlDb.run(sql, _p(params));
    _save();
  },

  // Return one row or null
  get(sql, params = []) {
    const stmt = _sqlDb.prepare(sql);
    stmt.bind(_p(params));
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return row;
  },

  // Return all rows as an array
  all(sql, params = []) {
    const stmt = _sqlDb.prepare(sql);
    stmt.bind(_p(params));
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  },
};

function getDB() {
  if (!_ready) throw new Error('DB not ready — await initDB() first');
  return db;
}

// ── initDB — call once at startup, must be awaited ───────────────
async function initDB() {
  if (_ready) return db;

  const initSqlJs = require('sql.js');

  // CRITICAL for Node.js / Railway: tell sql.js where the .wasm file lives
  // Without locateFile, it tries to fetch via XHR which fails in Node.js
  // Dynamically resolve sql.js wasm path — works on Railway, Render, any platform
  const sqlJsPath = path.dirname(require.resolve('sql.js'));
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(sqlJsPath, file),
  });

  if (fs.existsSync(DB_FILE)) {
    _sqlDb = new SQL.Database(fs.readFileSync(DB_FILE));
    console.log('📂 Loaded DB from', DB_FILE);
  } else {
    _sqlDb = new SQL.Database();
    console.log('🆕 Created new DB at', DB_FILE);
  }

  // ── Schema ───────────────────────────────────────────────────────
  const schema = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      owner_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS project_members (
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (project_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'todo',
      priority TEXT NOT NULL DEFAULT 'medium',
      project_id TEXT NOT NULL,
      assignee_id TEXT,
      creator_id TEXT NOT NULL,
      due_date TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS task_comments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  ];

  schema.forEach(s => _sqlDb.run(s));
  _save();

  // ── Seed demo data ───────────────────────────────────────────────
  const count = db.get('SELECT COUNT(*) as c FROM users');
  if (!count || Number(count.c) === 0) {
    const adminId  = uuidv4();
    const memberId = uuidv4();

    db.run('INSERT INTO users (id,name,email,password,role) VALUES (?,?,?,?,?)',
      [adminId,  'Admin User',  'admin@taskmanager.com',  bcrypt.hashSync('admin123',  10), 'admin']);
    db.run('INSERT INTO users (id,name,email,password,role) VALUES (?,?,?,?,?)',
      [memberId, 'Jane Member', 'member@taskmanager.com', bcrypt.hashSync('member123', 10), 'member']);

    const projId  = uuidv4();
    const proj2Id = uuidv4();

    db.run('INSERT INTO projects (id,name,description,owner_id) VALUES (?,?,?,?)',
      [projId,  'Website Redesign',  'Redesign the company website with modern UI/UX', adminId]);
    db.run('INSERT INTO projects (id,name,description,owner_id) VALUES (?,?,?,?)',
      [proj2Id, 'Mobile App Launch', 'Develop and launch the iOS and Android app',    adminId]);

    [[projId, adminId, 'admin'], [projId, memberId, 'member'],
     [proj2Id, adminId, 'admin'], [proj2Id, memberId, 'member']].forEach(([pid, uid, r]) =>
      db.run('INSERT INTO project_members (project_id,user_id,role) VALUES (?,?,?)', [pid, uid, r])
    );

    const past   = new Date(); past.setDate(past.getDate() - 2);
    const future = new Date(); future.setDate(future.getDate() + 5);
    const pastStr   = past.toISOString().split('T')[0];
    const futureStr = future.toISOString().split('T')[0];

    [
      [uuidv4(), 'Design wireframes',    'Create wireframes for all main pages',  'done',        'high',     projId,  memberId, adminId, null],
      [uuidv4(), 'Setup CI/CD pipeline', 'Configure GitHub Actions',              'in_progress', 'high',     projId,  adminId,  adminId, futureStr],
      [uuidv4(), 'Build REST API',       'Implement all backend endpoints',       'in_progress', 'critical', projId,  adminId,  adminId, futureStr],
      [uuidv4(), 'Write unit tests',     'Cover all service functions',           'todo',        'medium',   projId,  memberId, adminId, pastStr],
      [uuidv4(), 'Deploy to production', 'Deploy app to Railway',                 'todo',        'high',     projId,  adminId,  adminId, pastStr],
      [uuidv4(), 'App UI Mockups',       'Design mobile app screens',             'done',        'medium',   proj2Id, memberId, adminId, null],
      [uuidv4(), 'Auth Module',          'Implement login and signup',            'in_progress', 'critical', proj2Id, adminId,  adminId, futureStr],
      [uuidv4(), 'Push Notifications',   'Integrate FCM push notifications',      'todo',        'low',      proj2Id, memberId, adminId, futureStr],
    ].forEach(t => db.run(
      'INSERT INTO tasks (id,title,description,status,priority,project_id,assignee_id,creator_id,due_date) VALUES (?,?,?,?,?,?,?,?,?)', t
    ));

    console.log('✅ Demo data seeded — admin@taskmanager.com / admin123');
  }

  _ready = true;
  console.log('✅ Database ready');
  return db;
}

module.exports = { getDB, initDB };
