const express = require('express');
const { getDB } = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', (_req, res) => {
  try {
    res.json(getDB().all('SELECT id,name,email,role,created_at FROM users ORDER BY created_at DESC'));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', (req, res) => {
  try {
    const user = getDB().get('SELECT id,name,email,role,created_at FROM users WHERE id=?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', (req, res) => {
  if (req.user.role !== 'admin' && req.user.id !== req.params.id)
    return res.status(403).json({ error: 'Access denied' });
  try {
    const db   = getDB();
    const user = db.get('SELECT * FROM users WHERE id=?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { name, role } = req.body;
    db.run('UPDATE users SET name=?,role=? WHERE id=?',
      [name || user.name, (req.user.role === 'admin' && role) ? role : user.role, req.params.id]);
    res.json(db.get('SELECT id,name,email,role,created_at FROM users WHERE id=?', [req.params.id]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', requireAdmin, (req, res) => {
  if (req.user.id === req.params.id)
    return res.status(400).json({ error: 'Cannot delete yourself' });
  try {
    const db = getDB();
    if (!db.get('SELECT id FROM users WHERE id=?', [req.params.id]))
      return res.status(404).json({ error: 'User not found' });
    db.run('DELETE FROM project_members WHERE user_id=?', [req.params.id]);
    db.run('UPDATE tasks SET assignee_id=NULL WHERE assignee_id=?', [req.params.id]);
    db.run('DELETE FROM users WHERE id=?', [req.params.id]);
    res.json({ message: 'User deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
