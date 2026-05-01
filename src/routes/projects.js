const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/projects
router.get('/', (req, res) => {
  try {
    const db = getDB();
    let projects;
    if (req.user.role === 'admin') {
      projects = db.all(`
        SELECT p.*, u.name as owner_name,
          (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id) as task_count,
          (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND t.status='done') as done_count,
          (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id=p.id) as member_count
        FROM projects p JOIN users u ON p.owner_id=u.id ORDER BY p.created_at DESC`);
    } else {
      projects = db.all(`
        SELECT p.*, u.name as owner_name, pm.role as my_role,
          (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id) as task_count,
          (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND t.status='done') as done_count,
          (SELECT COUNT(*) FROM project_members pm2 WHERE pm2.project_id=p.id) as member_count
        FROM projects p
        JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=?
        JOIN users u ON p.owner_id=u.id ORDER BY p.created_at DESC`, [req.user.id]);
    }
    res.json(projects);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/projects
router.post('/', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only admins can create projects' });
  const { name, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Project name is required' });
  try {
    const db = getDB();
    const id = uuidv4();
    db.run('INSERT INTO projects (id,name,description,owner_id) VALUES (?,?,?,?)',
      [id, name.trim(), description || '', req.user.id]);
    db.run('INSERT INTO project_members (project_id,user_id,role) VALUES (?,?,?)',
      [id, req.user.id, 'admin']);
    res.status(201).json(db.get('SELECT * FROM projects WHERE id=?', [id]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/projects/:id
router.get('/:id', (req, res) => {
  try {
    const db = getDB();
    const project = db.get(`SELECT p.*, u.name as owner_name FROM projects p
      JOIN users u ON p.owner_id=u.id WHERE p.id=?`, [req.params.id]);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (req.user.role !== 'admin') {
      const m = db.get('SELECT * FROM project_members WHERE project_id=? AND user_id=?',
        [req.params.id, req.user.id]);
      if (!m) return res.status(403).json({ error: 'Access denied' });
    }

    const members = db.all(`
      SELECT u.id, u.name, u.email, u.role as system_role, pm.role as project_role, pm.joined_at
      FROM project_members pm JOIN users u ON pm.user_id=u.id WHERE pm.project_id=?`, [req.params.id]);

    res.json({ ...project, members });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/projects/:id
router.put('/:id', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  try {
    const db = getDB();
    const p  = db.get('SELECT * FROM projects WHERE id=?', [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Project not found' });
    const { name, description, status } = req.body;
    db.run('UPDATE projects SET name=?,description=?,status=? WHERE id=?',
      [name || p.name, description ?? p.description, status || p.status, req.params.id]);
    res.json(db.get('SELECT * FROM projects WHERE id=?', [req.params.id]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/projects/:id
router.delete('/:id', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  try {
    const db = getDB();
    if (!db.get('SELECT id FROM projects WHERE id=?', [req.params.id]))
      return res.status(404).json({ error: 'Project not found' });
    db.run('DELETE FROM task_comments WHERE task_id IN (SELECT id FROM tasks WHERE project_id=?)', [req.params.id]);
    db.run('DELETE FROM tasks WHERE project_id=?', [req.params.id]);
    db.run('DELETE FROM project_members WHERE project_id=?', [req.params.id]);
    db.run('DELETE FROM projects WHERE id=?', [req.params.id]);
    res.json({ message: 'Project deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/projects/:id/members
router.post('/:id/members', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { userId, role } = req.body;
  if (!userId) return res.status(400).json({ error: 'User ID required' });
  try {
    const db = getDB();
    if (!db.get('SELECT id FROM users WHERE id=?', [userId]))
      return res.status(404).json({ error: 'User not found' });
    if (db.get('SELECT * FROM project_members WHERE project_id=? AND user_id=?', [req.params.id, userId]))
      return res.status(409).json({ error: 'User already in project' });
    db.run('INSERT INTO project_members (project_id,user_id,role) VALUES (?,?,?)',
      [req.params.id, userId, role || 'member']);
    res.status(201).json({ message: 'Member added' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/projects/:id/members/:userId
router.delete('/:id/members/:userId', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  try {
    getDB().run('DELETE FROM project_members WHERE project_id=? AND user_id=?',
      [req.params.id, req.params.userId]);
    res.json({ message: 'Member removed' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
