# TaskFlow — Team Task Manager

Full-stack team task manager with role-based access control.

## 🚀 Deploy to Railway (Step-by-Step)

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/taskflow.git
git push -u origin main
```

### 2. Deploy on Railway
1. Go to [railway.app](https://railway.app) → **New Project**
2. Click **"Deploy from GitHub repo"**
3. Select your repo
4. Railway auto-detects Node.js — no extra config needed

### 3. Set Environment Variables (in Railway dashboard)
| Variable | Value |
|----------|-------|
| `JWT_SECRET` | any-long-random-string-here |
| `DB_DIR` | `/app/data` |

### 4. Add a Volume (for database persistence)
1. In your Railway service → **Volumes** tab
2. Click **"New Volume"**
3. Mount path: `/app/data`
4. This keeps your database across redeploys

### 5. Done! 🎉
Your app will be live at `https://your-app.up.railway.app`

## Demo Credentials
| Role   | Email | Password |
|--------|-------|----------|
| Admin  | admin@taskmanager.com | admin123 |
| Member | member@taskmanager.com | member123 |

## Features
- 🔐 JWT Authentication with secure cookies
- 👥 Role-based access (Admin / Member)
- 📁 Project & team management
- ✅ Task creation, assignment & status tracking
- 📊 Dashboard with stats & progress
- 💬 Task comments

## Tech Stack
- **Backend**: Node.js + Express
- **Database**: SQLite via sql.js (pure JavaScript — no native compilation)
- **Auth**: JWT + bcryptjs
- **Frontend**: Vanilla JS SPA
