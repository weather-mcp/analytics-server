# Pre-Deployment Checklist

Use this checklist before deploying the Analytics Server to production.

**Deployment Date:** _______________
**Deployed By:** _______________
**Server IP:** _______________
**Domain:** _______________
**Deployment Method:** [ ] Cloudflare Tunnel (Recommended) [ ] Traditional Nginx

---

## 🚀 Deployment Method Selection

**Choose your deployment strategy before proceeding:**

### Option A: Cloudflare Tunnel (Recommended) ⭐
- ✅ Maximum security (no exposed ports)
- ✅ Automatic SSL/TLS
- ✅ DDoS protection included
- ✅ Simplified setup (1-2 hours)
- **Full Guide:** [CLOUDFLARE_TUNNEL_DEPLOYMENT.md](CLOUDFLARE_TUNNEL_DEPLOYMENT.md)
- **Use Section:** [Cloudflare Tunnel Deployment Checklist](#cloudflare-tunnel-deployment-checklist)

### Option B: Traditional Nginx
- Manual SSL management
- Open ports 80/443 required
- More complex setup (2-3 hours)
- **Full Guide:** [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
- **Use Section:** [Traditional Deployment Checklist](#traditional-deployment-checklist)

---

## 📋 Pre-Deployment Requirements (All Methods)

### Infrastructure

- [ ] **VPS Provisioned**
  - Provider: _______________
  - Plan: _______________
  - Region: _______________
  - IP Address: _______________

- [ ] **Domain Configured**
  - Domain: _______________
  - DNS managed by Cloudflare (if using Cloudflare Tunnel)
  - DNS A Record points to VPS IP (if using Traditional)
  - DNS propagated (check: `nslookup analytics.weather-mcp.dev`)

- [ ] **Cloudflare Account** (if using Cloudflare Tunnel)
  - Cloudflare account created
  - Domain added to Cloudflare
  - Nameservers updated to Cloudflare
  - Cloudflare DNS active

- [ ] **SSH Access Configured**
  - SSH key generated and added to server
  - Non-root user created: `analytics`
  - Can connect: `ssh analytics@SERVER_IP`
  - Your local IP address noted: _______________

- [ ] **Firewall Configured**
  - **Cloudflare Tunnel:** Only port 22 (SSH) open
  - **Traditional:** Ports 22 (SSH), 80 (HTTP), 443 (HTTPS) open
  - PostgreSQL (5432) NOT exposed publicly
  - Redis (6379) NOT exposed publicly

### Environment Configuration

- [ ] **Environment Variables Prepared**
  - Database password generated (32+ characters)
  - Redis password generated (32+ characters)
  - CORS origins configured
  - All required variables documented in `.env`

- [ ] **Secrets Stored Securely**
  - Passwords stored in password manager
  - Backup of `.env` file in secure location
  - SSH private key backed up securely

### Code & Dependencies

- [ ] **Repository Cloned**
  - Latest code pulled from GitHub
  - On correct branch (main/production)
  - `.env` file created and configured

- [ ] **Dependencies Installed on Server**
  - Docker installed and running
  - Docker Compose installed
  - PostgreSQL client installed
  - Redis client installed (redis-tools)

### SSL Certificates

**Cloudflare Tunnel:** ✅ SSL managed automatically by Cloudflare (skip this section)

**Traditional Deployment:**
- [ ] **SSL Certificate Obtained**
  - Method: [ ] Let's Encrypt [ ] Cloudflare Origin [ ] Other: _______________
  - Certificate files in `nginx/ssl/`
  - `fullchain.pem` present
  - `privkey.pem` present (permissions 600)
  - `chain.pem` present
  - Certificate valid for domain
  - Certificate expiration date: _______________
  - Auto-renewal configured

### Testing

- [ ] **Local Testing Complete**
  - All 266 tests passing
  - No TypeScript errors
  - No security vulnerabilities (`npm audit`)
  - Docker images build successfully
  - Services start without errors

- [ ] **Configuration Validated**
  - `.env` file has no syntax errors
  - Database credentials tested
  - Redis connection tested
  - Nginx configuration validated (`nginx -t`)

---

## 🚀 Cloudflare Tunnel Deployment Checklist

**Use this checklist if deploying with Cloudflare Tunnel (Recommended)**

See [CLOUDFLARE_TUNNEL_DEPLOYMENT.md](CLOUDFLARE_TUNNEL_DEPLOYMENT.md) for detailed instructions.

### Phase 1: Initial Server Setup

- [ ] Connect to server via SSH
- [ ] Update system packages (`apt-get update && upgrade`)
- [ ] Install Node.js 20.x
- [ ] Install Docker and Docker Compose
- [ ] Clone repository to `/opt/weather-mcp/analytics-server`
- [ ] Create and configure `.env` file (HOST=127.0.0.1)
- [ ] Set file permissions (`chmod 600 .env`)

### Phase 2: Firewall Configuration

- [ ] Run firewall setup script: `sudo ./scripts/setup-firewall.sh YOUR_IP`
- [ ] Verify SSH still works from your IP
- [ ] Confirm only port 22 is open (`sudo ufw status`)
- [ ] Verify ports 80/443 are CLOSED (Cloudflare Tunnel will handle)

### Phase 3: Infrastructure Services

- [ ] Start PostgreSQL and Redis: `docker-compose up -d postgres redis`
- [ ] Wait for services to be healthy
- [ ] Run database initialization: `npm run db:init`
- [ ] Verify tables created (5 tables expected)
- [ ] Verify TimescaleDB extension enabled

### Phase 4: Cloudflare Tunnel Setup

- [ ] Run tunnel setup script: `sudo ./scripts/setup-cloudflare-tunnel.sh`
- [ ] Authenticate with Cloudflare (browser window)
- [ ] Verify tunnel created: `cloudflared tunnel list`
- [ ] Verify DNS configured: `dig analytics.weather-mcp.dev`
- [ ] Check tunnel service running: `sudo systemctl status cloudflared`
- [ ] View tunnel logs: `sudo journalctl -u cloudflared -n 50`

### Phase 5: Application Deployment

- [ ] Install dependencies: `npm install`
- [ ] Build application: `npm run build`
- [ ] Create systemd service for API (see deployment guide)
- [ ] Create systemd service for worker (see deployment guide)
- [ ] Start API service: `sudo systemctl start analytics-api`
- [ ] Start worker service: `sudo systemctl start analytics-worker`
- [ ] Enable services on boot: `sudo systemctl enable analytics-api analytics-worker`

### Phase 6: Verification

- [ ] Health endpoint accessible: `curl https://analytics.weather-mcp.dev/health`
- [ ] API returns valid JSON
- [ ] Stats endpoints working
- [ ] SSL certificate valid (check in browser - should show Cloudflare cert)
- [ ] No errors in API logs: `sudo journalctl -u analytics-api -n 50`
- [ ] No errors in worker logs: `sudo journalctl -u analytics-worker -n 50`
- [ ] No errors in tunnel logs: `sudo journalctl -u cloudflared -n 50`
- [ ] Rate limiting working (test with rapid requests)
- [ ] CORS headers present

### Phase 7: Monitoring Setup

- [ ] Start Prometheus: `docker-compose up -d prometheus`
- [ ] Start Grafana: `docker-compose up -d grafana`
- [ ] Configure Grafana dashboards (optional - for ops monitoring)
- [ ] Verify metrics endpoint: `curl http://localhost:9090/metrics`
- [ ] Set up health check monitoring in Cloudflare dashboard

### Phase 8: Post-Deployment

- [ ] Monitor logs for first hour
- [ ] Test all API endpoints
- [ ] Verify data being written to database
- [ ] Check worker processing queue
- [ ] Monitor resource usage (CPU, RAM, disk)
- [ ] Test from multiple locations
- [ ] Document deployment details

**Cloudflare Tunnel Deployment Complete!** ✅

---

## 🚀 Traditional Deployment Checklist

**Use this checklist if deploying with Traditional Nginx setup**

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for detailed instructions.

### Phase 1: Infrastructure Setup

- [ ] Connect to server via SSH
- [ ] Update system packages (`apt-get update && upgrade`)
- [ ] Configure firewall (ufw)
- [ ] Install Docker and Docker Compose
- [ ] Install PostgreSQL client
- [ ] Install Redis client

### Phase 2: Application Setup

- [ ] Clone repository to `/home/analytics/analytics-server`
- [ ] Create and configure `.env` file
- [ ] Set file permissions (`chmod 600 .env`)
- [ ] Make scripts executable (`chmod +x scripts/*.sh`)
- [ ] Update Nginx config with correct domain name

### Phase 3: Database Initialization

- [ ] Start PostgreSQL and Redis containers
- [ ] Wait for services to be healthy (check with `docker compose ps`)
- [ ] Run database initialization script (`./scripts/init-db.sh`)
- [ ] Verify tables created (5 tables expected)
- [ ] Verify TimescaleDB extension enabled

### Phase 4: SSL Setup

- [ ] Install Certbot (if using Let's Encrypt)
- [ ] Obtain SSL certificate
- [ ] Copy certificates to `nginx/ssl/`
- [ ] Set correct permissions (644 for certs, 600 for key)
- [ ] Configure auto-renewal
- [ ] Test renewal (`certbot renew --dry-run`)

### Phase 5: Application Deployment

- [ ] Build Docker images
- [ ] Start all services with production config
- [ ] Verify all containers running (`docker compose ps`)
- [ ] Check logs for errors (`docker compose logs`)

### Phase 6: Verification

- [ ] Health endpoint accessible (`curl https://domain/v1/health`)
- [ ] Stats endpoints return valid JSON
- [ ] SSL certificate valid (check in browser)
- [ ] SSL Labs grade A or A+ (https://www.ssllabs.com/ssltest/)
- [ ] CORS headers present
- [ ] Rate limiting working (test with multiple requests)

### Phase 7: Monitoring Setup

- [ ] Configure automated backups (`./scripts/setup-cron.sh`)
- [ ] Verify cron jobs scheduled (`crontab -l`)
- [ ] Test manual backup (`./scripts/backup-db.sh backups`)
- [ ] Test health check script (`./scripts/health-check.sh`)
- [ ] Create logs directory with correct permissions

---

## 🔒 Security Checklist

- [ ] **Server Hardening**
  - SSH password authentication disabled
  - Root login disabled
  - Fail2ban installed (optional but recommended)
  - Unattended upgrades configured

- [ ] **Application Security**
  - No secrets in code or git history
  - Strong database password (32+ characters)
  - Strong Redis password (32+ characters)
  - CORS configured with specific origins (not *)
  - Rate limiting configured (60 req/min)
  - Request size limits configured (100 KB)
  - Trust proxy enabled in production

- [ ] **Network Security**
  - PostgreSQL not exposed to public internet
  - Redis not exposed to public internet
  - Firewall configured correctly
  - TLS 1.2+ only (no TLS 1.0/1.1)
  - HSTS header enabled

- [ ] **Data Privacy**
  - No IP address logging verified
  - PII detection enabled
  - Anonymous logging configured
  - Privacy policy documented

---

## 📊 Monitoring Checklist

- [ ] **Health Checks**
  - Automated health checks configured (every 5 minutes)
  - Health check logs being written
  - Health endpoint accessible

- [ ] **Backups**
  - Automated backups configured (daily at 2 AM)
  - Backup directory created with correct permissions
  - Backup logs being written
  - Backup retention configured (7 days)
  - Test restore completed successfully

- [ ] **Logging**
  - Application logs being written
  - Log rotation configured (logrotate)
  - Log directory has correct permissions
  - Logs contain no sensitive information

- [ ] **Alerts** (if configured)
  - Server down alerts
  - Disk space alerts (>80%)
  - Certificate expiration alerts (<30 days)
  - Backup failure alerts

---

## 🔄 Post-Deployment Checklist

### Immediate (0-24 hours)

- [ ] Monitor logs continuously for first hour
- [ ] Test all API endpoints
- [ ] Verify data is being written to database
- [ ] Check worker is processing queue
- [ ] Monitor resource usage (CPU, RAM, disk)
- [ ] Test from multiple geographic locations
- [ ] Verify website can consume API

### First Week

- [ ] Check daily backup success
- [ ] Monitor error rates
- [ ] Review performance metrics
- [ ] Check queue depth (should be low)
- [ ] Verify disk space usage is reasonable
- [ ] Test health check alerts

### First Month

- [ ] Review resource usage trends
- [ ] Optimize if needed (cache settings, indexes)
- [ ] Review and adjust retention policies
- [ ] Check backup size growth
- [ ] Verify certificate auto-renewal works

---

## 📝 Documentation Checklist

- [ ] **Deployment documented**
  - Server details recorded
  - Credentials stored securely
  - Network diagram created (optional)

- [ ] **Runbooks created**
  - Restart procedure
  - Backup and restore procedure
  - Update procedure
  - Rollback procedure
  - Incident response procedure

- [ ] **Team notified**
  - Deployment announcement sent
  - Documentation shared
  - Access credentials distributed securely

---

## 🆘 Emergency Contacts

**On-Call Engineer:** _______________
**Phone:** _______________
**Email:** _______________

**Backup Contact:** _______________
**Phone:** _______________
**Email:** _______________

**VPS Provider Support:**
- Provider: _______________
- Support URL: _______________
- Account ID: _______________

---

## 📞 Troubleshooting Quick Reference

| Issue | Quick Fix | Full Documentation |
|-------|-----------|-------------------|
| Containers won't start | `docker compose logs` | DEPLOYMENT_GUIDE.md |
| Database connection fails | Check `.env` credentials | DEPLOYMENT_GUIDE.md |
| SSL certificate error | Check cert files in `nginx/ssl/` | nginx/ssl/README.md |
| High memory usage | `docker stats`, restart if needed | DEPLOYMENT_GUIDE.md |
| Backup fails | Check disk space, run manually | scripts/backup-db.sh |

---

## ✅ Sign-Off

**Deployment Completed:** [ ] Yes [ ] No

**Date:** _______________

**Deployed By:** _______________

**Approved By:** _______________

**Notes:**

_____________________________________________________________

_____________________________________________________________

_____________________________________________________________

---

**Checklist Version:** 1.0
**Last Updated:** 2025-01-13
