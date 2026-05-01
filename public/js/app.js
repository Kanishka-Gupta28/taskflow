/* ══════════════════════════════════════════════════════════
   TaskFlow — Frontend Application
   ══════════════════════════════════════════════════════════ */

let currentUser = null;
let allTasks    = [];
let allProjects = [];
let allUsers    = [];

// ── API Helper ────────────────────────────────────────────
async function api(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch('/api' + path, opts);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── Toast ─────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.className = 'toast'; }, 3000);
}

// ── Auth ──────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  document.querySelector(`[onclick="switchTab('${tab}')"]`).classList.add('active');
  document.getElementById(tab + '-form').classList.add('active');
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  btn.disabled = true; btn.querySelector('span').textContent = 'Signing in…';

  try {
    const data = await api('POST', '/auth/login', {
      email:    document.getElementById('login-email').value,
      password: document.getElementById('login-password').value,
    });
    currentUser = data.user;
    await enterApp();
  } catch (err) {
    errEl.textContent = err.message;
    btn.disabled = false; btn.querySelector('span').textContent = 'Sign In';
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const btn = document.getElementById('signup-btn');
  const errEl = document.getElementById('signup-error');
  errEl.textContent = '';
  btn.disabled = true; btn.querySelector('span').textContent = 'Creating…';

  try {
    const data = await api('POST', '/auth/signup', {
      name:     document.getElementById('signup-name').value,
      email:    document.getElementById('signup-email').value,
      password: document.getElementById('signup-password').value,
      role:     document.getElementById('signup-role').value,
    });
    currentUser = data.user;
    await enterApp();
  } catch (err) {
    errEl.textContent = err.message;
    btn.disabled = false; btn.querySelector('span').textContent = 'Create Account';
  }
}

async function handleLogout() {
  await api('POST', '/auth/logout').catch(() => {});
  currentUser = null;
  document.getElementById('auth-page').classList.add('active');
  document.getElementById('app-page').classList.remove('active');
  document.getElementById('login-form').reset();
}

// ── App Entry ─────────────────────────────────────────────
async function enterApp() {
  document.getElementById('auth-page').classList.remove('active');
  document.getElementById('app-page').classList.add('active');

  // Set user info
  const isAdmin = currentUser.role === 'admin';
  document.getElementById('sidebar-user-name').textContent = currentUser.name;
  document.getElementById('sidebar-user-role').textContent = currentUser.role;
  document.getElementById('user-avatar').textContent = currentUser.name.charAt(0).toUpperCase();

  if (isAdmin) {
    document.body.classList.add('is-admin');
  } else {
    document.body.classList.remove('is-admin');
  }

  // Load data
  await Promise.all([
    loadProjects(),
    loadAllUsers(),
  ]);

  showSection('dashboard');
}

// ── Navigation ────────────────────────────────────────────
function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById('section-' + name)?.classList.add('active');
  document.querySelector(`[data-section="${name}"]`)?.classList.add('active');

  const titles = { dashboard: 'Dashboard', projects: 'Projects', tasks: 'Tasks', team: 'Team' };
  document.getElementById('section-title').textContent = titles[name] || name;

  const actionsEl = document.getElementById('topbar-actions');
  actionsEl.innerHTML = '';

  if (name === 'dashboard') {
    loadDashboard();
  } else if (name === 'projects') {
    if (currentUser.role === 'admin') {
      const btn = document.createElement('button');
      btn.className = 'btn-primary';
      btn.innerHTML = '<span>+ New Project</span>';
      btn.onclick = () => openModal('modal-project');
      actionsEl.appendChild(btn);
    }
    renderProjects();
  } else if (name === 'tasks') {
    const btn = document.createElement('button');
    btn.className = 'btn-primary';
    btn.innerHTML = '<span>+ New Task</span>';
    btn.onclick = () => openTaskModal();
    actionsEl.appendChild(btn);
    loadTasks();
  } else if (name === 'team') {
    loadTeam();
  }
}

// ── Dashboard ─────────────────────────────────────────────
async function loadDashboard() {
  try {
    const stats = await api('GET', '/dashboard');
    renderStats(stats);
    renderRecentTasks(stats.recent_tasks || []);
    renderOverdueTasks(stats.overdue_list || []);
    if (currentUser.role === 'admin') {
      renderProjectProgress(stats.project_progress || []);
      renderPriorityChart(stats.priority_breakdown || []);
    }
  } catch (err) {
    toast('Failed to load dashboard', 'error');
  }
}

function renderStats(stats) {
  const el = document.getElementById('stats-grid');
  const isAdmin = currentUser.role === 'admin';

  const cards = isAdmin ? [
    { icon: '⬡', value: stats.total_projects  || 0, label: 'Total Projects' },
    { icon: '◫', value: stats.total_tasks      || 0, label: 'Total Tasks' },
    { icon: '▶', value: stats.in_progress_tasks|| 0, label: 'In Progress' },
    { icon: '✓', value: stats.done_tasks       || 0, label: 'Completed' },
    { icon: '⚠', value: stats.overdue_tasks    || 0, label: 'Overdue' },
    { icon: '◎', value: stats.total_users      || 0, label: 'Team Members' },
  ] : [
    { icon: '◫', value: stats.my_tasks         || 0, label: 'My Tasks' },
    { icon: '◻', value: stats.todo_tasks       || 0, label: 'To Do' },
    { icon: '▶', value: stats.in_progress_tasks|| 0, label: 'In Progress' },
    { icon: '✓', value: stats.done_tasks       || 0, label: 'Completed' },
    { icon: '⚠', value: stats.overdue_tasks    || 0, label: 'Overdue' },
    { icon: '⬡', value: stats.my_projects      || 0, label: 'My Projects' },
  ];

  el.innerHTML = cards.map(c => `
    <div class="stat-card">
      <div class="stat-icon">${c.icon}</div>
      <div class="stat-value">${c.value}</div>
      <div class="stat-label">${c.label}</div>
    </div>
  `).join('');
}

function renderRecentTasks(tasks) {
  const el = document.getElementById('recent-tasks-list');
  if (!tasks.length) { el.innerHTML = '<div class="empty-state"><p>No recent tasks</p></div>'; return; }
  el.innerHTML = tasks.map(t => `
    <div class="task-mini-item" onclick="openTaskDetail('${t.id}')">
      <div class="task-mini-dot" style="background:${statusColor(t.status)}"></div>
      <div class="task-mini-info">
        <div class="task-mini-title">${escHtml(t.title)}</div>
        <div class="task-mini-sub">${escHtml(t.project_name || '—')} · ${t.assignee_name ? escHtml(t.assignee_name) : 'Unassigned'}</div>
      </div>
      <div class="task-mini-badges">
        <span class="badge badge-status-${t.status}">${statusLabel(t.status)}</span>
        <span class="badge badge-priority-${t.priority}">${t.priority}</span>
      </div>
    </div>
  `).join('');
}

function renderOverdueTasks(tasks) {
  const el = document.getElementById('overdue-tasks-list');
  if (!tasks.length) { el.innerHTML = '<div class="empty-state"><p>No overdue tasks 🎉</p></div>'; return; }
  el.innerHTML = tasks.map(t => `
    <div class="task-mini-item" onclick="openTaskDetail('${t.id}')">
      <div class="task-mini-dot" style="background:var(--red)"></div>
      <div class="task-mini-info">
        <div class="task-mini-title">${escHtml(t.title)}</div>
        <div class="task-mini-sub">${escHtml(t.project_name || '—')} · Due ${t.due_date}</div>
      </div>
      <span class="overdue-badge">OVERDUE</span>
    </div>
  `).join('');
}

function renderProjectProgress(projects) {
  const el = document.getElementById('project-progress-list');
  if (!projects.length) { el.innerHTML = '<div class="empty-state"><p>No projects</p></div>'; return; }
  el.innerHTML = projects.map(p => {
    const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
    return `
      <div class="proj-prog-item">
        <div class="proj-prog-name">
          <span>${escHtml(p.name)}</span>
          <span class="proj-prog-pct">${pct}% · ${p.done}/${p.total}</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>
    `;
  }).join('');
}

function renderPriorityChart(breakdown) {
  const el = document.getElementById('priority-chart');
  const total = breakdown.reduce((s, b) => s + Number(b.count), 0) || 1;
  const colors = { critical: 'var(--purple)', high: 'var(--red)', medium: 'var(--orange)', low: '#9ca3af' };
  const order  = ['critical', 'high', 'medium', 'low'];
  const sorted = order.map(p => breakdown.find(b => b.priority === p) || { priority: p, count: 0 });

  el.innerHTML = sorted.map(b => `
    <div class="priority-bar-row">
      <div class="priority-bar-label">
        <span>${b.priority}</span>
        <span style="color:var(--text-2)">${b.count}</span>
      </div>
      <div class="priority-bar-outer">
        <div class="priority-bar-inner" style="width:${Math.round(Number(b.count)/total*100)}%;background:${colors[b.priority] || '#9ca3af'}"></div>
      </div>
    </div>
  `).join('');
}

// ── Projects ──────────────────────────────────────────────
async function loadProjects() {
  allProjects = await api('GET', '/projects').catch(() => []);
}

function renderProjects() {
  const el = document.getElementById('projects-grid');
  const q  = document.getElementById('project-search')?.value?.toLowerCase() || '';
  const filtered = allProjects.filter(p =>
    p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)
  );

  if (!filtered.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">⬡</div><p>No projects found</p></div>';
    return;
  }

  el.innerHTML = filtered.map(p => {
    const pct = p.task_count > 0 ? Math.round((p.done_count / p.task_count) * 100) : 0;
    return `
      <div class="project-card" onclick="openProjectDetail('${p.id}')">
        <div class="project-card-header">
          <div class="project-name">${escHtml(p.name)}</div>
          <div class="project-actions" onclick="event.stopPropagation()">
            ${currentUser.role === 'admin' ? `
              <button class="btn-icon" title="Edit" onclick="editProject('${p.id}')">✏</button>
              <button class="btn-icon" title="Delete" onclick="deleteProject('${p.id}', event)">✕</button>
            ` : ''}
          </div>
        </div>
        <div class="project-desc">${escHtml(p.description || 'No description')}</div>
        <div class="project-progress">
          <div class="progress-label">
            <span>Progress</span><span>${pct}%</span>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        </div>
        <div class="project-meta">
          <div class="meta-item">◫ ${p.task_count} tasks</div>
          <div class="meta-item">◎ ${p.member_count} members</div>
          <div class="meta-item">${p.status === 'active' ? '● Active' : '○ Inactive'}</div>
        </div>
      </div>
    `;
  }).join('');
}

function filterProjects() { renderProjects(); }

async function editProject(id) {
  try {
    const proj = await api('GET', '/projects/' + id);
    document.getElementById('proj-name').value = proj.name;
    document.getElementById('proj-desc').value = proj.description || '';
    const form = document.querySelector('#modal-project form');
    form.onsubmit = (e) => updateProject(e, id, proj);
    document.querySelector('#modal-project .modal-header h2').textContent = 'Edit Project';
    openModal('modal-project');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function updateProject(e, id, original) {
  e.preventDefault();
  try {
    const updated = await api('PUT', '/projects/' + id, {
      name:        document.getElementById('proj-name').value,
      description: document.getElementById('proj-desc').value,
      status:      original.status,
    });
    const idx = allProjects.findIndex(p => p.id === id);
    if (idx !== -1) allProjects[idx] = { ...allProjects[idx], ...updated };
    renderProjects();
    closeModal();
    const form = document.querySelector('#modal-project form');
    form.onsubmit = createProject;
    document.querySelector('#modal-project .modal-header h2').textContent = 'New Project';
    document.getElementById('proj-name').value = '';
    document.getElementById('proj-desc').value = '';
    toast('Project updated!');
  } catch (err) {
    toast(err.message, 'error');
  }
}


async function createProject(e) {
  e.preventDefault();
  try {
    const proj = await api('POST', '/projects', {
      name:        document.getElementById('proj-name').value,
      description: document.getElementById('proj-desc').value,
    });
    allProjects.unshift(proj);
    renderProjects();
    closeModal();
    document.getElementById('proj-name').value = '';
    document.getElementById('proj-desc').value = '';
    toast('Project created!');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteProject(id, e) {
  e.stopPropagation();
  if (!confirm('Delete this project and all its tasks?')) return;
  try {
    await api('DELETE', '/projects/' + id);
    allProjects = allProjects.filter(p => p.id !== id);
    renderProjects();
    toast('Project deleted');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function openProjectDetail(id) {
  try {
    const proj = await api('GET', '/projects/' + id);
    const tasks = await api('GET', '/tasks?project_id=' + id);

    document.getElementById('pd-name').textContent = proj.name;
    document.getElementById('pd-desc').textContent = proj.description || '';

    document.getElementById('pd-members').innerHTML = proj.members.map(m => `
      <div class="member-row">
        <div class="member-av">${m.name.charAt(0).toUpperCase()}</div>
        <div class="member-info">
          <div class="member-name">${escHtml(m.name)}</div>
          <div class="member-email">${escHtml(m.email)}</div>
        </div>
        <span class="badge badge-${m.project_role}">${m.project_role}</span>
        ${currentUser.role === 'admin' ? `<button class="btn-danger" onclick="removeMember('${id}','${m.id}')">✕</button>` : ''}
      </div>
    `).join('') || '<div class="empty-state"><p>No members</p></div>';

    if (currentUser.role === 'admin') {
      const notInProject = allUsers.filter(u => !proj.members.find(m => m.id === u.id));
      document.getElementById('pd-add-member').innerHTML = notInProject.length ? `
        <div class="add-member-form">
          <select id="add-member-select">
            ${notInProject.map(u => `<option value="${u.id}">${escHtml(u.name)} (${u.role})</option>`).join('')}
          </select>
          <button class="btn-primary sm" onclick="addMember('${id}')">Add</button>
        </div>
      ` : '<div style="font-size:12px;color:var(--text-3)">All users are members</div>';
    }

    document.getElementById('pd-tasks').innerHTML = tasks.length ? tasks.map(t => `
      <div class="task-mini-item" onclick="openTaskDetail('${t.id}')">
        <div class="task-mini-dot" style="background:${statusColor(t.status)}"></div>
        <div class="task-mini-info">
          <div class="task-mini-title">${escHtml(t.title)}</div>
          <div class="task-mini-sub">${t.assignee_name ? escHtml(t.assignee_name) : 'Unassigned'}</div>
        </div>
        <span class="badge badge-status-${t.status}">${statusLabel(t.status)}</span>
      </div>
    `).join('') : '<div class="empty-state"><p>No tasks yet</p></div>';

    openModal('modal-project-detail');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function addMember(projectId) {
  const userId = document.getElementById('add-member-select')?.value;
  if (!userId) return;
  try {
    await api('POST', `/projects/${projectId}/members`, { userId });
    toast('Member added!');
    openProjectDetail(projectId);
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function removeMember(projectId, userId) {
  if (!confirm('Remove this member?')) return;
  try {
    await api('DELETE', `/projects/${projectId}/members/${userId}`);
    toast('Member removed');
    openProjectDetail(projectId);
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ── Tasks ─────────────────────────────────────────────────
async function loadTasks() {
  try {
    allTasks = await api('GET', '/tasks');
    populateProjectFilter();
    renderTasks();
  } catch (err) {
    toast('Failed to load tasks', 'error');
  }
}

function populateProjectFilter() {
  const el = document.getElementById('task-project-filter');
  const existing = new Set();
  el.innerHTML = '<option value="">All Projects</option>';
  allProjects.forEach(p => {
    el.innerHTML += `<option value="${p.id}">${escHtml(p.name)}</option>`;
  });
}

function renderTasks() {
  const tbody = document.getElementById('tasks-tbody');
  const q = document.getElementById('task-search')?.value?.toLowerCase() || '';
  const status = document.getElementById('task-status-filter')?.value || '';
  const priority = document.getElementById('task-priority-filter')?.value || '';
  const projectId = document.getElementById('task-project-filter')?.value || '';

  const today = new Date().toISOString().split('T')[0];

  let filtered = allTasks.filter(t => {
    if (q && !t.title.toLowerCase().includes(q) && !(t.project_name||'').toLowerCase().includes(q)) return false;
    if (status && t.status !== status) return false;
    if (priority && t.priority !== priority) return false;
    if (projectId && t.project_id !== projectId) return false;
    return true;
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">◻</div><p>No tasks found</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(t => {
    const isOverdue = t.due_date && t.due_date < today && t.status !== 'done';
    const isSoon = t.due_date && !isOverdue && t.due_date <= new Date(Date.now() + 3*86400000).toISOString().split('T')[0];
    return `
      <tr onclick="openTaskDetail('${t.id}')" class="${isOverdue ? 'overdue-row' : ''}">
        <td class="task-title-cell">
          <div>${escHtml(t.title)}</div>
          ${t.description ? `<div class="task-desc-preview">${escHtml(t.description)}</div>` : ''}
        </td>
        <td>${escHtml(t.project_name || '—')}</td>
        <td>${t.assignee_name ? escHtml(t.assignee_name) : '<span style="color:var(--text-3)">—</span>'}</td>
        <td><span class="badge badge-priority-${t.priority}">${t.priority}</span></td>
        <td>
          <select class="status-select-inline" onchange="quickUpdateStatus('${t.id}', this.value)" onclick="event.stopPropagation()">
            <option value="todo" ${t.status==='todo'?'selected':''}>Todo</option>
            <option value="in_progress" ${t.status==='in_progress'?'selected':''}>In Progress</option>
            <option value="done" ${t.status==='done'?'selected':''}>Done</option>
          </select>
        </td>
        <td>
          ${t.due_date
            ? `<span class="due-date ${isOverdue?'overdue':isSoon?'soon':''}">${t.due_date}${isOverdue?' ⚠':''}</span>`
            : '<span style="color:var(--text-3)">—</span>'
          }
        </td>
        <td onclick="event.stopPropagation()" style="display:flex;gap:6px;align-items:center;padding-top:13px">
          <button class="btn-icon" title="Edit" onclick="openTaskModal('${t.id}')">✏</button>
          <button class="btn-icon" title="Delete" onclick="deleteTask('${t.id}')">✕</button>
        </td>
      </tr>
    `;
  }).join('');
}

function filterTasks() { renderTasks(); }

async function quickUpdateStatus(taskId, newStatus) {
  try {
    const updated = await api('PUT', '/tasks/' + taskId, { status: newStatus });
    const idx = allTasks.findIndex(t => t.id === taskId);
    if (idx !== -1) allTasks[idx] = { ...allTasks[idx], ...updated };
    toast('Status updated');
  } catch (err) {
    toast(err.message, 'error');
    renderTasks(); // revert
  }
}

async function openTaskModal(taskId = null) {
  // Populate project dropdown
  const projSelect = document.getElementById('task-project');
  projSelect.innerHTML = '<option value="">Select project</option>' +
    allProjects.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('');

  document.getElementById('task-assignee').innerHTML = '<option value="">Unassigned</option>';
  document.getElementById('task-edit-id').value = '';
  document.getElementById('task-modal-title').textContent = 'New Task';

  if (taskId) {
    try {
      const task = await api('GET', '/tasks/' + taskId);
      document.getElementById('task-modal-title').textContent = 'Edit Task';
      document.getElementById('task-edit-id').value = task.id;
      document.getElementById('task-title').value = task.title;
      document.getElementById('task-description').value = task.description || '';
      document.getElementById('task-project').value = task.project_id;
      document.getElementById('task-priority').value = task.priority;
      document.getElementById('task-status').value = task.status;
      document.getElementById('task-due-date').value = task.due_date || '';
      await loadProjectMembers(task.assignee_id);
    } catch (err) {
      toast(err.message, 'error');
    }
  } else {
    document.getElementById('task-title').value = '';
    document.getElementById('task-description').value = '';
    document.getElementById('task-priority').value = 'medium';
    document.getElementById('task-status').value = 'todo';
    document.getElementById('task-due-date').value = '';
  }

  openModal('modal-task');
}

async function loadProjectMembers(selectedAssigneeId = null) {
  const projId = document.getElementById('task-project').value;
  const assigneeSelect = document.getElementById('task-assignee');

  if (!projId) {
    assigneeSelect.innerHTML = '<option value="">Select project first</option>';
    return;
  }

  try {
    const proj = await api('GET', '/projects/' + projId);
    assigneeSelect.innerHTML = '<option value="">Unassigned</option>' +
      proj.members.map(m => `<option value="${m.id}" ${m.id === selectedAssigneeId ? 'selected' : ''}>${escHtml(m.name)}</option>`).join('');
  } catch {
    // fallback to all users
    assigneeSelect.innerHTML = '<option value="">Unassigned</option>' +
      allUsers.map(u => `<option value="${u.id}" ${u.id === selectedAssigneeId ? 'selected' : ''}>${escHtml(u.name)}</option>`).join('');
  }
}

async function saveTask(e) {
  e.preventDefault();
  const id = document.getElementById('task-edit-id').value;
  const payload = {
    title:       document.getElementById('task-title').value,
    description: document.getElementById('task-description').value,
    project_id:  document.getElementById('task-project').value,
    assignee_id: document.getElementById('task-assignee').value || null,
    priority:    document.getElementById('task-priority').value,
    status:      document.getElementById('task-status').value,
    due_date:    document.getElementById('task-due-date').value || null,
  };

  try {
    if (id) {
      const updated = await api('PUT', '/tasks/' + id, payload);
      const idx = allTasks.findIndex(t => t.id === id);
      if (idx !== -1) allTasks[idx] = updated;
      toast('Task updated!');
    } else {
      const task = await api('POST', '/tasks', payload);
      allTasks.unshift(task);
      toast('Task created!');
    }
    closeModal();
    renderTasks();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  try {
    await api('DELETE', '/tasks/' + id);
    allTasks = allTasks.filter(t => t.id !== id);
    renderTasks();
    toast('Task deleted');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function openTaskDetail(id) {
  try {
    const task = await api('GET', '/tasks/' + id);
    const today = new Date().toISOString().split('T')[0];
    const isOverdue = task.due_date && task.due_date < today && task.status !== 'done';

    document.getElementById('td-title').textContent = task.title;
    document.getElementById('td-meta').innerHTML = `
      <span class="badge badge-status-${task.status}" style="margin-right:6px">${statusLabel(task.status)}</span>
      <span class="badge badge-priority-${task.priority}">${task.priority}</span>
      ${isOverdue ? '<span class="overdue-badge" style="margin-left:6px">⚠ OVERDUE</span>' : ''}
    `;
    document.getElementById('td-task-id').value = task.id;

    document.getElementById('td-body').innerHTML = `
      ${task.description ? `<div class="td-desc">${escHtml(task.description)}</div>` : ''}
      <div class="td-detail-grid">
        <div class="td-detail-item">
          <div class="td-detail-label">Project</div>
          <div class="td-detail-value">${escHtml(task.project_name || '—')}</div>
        </div>
        <div class="td-detail-item">
          <div class="td-detail-label">Assignee</div>
          <div class="td-detail-value">${task.assignee_name ? escHtml(task.assignee_name) : 'Unassigned'}</div>
        </div>
        <div class="td-detail-item">
          <div class="td-detail-label">Created By</div>
          <div class="td-detail-value">${escHtml(task.creator_name || '—')}</div>
        </div>
        <div class="td-detail-item">
          <div class="td-detail-label">Due Date</div>
          <div class="td-detail-value ${isOverdue ? 'overdue-badge' : ''}">${task.due_date || '—'}</div>
        </div>
        <div class="td-detail-item">
          <div class="td-detail-label">Created</div>
          <div class="td-detail-value">${formatDate(task.created_at)}</div>
        </div>
        <div class="td-detail-item">
          <div class="td-detail-label">Updated</div>
          <div class="td-detail-value">${formatDate(task.updated_at)}</div>
        </div>
      </div>
    `;

    renderComments(task.comments || []);
    openModal('modal-task-detail');
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderComments(comments) {
  const el = document.getElementById('td-comments-list');
  if (!comments.length) { el.innerHTML = '<div style="color:var(--text-3);font-size:12px;padding:8px 0">No comments yet.</div>'; return; }
  el.innerHTML = comments.map(c => `
    <div class="comment-item">
      <div class="comment-header">
        <span class="comment-author">${escHtml(c.user_name)}</span>
        <span class="comment-time">${formatDate(c.created_at)}</span>
      </div>
      <div class="comment-text">${escHtml(c.content)}</div>
    </div>
  `).join('');
}

async function addComment(e) {
  e.preventDefault();
  const taskId = document.getElementById('td-task-id').value;
  const content = document.getElementById('comment-input').value.trim();
  if (!content) return;

  try {
    await api('POST', `/tasks/${taskId}/comments`, { content });
    document.getElementById('comment-input').value = '';
    // Refresh comments
    const task = await api('GET', '/tasks/' + taskId);
    renderComments(task.comments || []);
    toast('Comment added');
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ── Team ──────────────────────────────────────────────────
async function loadAllUsers() {
  allUsers = await api('GET', '/users').catch(() => []);
}

async function loadTeam() {
  await loadAllUsers();
  const el = document.getElementById('team-grid');

  if (!allUsers.length) {
    el.innerHTML = '<div class="empty-state"><p>No users found</p></div>';
    return;
  }

  // Get task counts per user
  const taskCounts = {};
  allTasks.forEach(t => {
    if (t.assignee_id) {
      taskCounts[t.assignee_id] = (taskCounts[t.assignee_id] || 0) + 1;
    }
  });

  el.innerHTML = allUsers.map(u => `
    <div class="team-card">
      <div class="team-card-top">
        <div class="team-avatar">${u.name.charAt(0).toUpperCase()}</div>
        <div>
          <div class="team-name">${escHtml(u.name)}</div>
          <div class="team-email">${escHtml(u.email)}</div>
        </div>
      </div>
      <div>
        <span class="badge badge-${u.role === 'admin' ? 'admin' : 'member'}">${u.role}</span>
      </div>
      <div class="team-stats">
        <div class="team-stat">
          <strong>${taskCounts[u.id] || 0}</strong>
          Tasks Assigned
        </div>
        <div class="team-stat">
          <strong>${formatDate(u.created_at, true)}</strong>
          Joined
        </div>
      </div>
      ${currentUser.role === 'admin' && u.id !== currentUser.id ? `
        <div style="display:flex;gap:8px;margin-top:4px">
          <button class="btn-ghost" style="font-size:12px;padding:6px 12px"
            onclick="toggleUserRole('${u.id}', '${u.role}')">
            Make ${u.role === 'admin' ? 'Member' : 'Admin'}
          </button>
          <button class="btn-danger" onclick="deleteUser('${u.id}')">Remove</button>
        </div>
      ` : ''}
    </div>
  `).join('');
}

async function toggleUserRole(userId, currentRole) {
  const newRole = currentRole === 'admin' ? 'member' : 'admin';
  if (!confirm(`Change role to ${newRole}?`)) return;
  try {
    await api('PUT', '/users/' + userId, { role: newRole });
    await loadAllUsers();
    loadTeam();
    toast('Role updated');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteUser(userId) {
  if (!confirm('Remove this user from the system?')) return;
  try {
    await api('DELETE', '/users/' + userId);
    await loadAllUsers();
    loadTeam();
    toast('User removed');
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ── Modals ────────────────────────────────────────────────
function openModal(id) {
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
  document.getElementById('modal-overlay').classList.add('active');
  document.getElementById(id).classList.add('active');
}

function closeModal(event) {
  if (event && event.target !== document.getElementById('modal-overlay')) return;
  document.getElementById('modal-overlay').classList.remove('active');
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
  // Reset project modal to "New Project" state
  const projForm = document.querySelector('#modal-project form');
  if (projForm) projForm.onsubmit = createProject;
  const projTitle = document.querySelector('#modal-project .modal-header h2');
  if (projTitle) projTitle.textContent = 'New Project';
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.getElementById('modal-overlay').classList.remove('active');
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
  }
});

// ── Helpers ───────────────────────────────────────────────
function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function statusColor(status) {
  return { todo: '#9ca3af', in_progress: 'var(--blue)', done: 'var(--green)' }[status] || '#9ca3af';
}

function statusLabel(status) {
  return { todo: 'Todo', in_progress: 'In Progress', done: 'Done' }[status] || status;
}

function formatDate(str, short = false) {
  if (!str) return '—';
  try {
    const d = new Date(str);
    if (short) return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return str; }
}

// ── Init ──────────────────────────────────────────────────
(async () => {
  try {
    currentUser = await api('GET', '/auth/me');
    await enterApp();
  } catch {
    // Not logged in — show auth
    document.getElementById('auth-page').classList.add('active');
  }
})();
