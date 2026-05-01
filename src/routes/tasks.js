const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const TASK_COLS = `
  t.*, u1.name as assignee_name, u1.email as assignee_email,
  u2.name as creator_name, p.name as project_name
  FROM tasks t
  LEFT JOIN users u1 ON t.assignee_id = u1.id
  LEFT JOIN users u2 ON t.creator_id  = u2.id
  LEFT JOIN projects p ON t.project_id = p.id
`;

// GET /api/tasks
router.get('/', (req, res) => {
  const { project_id, status, assignee_id, priority } = req.query;
  const db = getDB();
  const params = [];
  let where = '1=1';

  if (project_id)  { where += ' AND t.project_id=?';   params.push(project_id); }
  if (status)      { where += ' AND t.status=?';        params.push(status); }
  if (assignee_id) { where += ' AND t.assignee_id=?';   params.push(assignee_id); }
  if (priority)    { where += ' AND t.priority=?';      params.push(priority); }

  if (req.user.role !== 'admin') {
    where += ' AND t.project_id IN (SELECT project_id FROM project_members WHERE user_id=?)';
    params.push(req.user.id);
  }

  try {
    const rows = db.all(`SELECT ${TASK_COLS} WHERE ${where} ORDER BY t.created_at DESC`, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/tasks
router.post('/', (req, res) => {
  const { title, description, project_id, assignee_id, priority, due_date, status } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Task title is required' });
  if (!project_id)    return res.status(400).json({ error: 'Project ID is required' });

  try {
    const db = getDB();
    if (req.user.role !== 'admin') {
      const m = db.get('SELECT * FROM project_members WHERE project_id=? AND user_id=?',
        [project_id, req.user.id]);
      if (!m) return res.status(403).json({ error: 'No access to this project' });
    }
    const id = uuidv4();
    db.run(`INSERT INTO tasks (id,title,description,project_id,assignee_id,creator_id,priority,due_date,status)
            VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, title.trim(), description || '', project_id, assignee_id || null,
       req.user.id, priority || 'medium', due_date || null, status || 'todo']);

    res.status(201).json(db.get(`SELECT ${TASK_COLS} WHERE t.id=?`, [id]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/tasks/:id
router.get('/:id', (req, res) => {
  try {
    const db   = getDB();
    const task = db.get(`SELECT ${TASK_COLS} WHERE t.id=?`, [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const comments = db.all(`
      SELECT c.*, u.name as user_name FROM task_comments c
      JOIN users u ON c.user_id=u.id WHERE c.task_id=? ORDER BY c.created_at ASC`, [req.params.id]);

    res.json({ ...task, comments });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/tasks/:id
router.put('/:id', (req, res) => {
  const { title, description, status, priority, assignee_id, due_date } = req.body;
  try {
    const db   = getDB();
    const task = db.get('SELECT * FROM tasks WHERE id=?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    if (req.user.role !== 'admin' &&
        task.assignee_id !== req.user.id &&
        task.creator_id  !== req.user.id)
      return res.status(403).json({ error: 'Not authorised to edit this task' });

    db.run(`UPDATE tasks SET title=?,description=?,status=?,priority=?,assignee_id=?,due_date=?,
              updated_at=datetime('now') WHERE id=?`,
      [title ?? task.title, description ?? task.description,
       status ?? task.status, priority ?? task.priority,
       assignee_id !== undefined ? (assignee_id || null) : task.assignee_id,
       due_date    !== undefined ? (due_date    || null) : task.due_date,
       req.params.id]);

    res.json(db.get(`SELECT ${TASK_COLS} WHERE t.id=?`, [req.params.id]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/tasks/:id
router.delete('/:id', (req, res) => {
  try {
    const db   = getDB();
    const task = db.get('SELECT * FROM tasks WHERE id=?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (req.user.role !== 'admin' && task.creator_id !== req.user.id)
      return res.status(403).json({ error: 'Not authorised' });

    db.run('DELETE FROM task_comments WHERE task_id=?', [req.params.id]);
    db.run('DELETE FROM tasks WHERE id=?', [req.params.id]);
    res.json({ message: 'Task deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/tasks/:id/comments
router.post('/:id/comments', (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Comment content required' });
  try {
    const db = getDB();
    if (!db.get('SELECT id FROM tasks WHERE id=?', [req.params.id]))
      return res.status(404).json({ error: 'Task not found' });

    const id = uuidv4();
    db.run('INSERT INTO task_comments (id,task_id,user_id,content) VALUES (?,?,?,?)',
      [id, req.params.id, req.user.id, content.trim()]);

    res.status(201).json(db.get(`
      SELECT c.*, u.name as user_name FROM task_comments c
      JOIN users u ON c.user_id=u.id WHERE c.id=?`, [id]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
