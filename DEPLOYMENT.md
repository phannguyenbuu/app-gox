# 🚀 Deployment Guide - app-gox

## **Quick Start**

### **Option 1: Deploy via Docker (Recommended)**
On the VPS where app-gox is deployed:

```bash
cd /var/www/app-gox
bash deploy.sh
```

### **Option 2: Deploy via SSH (SFTP)**
From your local machine:

```bash
cd /var/www/app-gox
python3 deploy_frontend.py
```

---

## **Prerequisites**

### **For Docker Deployment**
- Docker + Docker Compose installed on VPS
- SSH access to VPS
- Git access to repository

### **For SSH/SFTP Deployment**
- SSH key authentication configured (no passwords!)
- Python 3 + paramiko library
- SSH key added to VPS authorized_keys

---

## **Setup SSH Key Authentication**

### **1. Generate SSH Key (if not exists)**
```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""
```

### **2. Add Public Key to VPS**
```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub root@157.66.80.125
```

### **3. Test SSH Connection**
```bash
ssh -i ~/.ssh/id_ed25519 root@157.66.80.125
```

---

## **Deployment Process**

### **Docker Build Flow**
```
1. git pull (fetch latest code)
2. docker compose up -d --build
   ├─ Build Stage: Node 20-alpine
   │  ├─ npm ci (clean install)
   │  └─ npm run build → dist/
   │
   └─ Runtime Stage: nginx 1.27-alpine
      ├─ Copy dist/ → /usr/share/nginx/html
      ├─ Load nginx/default.conf
      └─ Start nginx on port 80
3. Verify container running
```

### **SFTP Deploy Flow**
```
1. npm run build (locally)
2. SFTP upload dist/ to VPS:/var/www/app-gox/dist/
3. Nginx serves updated files
```

---

## **Environment Variables**

Set these before deploying:

```bash
export DEPLOY_HOST=157.66.80.125    # VPS IP
export DEPLOY_PORT=22               # SSH port
export VITE_API_URL=...            # Frontend API endpoint
export VITE_PUBLIC_API_URL=...     # Public API endpoint
```

---

## **Verification**

After deployment:

```bash
# 1. Check container status
docker compose ps

# 2. Check logs
docker compose logs -f nginx

# 3. Access in browser
curl https://remote.goxprint.com

# 4. Check Nginx config
docker compose exec nginx nginx -t
```

---

## **Troubleshooting**

### **Issue: "Connection refused"**
- Check VPS IP/port
- Verify SSH key permissions: `chmod 600 ~/.ssh/id_ed25519`
- SSH test: `ssh -v root@157.66.80.125`

### **Issue: "Build failed"**
- Check Node version: `node -v` (need v20+)
- Clear npm cache: `npm cache clean --force`
- Reinstall: `npm ci`

### **Issue: "Nginx not starting"**
- Check Docker logs: `docker compose logs nginx`
- Verify port 80 not in use: `netstat -tuln | grep 80`
- Test Nginx config: `docker compose exec nginx nginx -t`

---

## **Rollback**

To rollback to previous version:

```bash
# View deployment history
docker compose logs --tail 50

# Rebuild previous version
git log --oneline | head -5
git checkout <commit-hash>
bash deploy.sh
```

---

## **Security Notes**

✅ **What's Fixed:**
- ✅ No hard-coded passwords
- ✅ SSH key authentication only
- ✅ Environment variables for secrets
- ✅ nginx caching + compression

⚠️ **What to Do:**
- Never commit `.env` files
- Rotate SSH keys periodically
- Monitor Docker container logs
- Keep dependencies updated: `npm audit fix`

---

## **Build Artifacts**

Build output structure:
```
dist/
├── index.html            # Main entry point
├── assets/
│  ├── index-{hash}.js    # Main JS bundle (hashed)
│  ├── index-{hash}.css   # Main CSS bundle (hashed)
│  └── [other assets]
├── logo.png
└── printer_web_cache_demo.json
```

Hash-based filenames allow 30-day caching without invalidation.

---

## **Contact & Support**

- Repository: `/var/www/app-gox`
- Domain: https://remote.goxprint.com
- Build logs: `docker compose logs -f`
