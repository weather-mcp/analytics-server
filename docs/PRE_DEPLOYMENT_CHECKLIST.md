# Pre-Deployment Checklist

Use this checklist before deploying the Analytics Server to production.

**Deployment Date:** _______________
**Deployed By:** _______________
**Server IP:** _______________
**Domain:** _______________

---

## 📋 Pre-Deployment Requirements

### Infrastructure

- [ ] **VPS Provisioned**
  - Provider: _______________
  - Plan: _______________
  - Region: _______________
  - IP Address: _______________

- [ ] **Domain Configured**
  - Domain: _______________
  - DNS A Record points to VPS IP
  - DNS propagated (check: `nslookup analytics.weather-mcp.dev`)

- [ ] **SSH Access Configured**
  - SSH key generated and added to server
  - Non-root user created: `analytics`
  - Can connect: `ssh analytics@SERVER_IP`

- [ ] **Firewall Configured**
  - Port 22 (SSH) open
  - Port 80 (HTTP) open
  - Port 443 (HTTPS) open
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

- [ ] **SSL Certificate Obtained**
  - Method: [ ] Let's Encrypt [ ] Cloudflare [ ] Other: _______________
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

## 🚀 Deployment Checklist

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
