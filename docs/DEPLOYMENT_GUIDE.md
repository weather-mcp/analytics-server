# Analytics Server Deployment Guide

Complete guide for deploying the Weather MCP Analytics Server to production.

**Target Environment:** Ubuntu 22.04 LTS on a VPS (DigitalOcean, Linode, Hetzner, etc.)
**Minimum Requirements:** 1 GB RAM, 25 GB SSD, 1 vCPU
**Recommended:** 2 GB RAM, 50 GB SSD, 2 vCPUs

---

## 🚀 Choose Your Deployment Strategy

We offer **two deployment strategies** with different security and complexity trade-offs:

### Option A: Cloudflare Tunnel (Recommended) ⭐

**Security-first deployment with zero exposed ports**

- ✅ **No open ports** (80/443) on your server
- ✅ **Automatic DDoS protection** via Cloudflare's edge network
- ✅ **Automatic SSL/TLS** certificate management
- ✅ **Hidden server IP** - attackers can't find your server
- ✅ **Simplified firewall** - only SSH needs to be open
- ⏱️ **Deployment Time:** 1-2 hours

**Best for:** Production deployments, security-conscious users, teams wanting minimal maintenance

**📖 Full Guide:** [CLOUDFLARE_TUNNEL_DEPLOYMENT.md](CLOUDFLARE_TUNNEL_DEPLOYMENT.md)

### Option B: Traditional Nginx Deployment

**Classic reverse proxy setup with manual SSL management**

- ⚠️ Requires **open ports 80/443** on server
- ⚠️ **Manual SSL** certificate management (Let's Encrypt)
- ⚠️ **Public IP exposure** - visible to attackers
- ⚠️ **Complex firewall** rules needed
- ⏱️ **Deployment Time:** 2-3 hours

**Best for:** Users who need direct server access, environments without Cloudflare

**📖 Guide:** This document (below)

---

## 📊 Quick Comparison

| Feature | Cloudflare Tunnel ⭐ | Traditional Nginx |
|---------|---------------------|-------------------|
| Open Ports | SSH only (22) | SSH (22), HTTP (80), HTTPS (443) |
| SSL Setup | Automatic | Manual (certbot) |
| DDoS Protection | Included | Requires separate service |
| IP Exposure | Hidden | Public |
| Firewall Complexity | Minimal (UFW basic) | Extensive (port rules) |
| Maintenance | Low | Medium |
| Setup Time | 1-2 hours | 2-3 hours |
| Recommended | ✅ Yes | For specific use cases |

---

## 🎯 Quick Start Links

- **[Cloudflare Tunnel Deployment →](CLOUDFLARE_TUNNEL_DEPLOYMENT.md)** - Full security-first guide
- **[Environment Configuration →](ENVIRONMENT_CONFIG.md)** - Complete environment variable reference
- **[Traditional Deployment ↓](#table-of-contents)** - Continue reading below for nginx setup

---

## Table of Contents (Traditional Nginx Deployment)

1. [Prerequisites](#prerequisites)
2. [VPS Provisioning](#vps-provisioning)
3. [Initial Server Setup](#initial-server-setup)
4. [Install Dependencies](#install-dependencies)
5. [Clone and Configure Application](#clone-and-configure-application)
6. [Database Setup](#database-setup)
7. [SSL Certificate Setup](#ssl-certificate-setup)
8. [Deploy Application](#deploy-application)
9. [Configure Monitoring](#configure-monitoring)
10. [Verify Deployment](#verify-deployment)
11. [Post-Deployment Tasks](#post-deployment-tasks)
12. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before starting, ensure you have:

- [ ] Domain name configured (e.g., `analytics.weather-mcp.dev`)
- [ ] DNS A record pointing to your VPS IP address
- [ ] SSH key pair for secure access
- [ ] GitHub account with repository access
- [ ] Environment variable values (database passwords, API keys)

---

## VPS Provisioning

### Option 1: DigitalOcean ($6/month Basic Droplet)

1. **Create Droplet:**
   - Navigate to https://cloud.digitalocean.com/droplets/new
   - Choose: Ubuntu 22.04 LTS
   - Plan: Basic ($6/month - 1 GB / 1 vCPU / 25 GB SSD)
   - Region: Choose closest to your users
   - Authentication: SSH keys (upload your public key)
   - Hostname: `analytics-server`

2. **Configure Firewall:**
   ```bash
   # Allow SSH, HTTP, HTTPS
   ufw allow 22/tcp
   ufw allow 80/tcp
   ufw allow 443/tcp
   ufw --force enable
   ```

### Option 2: Hetzner (€4.5/month CX11)

1. **Create Server:**
   - Go to https://console.hetzner.cloud/
   - Create new project: "Weather MCP Analytics"
   - Add server: Ubuntu 22.04, CX11 (2 GB RAM)
   - Add SSH key
   - Create & Start

2. **Configure Firewall:**
   - Similar to DigitalOcean above

### Option 3: Other Providers

Any VPS provider works, ensure:
- Ubuntu 22.04 LTS (or 24.04 LTS)
- At least 1 GB RAM
- Firewall configured for SSH (22), HTTP (80), HTTPS (443)

---

## Initial Server Setup

### 1. Connect to Server

```bash
ssh root@YOUR_SERVER_IP
```

### 2. Update System

```bash
apt-get update && apt-get upgrade -y
```

### 3. Create Non-Root User

```bash
# Create user
adduser analytics
usermod -aG sudo analytics

# Copy SSH keys
mkdir -p /home/analytics/.ssh
cp /root/.ssh/authorized_keys /home/analytics/.ssh/
chown -R analytics:analytics /home/analytics/.ssh
chmod 700 /home/analytics/.ssh
chmod 600 /home/analytics/.ssh/authorized_keys

# Test connection (from local machine)
ssh analytics@YOUR_SERVER_IP
```

### 4. Configure Firewall

```bash
# If not already done
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

### 5. Set Hostname

```bash
sudo hostnamectl set-hostname analytics-server
```

---

## Install Dependencies

### 1. Install Docker

```bash
# Remove old versions
sudo apt-get remove docker docker-engine docker.io containerd runc

# Install prerequisites
sudo apt-get update
sudo apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# Add Docker's official GPG key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Set up repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Verify installation
sudo docker run hello-world

# Add user to docker group
sudo usermod -aG docker analytics
newgrp docker  # Apply group membership without logout

# Verify non-root access
docker ps
```

### 2. Install Docker Compose (if not included)

```bash
# Check if docker compose is available
docker compose version

# If not, install manually
sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
docker-compose --version
```

### 3. Install PostgreSQL Client (for scripts)

```bash
sudo apt-get install -y postgresql-client
```

### 4. Install Redis Client (for health checks)

```bash
sudo apt-get install -y redis-tools
```

---

## Clone and Configure Application

### 1. Clone Repository

```bash
cd /home/analytics
git clone https://github.com/weather-mcp/analytics-server.git
cd analytics-server
```

### 2. Create Production Environment File

```bash
cp .env.example .env
nano .env
```

**Configure the following variables:**

```bash
# Server Configuration
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Redis Configuration
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=YOUR_STRONG_REDIS_PASSWORD  # Generate with: openssl rand -base64 32
REDIS_DB=0

# PostgreSQL Configuration
DB_HOST=postgres
DB_PORT=5432
DB_NAME=analytics
DB_USER=analytics
DB_PASSWORD=YOUR_STRONG_DB_PASSWORD  # Generate with: openssl rand -base64 32
DB_MAX_CONNECTIONS=20
DB_IDLE_TIMEOUT_MS=30000

# Queue Configuration
QUEUE_KEY=analytics:events
MAX_QUEUE_SIZE=10000
WORKER_POLL_INTERVAL_MS=1000
WORKER_BATCH_SIZE=100

# API Configuration
API_BODY_LIMIT_KB=100
RATE_LIMIT_PER_MINUTE=60
MAX_BATCH_SIZE=100

# Cache Configuration
CACHE_TTL_SECONDS=300
CACHE_ENABLED=true

# Security
TRUST_PROXY=true
CORS_ORIGIN=https://weather-mcp.dev,https://analytics.weather-mcp.dev

# Data Retention
RAW_EVENTS_RETENTION_DAYS=90
DAILY_AGGREGATIONS_RETENTION_DAYS=730
HOURLY_AGGREGATIONS_RETENTION_DAYS=30
```

**Generate secure passwords:**

```bash
# Generate database password
openssl rand -base64 32

# Generate Redis password
openssl rand -base64 32
```

### 3. Update Nginx Configuration

```bash
nano nginx/conf.d/analytics.conf
```

Update `server_name` to your actual domain:
```nginx
server_name analytics.weather-mcp.dev;  # Change this to your domain
```

### 4. Set File Permissions

```bash
chmod 600 .env
chmod +x scripts/*.sh
```

---

## Database Setup

### 1. Start Database Container

```bash
# Start PostgreSQL and Redis only
docker compose up -d postgres redis

# Wait for services to be healthy (30 seconds)
sleep 30

# Check status
docker compose ps
```

### 2. Initialize Database

```bash
# Run initialization script
./scripts/init-db.sh

# Verify tables were created
docker compose exec postgres psql -U analytics -d analytics -c "\dt"
```

Expected output:
```
              List of relations
 Schema |         Name          | Type  |   Owner
--------+-----------------------+-------+-----------
 public | daily_aggregations    | table | analytics
 public | error_summary         | table | analytics
 public | events                | table | analytics
 public | hourly_aggregations   | table | analytics
 public | system_metadata       | table | analytics
```

---

## SSL Certificate Setup

### Option 1: Let's Encrypt (Recommended)

#### Step 1: Install Certbot

```bash
sudo apt-get install -y certbot
```

#### Step 2: Obtain Certificate (Standalone Method)

**Note:** Stop any web server on ports 80/443 first.

```bash
# Stop nginx if running
docker compose stop nginx

# Obtain certificate
sudo certbot certonly --standalone \
  -d analytics.weather-mcp.dev \
  --email your-email@example.com \
  --agree-tos \
  --no-eff-email

# Certificates will be saved to:
# /etc/letsencrypt/live/analytics.weather-mcp.dev/
```

#### Step 3: Copy Certificates

```bash
# Create SSL directory
mkdir -p nginx/ssl

# Copy certificates
sudo cp /etc/letsencrypt/live/analytics.weather-mcp.dev/fullchain.pem nginx/ssl/
sudo cp /etc/letsencrypt/live/analytics.weather-mcp.dev/privkey.pem nginx/ssl/
sudo cp /etc/letsencrypt/live/analytics.weather-mcp.dev/chain.pem nginx/ssl/

# Set permissions
sudo chown analytics:analytics nginx/ssl/*.pem
sudo chmod 644 nginx/ssl/fullchain.pem nginx/ssl/chain.pem
sudo chmod 600 nginx/ssl/privkey.pem
```

#### Step 4: Set Up Auto-Renewal

```bash
# Test renewal
sudo certbot renew --dry-run

# Create renewal script
sudo nano /etc/cron.daily/certbot-renew
```

Add the following:
```bash
#!/bin/bash
certbot renew --quiet --post-hook "cd /home/analytics/analytics-server && docker compose restart nginx"
```

```bash
# Make executable
sudo chmod +x /etc/cron.daily/certbot-renew
```

### Option 2: Cloudflare Origin Certificate

See `nginx/ssl/README.md` for detailed instructions.

---

## Deploy Application

### 1. Build and Start Services

```bash
cd /home/analytics/analytics-server

# Build images
docker compose -f docker-compose.yml -f docker-compose.prod.yml build

# Start all services
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# View logs
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f
```

### 2. Verify Services

```bash
# Check container status
docker compose ps

# All containers should be "Up" and "healthy"
# Expected containers:
# - analytics-postgres (healthy)
# - analytics-redis (healthy)
# - analytics-api (running)
# - analytics-worker (running)
# - analytics-nginx (running)
```

### 3. Test Endpoints

```bash
# Test health endpoint
curl https://analytics.weather-mcp.dev/v1/health

# Expected response:
# {"status":"healthy","timestamp":"2025-01-13T...","uptime":...}

# Test stats endpoint
curl https://analytics.weather-mcp.dev/v1/stats/overview

# Should return JSON with statistics (empty if no data yet)
```

---

## Configure Monitoring

### 1. Set Up Automated Backups

```bash
# Run cron setup script
sudo ./scripts/setup-cron.sh

# Follow prompts to configure:
# - Backup schedule (default: daily at 2 AM)
# - Health check schedule (default: every 5 minutes)
# - Backup directory
```

### 2. Verify Cron Jobs

```bash
# View scheduled tasks
crontab -l

# Should see entries for:
# - backup-db.sh
# - health-check.sh
```

### 3. Test Backup Manually

```bash
# Create backup directory
mkdir -p backups

# Run backup
./scripts/backup-db.sh backups

# Verify backup was created
ls -lh backups/
```

### 4. Test Health Check

```bash
# Run health check
./scripts/health-check.sh

# Should show all services as healthy
```

---

## Verify Deployment

### Checklist

- [ ] All Docker containers running and healthy
- [ ] Database initialized with correct schema
- [ ] API accessible via HTTPS
- [ ] SSL certificate valid (check at https://www.ssllabs.com/ssltest/)
- [ ] Health endpoint returns 200 OK
- [ ] Stats endpoints return valid JSON
- [ ] CORS headers present (check in browser DevTools)
- [ ] Rate limiting working (test with multiple requests)
- [ ] Logs being written correctly
- [ ] Automated backups configured
- [ ] Health checks running

### Security Audit

```bash
# Check open ports
sudo netmap -tuln

# Should only see:
# - 22 (SSH)
# - 80 (HTTP - redirects to HTTPS)
# - 443 (HTTPS)

# Verify internal services not exposed
# PostgreSQL (5432) and Redis (6379) should NOT be in the list
```

### Performance Test

```bash
# Simple load test with curl
for i in {1..100}; do
  curl -s -o /dev/null -w "%{http_code} - %{time_total}s\n" \
    https://analytics.weather-mcp.dev/v1/health
done

# All requests should return 200
# Response times should be < 0.1s
```

---

## Post-Deployment Tasks

### 1. Configure Cloudflare (Optional but Recommended)

If using Cloudflare:

1. **Add Site to Cloudflare:**
   - Go to Cloudflare dashboard
   - Add your domain
   - Update nameservers at your registrar

2. **Configure SSL/TLS:**
   - SSL/TLS → Overview → Set to "Full (strict)"
   - Edge Certificates → Always Use HTTPS: On
   - Edge Certificates → Minimum TLS Version: 1.2

3. **Configure Security:**
   - Security → Settings → Security Level: Medium
   - Security → Settings → Challenge Passage: 30 minutes
   - Firewall → Rate Limiting → Add rule for /v1/events

### 2. Set Up Monitoring Alerts

Create monitoring alerts for:
- Server down (health check fails)
- Disk space > 80%
- Memory usage > 90%
- Certificate expiration < 30 days
- Backup failure

### 3. Document Credentials

Store the following securely (use password manager):
- VPS root password / SSH key
- Database password
- Redis password
- SSL certificate information
- Cloudflare API keys (if applicable)

### 4. Update Weather MCP Server

Update the Weather MCP server configuration to send analytics to your new server:

```bash
# In weather-mcp/.env
ANALYTICS_ENABLED=true
ANALYTICS_URL=https://analytics.weather-mcp.dev/v1/events
ANALYTICS_LEVEL=minimal  # or standard, detailed
```

---

## Troubleshooting

### Issue: Containers Won't Start

**Symptoms:** `docker compose ps` shows containers as "Exited"

**Solutions:**

1. **Check logs:**
   ```bash
   docker compose logs api
   docker compose logs worker
   docker compose logs postgres
   ```

2. **Check environment variables:**
   ```bash
   docker compose config
   # Verify all variables are set correctly
   ```

3. **Check disk space:**
   ```bash
   df -h
   # Ensure you have at least 10% free
   ```

### Issue: Database Connection Failures

**Symptoms:** API logs show "Cannot connect to database"

**Solutions:**

1. **Verify PostgreSQL is running:**
   ```bash
   docker compose ps postgres
   # Should be "Up" and "healthy"
   ```

2. **Check credentials:**
   ```bash
   # Test connection manually
   docker compose exec postgres psql -U analytics -d analytics -c "SELECT 1"
   ```

3. **Check network:**
   ```bash
   docker network ls
   docker network inspect analytics-network-prod
   ```

### Issue: SSL Certificate Errors

**Symptoms:** Browser shows "Not Secure" or certificate warnings

**Solutions:**

1. **Verify certificate files exist:**
   ```bash
   ls -la nginx/ssl/
   # Should see fullchain.pem, privkey.pem, chain.pem
   ```

2. **Check certificate validity:**
   ```bash
   openssl x509 -in nginx/ssl/fullchain.pem -text -noout | grep "Not After"
   ```

3. **Verify Nginx can read certificates:**
   ```bash
   docker compose exec nginx ls -la /etc/nginx/ssl/
   ```

4. **Test SSL configuration:**
   ```bash
   docker compose exec nginx nginx -t
   ```

### Issue: High Memory Usage

**Symptoms:** Server becomes slow or unresponsive

**Solutions:**

1. **Check memory usage:**
   ```bash
   free -h
   docker stats
   ```

2. **Restart services if needed:**
   ```bash
   docker compose restart
   ```

3. **Adjust resource limits in docker-compose.prod.yml**

### Issue: Backup Failures

**Symptoms:** No backups being created or backup logs show errors

**Solutions:**

1. **Check backup logs:**
   ```bash
   tail -f logs/backup.log
   ```

2. **Run backup manually:**
   ```bash
   ./scripts/backup-db.sh backups
   ```

3. **Check disk space for backups:**
   ```bash
   df -h backups/
   ```

4. **Verify cron is running:**
   ```bash
   sudo systemctl status cron
   ```

---

## Maintenance Commands

### Update Application

```bash
cd /home/analytics/analytics-server

# Pull latest changes
git pull

# Rebuild and restart
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f api
docker compose logs -f worker

# Last 100 lines
docker compose logs --tail=100 api
```

### Restart Services

```bash
# Restart all
docker compose restart

# Restart specific service
docker compose restart api
docker compose restart worker
```

### Database Backup

```bash
# Manual backup
./scripts/backup-db.sh backups

# List backups
ls -lh backups/

# Restore from backup
./scripts/restore-db.sh backups/analytics_backup_YYYYMMDD_HHMMSS.sql.gz
```

### Clean Up

```bash
# Remove old Docker images
docker image prune -a

# Remove unused volumes
docker volume prune

# Remove old backups (keep last 7 days)
find backups/ -name "analytics_backup_*.sql.gz" -type f -mtime +7 -delete
```

---

## Support and Resources

- **Project Documentation:** https://github.com/weather-mcp/analytics-server
- **Docker Documentation:** https://docs.docker.com/
- **PostgreSQL Documentation:** https://www.postgresql.org/docs/
- **TimescaleDB Documentation:** https://docs.timescale.com/
- **Nginx Documentation:** https://nginx.org/en/docs/
- **Let's Encrypt Documentation:** https://letsencrypt.org/docs/

---

**Deployment Guide Version:** 1.0
**Last Updated:** 2025-01-13
**Minimum Server Requirements:** 1 GB RAM, 25 GB SSD
**Recommended Server Requirements:** 2 GB RAM, 50 GB SSD
