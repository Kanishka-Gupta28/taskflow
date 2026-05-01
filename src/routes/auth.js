const express  = require('express');
const bcrypt   = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db');
const { generateToken, authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/signup
router.post('/signup', (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name?.trim() || !email || !password)
    return res.status(400).json({ error: 'Name, email and password are required' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'Invalid email format' });

  try {
    const db = getDB();
    if (db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]))
      return res.status(409).json({ error: 'Email already registered' });

    const id = uuidv4();
    db.run('INSERT INTO users (id,name,email,password,role) VALUES (?,?,?,?,?)',
      [id, name.trim(), email.toLowerCase(), bcrypt.hashSync(password, 10),
       role === 'admin' ? 'admin' : 'member']);

    const user  = db.get('SELECT id,name,email,role,created_at FROM users WHERE id=?', [id]);
    const token = generateToken(user);
    res.cookie('token', token, { httpOnly: true, maxAge: 7*24*60*60*1000, sameSite: 'lax' });
    res.status(201).json({ user, token });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Server error during signup' });
  }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required' });

  try {
    const db   = getDB();
    const user = db.get('SELECT * FROM users WHERE email=?', [email.toLowerCase()]);
    if (!user || !bcrypt.compareSync(password, user.password))
      return res.status(401).json({ error: 'Invalid email or password' });

    const token = generateToken(user);
    res.cookie('token', token, { httpOnly: true, maxAge: 7*24*60*60*1000, sameSite: 'lax' });
    const { password: _, ...safe } = user;
    res.json({ user: safe, token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// POST /api/auth/logout
router.post('/logout', (_req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  const user = getDB().get('SELECT id,name,email,role,created_at FROM users WHERE id=?', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

module.exports = router;
