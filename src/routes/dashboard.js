const express = require('express');
const { getDB } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  try {
    const db     = getDB();
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';
    const today  = new Date().toISOString().split('T')[0];
    const stats  = {};

    if (isAdmin) {
      stats.total_projects    = Number(db.get('SELECT COUNT(*) as c FROM projects').c);
      stats.active_projects   = Number(db.get("SELECT COUNT(*) as c FROM projects WHERE status='active'").c);
      stats.total_tasks       = Number(db.get('SELECT COUNT(*) as c FROM tasks').c);
      stats.todo_tasks        = Number(db.get("SELECT COUNT(*) as c FROM tasks WHERE status='todo'").c);
      stats.in_progress_tasks = Number(db.get("SELECT COUNT(*) as c FROM tasks WHERE status='in_progress'").c);
      stats.done_tasks        = Number(db.get("SELECT COUNT(*) as c FROM tasks WHERE status='done'").c);
      stats.overdue_tasks     = Number(db.get("SELECT COUNT(*) as c FROM tasks WHERE due_date < ? AND status!='done'", [today]).c);
      stats.total_users       = Number(db.get('SELECT COUNT(*) as c FROM users').c);

      stats.recent_tasks = db.all(`
        SELECT t.*, u.name as assignee_name, p.name as project_name
        FROM tasks t
        LEFT JOIN users u ON t.assignee_id=u.id
        LEFT JOIN projects p ON t.project_id=p.id
        ORDER BY t.updated_at DESC LIMIT 8`);

      stats.overdue_list = db.all(`
        SELECT t.*, u.name as assignee_name, p.name as project_name
        FROM tasks t
        LEFT JOIN users u ON t.assignee_id=u.id
        LEFT JOIN projects p ON t.project_id=p.id
        WHERE t.due_date < ? AND t.status!='done'
        ORDER BY t.due_date ASC LIMIT 5`, [today]);

      stats.priority_breakdown = db.all(
        "SELECT priority, COUNT(*) as count FROM tasks GROUP BY priority");

      stats.project_progress = db.all(`
        SELECT p.id, p.name, p.status,
          COUNT(t.id) as total,
          SUM(CASE WHEN t.status='done' THEN 1 ELSE 0 END) as done
        FROM projects p LEFT JOIN tasks t ON t.project_id=p.id
        GROUP BY p.id ORDER BY p.created_at DESC LIMIT 6`);

    } else {
      stats.my_tasks          = Number(db.get("SELECT COUNT(*) as c FROM tasks WHERE assignee_id=?", [userId]).c);
      stats.todo_tasks        = Number(db.get("SELECT COUNT(*) as c FROM tasks WHERE assignee_id=? AND status='todo'", [userId]).c);
      stats.in_progress_tasks = Number(db.get("SELECT COUNT(*) as c FROM tasks WHERE assignee_id=? AND status='in_progress'", [userId]).c);
      stats.done_tasks        = Number(db.get("SELECT COUNT(*) as c FROM tasks WHERE assignee_id=? AND status='done'", [userId]).c);
      stats.overdue_tasks     = Number(db.get("SELECT COUNT(*) as c FROM tasks WHERE assignee_id=? AND due_date<? AND status!='done'", [userId, today]).c);
      stats.my_projects       = Number(db.get("SELECT COUNT(*) as c FROM project_members WHERE user_id=?", [userId]).c);

      stats.recent_tasks = db.all(`
        SELECT t.*, u.name as assignee_name, p.name as project_name
        FROM tasks t
        LEFT JOIN users u ON t.assignee_id=u.id
        LEFT JOIN projects p ON t.project_id=p.id
        WHERE t.assignee_id=?
        ORDER BY t.updated_at DESC LIMIT 8`, [userId]);

      stats.overdue_list = db.all(`
        SELECT t.*, u.name as assignee_name, p.name as project_name
        FROM tasks t
        LEFT JOIN users u ON t.assignee_id=u.id
        LEFT JOIN projects p ON t.project_id=p.id
        WHERE t.assignee_id=? AND t.due_date<? AND t.status!='done'
        ORDER BY t.due_date ASC`, [userId, today]);

      stats.priority_breakdown = [];
      stats.project_progress   = [];
    }

    res.json(stats);
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
