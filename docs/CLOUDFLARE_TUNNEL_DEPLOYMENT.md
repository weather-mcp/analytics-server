# Cloudflare Tunnel Deployment Guide

Complete guide for deploying the Weather MCP Analytics Server using Cloudflare Tunnel for secure, zero-trust access.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Deployment Steps](#deployment-steps)
- [Configuration](#configuration)
- [Testing](#testing)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)
- [Maintenance](#maintenance)

## Overview

This deployment strategy uses **Cloudflare Tunnel** to provide secure access to the Analytics API without exposing any ports to the internet. This offers significant security advantages:

✅ **No open ports** (80/443) on the server
✅ **DDoS protection** at Cloudflare's edge
✅ **Automatic SSL/TLS** management
✅ **No direct IP exposure** - attackers can't find your server
✅ **Outbound-only connections** - no inbound firewall rules needed
✅ **Free for unlimited bandwidth**

## Architecture

```
┌─────────┐
│  User   │
└────┬────┘
     │
     ▼
┌─────────────────┐
│   Cloudflare    │  ← DDoS protection, SSL, CDN
│   Edge Network  │
└────┬────────────┘
     │ (encrypted tunnel)
     ▼
┌─────────────────┐
│ Cloudflare      │  ← Runs on your server
│ Tunnel Daemon   │     (outbound connection only)
└────┬────────────┘
     │ (localhost)
     ▼
┌─────────────────┐
│  Nginx (opt.)   │  ← Optional: reverse proxy
└────┬────────────┘     Rate limiting, caching
     │ (localhost)
     ▼
┌─────────────────┐
│  Analytics API  │  ← Node.js/Fastify
│  (Port 3000)    │     PostgreSQL, Redis
└─────────────────┘
```

### Traffic Flow

1. **User** makes request to `https://analytics.weather-mcp.dev`
2. **Cloudflare Edge** receives request (DDoS protection, SSL termination)
3. **Cloudflare Tunnel** forwards to server via encrypted connection
4. **Local Nginx** (optional) handles rate limiting and routing
5. **Analytics API** processes request and returns response

### No Open Ports

```
Digital Ocean Droplet Firewall:
├─ Port 22 (SSH):    ✓ Open (restricted to your IP)
├─ Port 3000 (API):  ✗ Closed (localhost only)
├─ Port 5432 (PG):   ✗ Closed (localhost only)
├─ Port 6379 (Redis):✗ Closed (localhost only)
└─ Port 80/443:      ✗ Closed (Cloudflare Tunnel handles)
```

## Prerequisites

### Required

- [ ] **Digital Ocean Droplet** (or any VPS)
  - Ubuntu 22.04 LTS or later
  - Minimum: 1 CPU, 2GB RAM
  - Root or sudo access

- [ ] **Cloudflare Account** (free tier is fine)
  - Domain added to Cloudflare
  - DNS managed by Cloudflare

- [ ] **Domain Name**
  - Registered domain (e.g., `weather-mcp.dev`)
  - Nameservers pointing to Cloudflare

### Recommended

- [ ] Static IP address for your local machine (for SSH restriction)
- [ ] Monitoring setup (Prometheus, Grafana)
- [ ] Backup strategy for PostgreSQL

## Deployment Steps

### Step 1: Initial Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install essential packages
sudo apt install -y curl wget git build-essential

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should be v20.x
npm --version   # Should be v10.x
```

### Step 2: Clone and Setup Application

```bash
# Create application directory
sudo mkdir -p /opt/weather-mcp
sudo chown $USER:$USER /opt/weather-mcp

# Clone repository
cd /opt/weather-mcp
git clone https://github.com/weather-mcp/analytics-server.git
cd analytics-server

# Install dependencies
npm install

# Build TypeScript
npm run build
```

### Step 3: Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit environment variables
nano .env
```

**Required variables:**

```bash
# Server Configuration
NODE_ENV=production
PORT=3000
HOST=127.0.0.1  # Localhost only!

# Database
DATABASE_URL=postgresql://analytics:your-password@localhost:5432/analytics
REDIS_URL=redis://localhost:6379

# Security
RATE_LIMIT_MAX=60  # Requests per window
RATE_LIMIT_WINDOW=60000  # 1 minute
```

See [Environment Configuration Guide](#environment-configuration-guide) for all options.

### Step 4: Setup Infrastructure

```bash
# Start PostgreSQL and Redis using Docker Compose
cd /opt/weather-mcp/analytics-server
docker-compose up -d postgres redis

# Wait for services to be ready
sleep 10

# Initialize database
npm run db:init

# Verify database connection
npm run db:test
```

### Step 5: Configure Firewall

```bash
# Run automated firewall setup
cd /opt/weather-mcp/analytics-server
sudo ./scripts/setup-firewall.sh YOUR_IP_ADDRESS

# Example:
# sudo ./scripts/setup-firewall.sh 203.0.113.42
```

**What this does:**
- Blocks all incoming traffic by default
- Allows SSH only from your IP
- Allows outbound traffic
- Applies rate limiting to SSH

**Verify SSH access immediately!** Open a new terminal and test:
```bash
ssh user@your-droplet-ip
```

### Step 6: Install Cloudflare Tunnel

```bash
# Run automated Cloudflare Tunnel setup
cd /opt/weather-mcp/analytics-server
sudo ./scripts/setup-cloudflare-tunnel.sh
```

**This script will:**
1. Install `cloudflared` package
2. Open browser for Cloudflare authentication
3. Create a new tunnel named `weather-mcp-analytics`
4. Configure DNS routing for `analytics.weather-mcp.dev`
5. Install tunnel as a systemd service
6. Start the tunnel automatically

**Manual steps during script:**
- Authenticate in browser when prompted
- Select your Cloudflare account/domain

### Step 7: Setup Application Service

Create systemd service for the API:

```bash
sudo nano /etc/systemd/system/analytics-api.service
```

Add the following:

```ini
[Unit]
Description=Weather MCP Analytics API
After=network.target postgresql.service redis.service
Wants=postgresql.service redis.service

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/opt/weather-mcp/analytics-server
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/api/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=analytics-api

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/weather-mcp/analytics-server

[Install]
WantedBy=multi-user.target
```

Replace `YOUR_USERNAME` with your actual username.

Enable and start:

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable analytics-api

# Start service
sudo systemctl start analytics-api

# Check status
sudo systemctl status analytics-api
```

### Step 8: Setup Worker Service

Create systemd service for the background worker:

```bash
sudo nano /etc/systemd/system/analytics-worker.service
```

```ini
[Unit]
Description=Weather MCP Analytics Worker
After=network.target postgresql.service redis.service
Wants=postgresql.service redis.service

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/opt/weather-mcp/analytics-server
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/worker/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=analytics-worker

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/weather-mcp/analytics-server

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable analytics-worker
sudo systemctl start analytics-worker
sudo systemctl status analytics-worker
```

### Step 9: Optional - Setup Nginx

If you want an additional layer between Cloudflare Tunnel and your API:

```bash
# Install Nginx
sudo apt install -y nginx

# Copy configuration
sudo cp nginx/cloudflare-tunnel.conf /etc/nginx/sites-available/analytics

# Create symbolic link
sudo ln -s /etc/nginx/sites-available/analytics /etc/nginx/sites-enabled/

# Remove default site
sudo rm /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

**Update Cloudflare Tunnel config** to point to Nginx:

```bash
nano ~/.cloudflared/config.yml
```

Change service from `http://localhost:3000` to `http://localhost:8080`

```yaml
ingress:
  - hostname: analytics.weather-mcp.dev
    service: http://localhost:8080  # Nginx port
```

Restart tunnel:
```bash
sudo systemctl restart cloudflared
```

## Configuration

### Cloudflare Tunnel Configuration

Location: `~/.cloudflared/config.yml`

```yaml
tunnel: <YOUR-TUNNEL-ID>
credentials-file: /home/user/.cloudflared/<YOUR-TUNNEL-ID>.json

ingress:
  # Analytics API
  - hostname: analytics.weather-mcp.dev
    service: http://localhost:3000
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
      httpHostHeader: analytics.weather-mcp.dev

  # Catch-all (required)
  - service: http_status:404

loglevel: info
```

### Firewall Rules

View current rules:
```bash
sudo ufw status verbose
```

Example output:
```
Status: active

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW       203.0.113.42  # SSH from trusted IP
Anywhere                   DENY        Anywhere       # Default deny
```

### DNS Configuration

In Cloudflare Dashboard → DNS:

```
Type    Name        Content                      Proxy  TTL
CNAME   analytics   <tunnel-id>.cfargotunnel.com   ✓    Auto
```

The setup script creates this automatically.

## Testing

### 1. Test Health Endpoint

```bash
curl https://analytics.weather-mcp.dev/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-11-15T12:00:00.000Z",
  "services": {
    "database": "connected",
    "redis": "connected"
  }
}
```

### 2. Test Event Collection

```bash
curl -X POST https://analytics.weather-mcp.dev/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "type": "tool_call",
    "timestamp": "2025-11-15T12:00:00.000Z",
    "tool": "get_forecast",
    "duration": 150,
    "success": true
  }'
```

Expected response:
```json
{
  "success": true,
  "message": "Event received"
}
```

### 3. Test Statistics Endpoint

```bash
curl https://analytics.weather-mcp.dev/v1/stats/overview
```

### 4. Test Rate Limiting

```bash
# Make 70 requests rapidly (limit is 60/min)
for i in {1..70}; do
  curl -s https://analytics.weather-mcp.dev/health > /dev/null
  echo "Request $i"
done
```

Should receive 429 (Too Many Requests) after 60 requests.

### 5. Verify Tunnel Status

```bash
# Check tunnel service
sudo systemctl status cloudflared

# View tunnel logs
sudo journalctl -u cloudflared -f

# List active tunnels
cloudflared tunnel list

# Get tunnel info
cloudflared tunnel info weather-mcp-analytics
```

### 6. Check Services

```bash
# API service
sudo systemctl status analytics-api
sudo journalctl -u analytics-api -f

# Worker service
sudo systemctl status analytics-worker
sudo journalctl -u analytics-worker -f

# Database
docker ps | grep postgres

# Redis
docker ps | grep redis
```

## Monitoring

### Service Health

Create a monitoring script:

```bash
nano ~/check-services.sh
```

```bash
#!/bin/bash

echo "=== Service Status ==="
systemctl is-active --quiet cloudflared && echo "✓ Cloudflare Tunnel" || echo "✗ Cloudflare Tunnel"
systemctl is-active --quiet analytics-api && echo "✓ Analytics API" || echo "✗ Analytics API"
systemctl is-active --quiet analytics-worker && echo "✓ Analytics Worker" || echo "✗ Analytics Worker"
docker ps --filter "name=postgres" --format "{{.Status}}" | grep -q "Up" && echo "✓ PostgreSQL" || echo "✗ PostgreSQL"
docker ps --filter "name=redis" --format "{{.Status}}" | grep -q "Up" && echo "✓ Redis" || echo "✗ Redis"

echo ""
echo "=== External Access ==="
curl -s -o /dev/null -w "Analytics API: %{http_code}\n" https://analytics.weather-mcp.dev/health
```

Make executable and run:
```bash
chmod +x ~/check-services.sh
./check-services.sh
```

### Cloudflare Dashboard

Monitor tunnel health in Cloudflare:
1. Go to **Zero Trust** → **Networks** → **Tunnels**
2. Click on `weather-mcp-analytics`
3. View real-time metrics, status, and logs

### Logs

```bash
# Cloudflare Tunnel logs
sudo journalctl -u cloudflared -f

# API logs
sudo journalctl -u analytics-api -f

# Worker logs
sudo journalctl -u analytics-worker -f

# Nginx logs (if using)
sudo tail -f /var/log/nginx/analytics-access.log
sudo tail -f /var/log/nginx/analytics-error.log

# Combined view
sudo journalctl -f -u cloudflared -u analytics-api -u analytics-worker
```

### Metrics (Optional)

If you enabled Prometheus metrics:

```bash
# Nginx metrics
curl http://localhost:9090/metrics

# Application metrics (if implemented)
curl http://localhost:3000/metrics
```

## Troubleshooting

### Tunnel Not Connecting

**Symptoms:** 502 Bad Gateway when accessing `https://analytics.weather-mcp.dev`

**Check:**
```bash
# Is tunnel running?
sudo systemctl status cloudflared

# View tunnel logs
sudo journalctl -u cloudflared -n 50

# Test local API directly
curl http://localhost:3000/health
```

**Solutions:**
- Restart tunnel: `sudo systemctl restart cloudflared`
- Check API is listening: `sudo netstat -tlnp | grep 3000`
- Verify config: `cat ~/.cloudflared/config.yml`

### API Not Responding

**Symptoms:** Tunnel is up, but API returns errors

**Check:**
```bash
# Is API running?
sudo systemctl status analytics-api

# View API logs
sudo journalctl -u analytics-api -n 50

# Check if port is in use
sudo netstat -tlnp | grep 3000
```

**Solutions:**
- Restart API: `sudo systemctl restart analytics-api`
- Check environment: `cat /opt/weather-mcp/analytics-server/.env`
- Verify database: `docker ps | grep postgres`

### Database Connection Failed

**Symptoms:** API can't connect to PostgreSQL

**Check:**
```bash
# Is PostgreSQL running?
docker ps | grep postgres

# Check logs
docker logs postgres

# Test connection
docker exec -it postgres psql -U analytics -d analytics
```

**Solutions:**
- Restart PostgreSQL: `docker-compose restart postgres`
- Check password in `.env` matches `docker-compose.yml`
- Verify port 5432 not in use: `sudo netstat -tlnp | grep 5432`

### SSH Locked Out

**Symptoms:** Can't SSH after firewall setup

**Solutions:**
1. Use **Digital Ocean Console** (web-based terminal)
2. Disable firewall: `sudo ufw disable`
3. Fix rules and re-enable: `sudo ufw enable`

**To add your new IP:**
```bash
sudo ufw allow from NEW_IP_ADDRESS to any port 22
```

### Rate Limiting Issues

**Symptoms:** Getting 429 errors unexpectedly

**Check:**
```bash
# View nginx rate limit settings (if using nginx)
grep limit_req /etc/nginx/sites-enabled/analytics

# Check application rate limits
grep RATE_LIMIT .env
```

**Adjust:**
- Nginx: Edit `/etc/nginx/sites-enabled/analytics`, change `rate=60r/m`
- App: Edit `.env`, change `RATE_LIMIT_MAX=60`
- Restart: `sudo systemctl restart nginx` or `sudo systemctl restart analytics-api`

### Cloudflare Tunnel Authentication Failed

**Symptoms:** Can't login during tunnel setup

**Solutions:**
- Ensure browser can reach Cloudflare
- Try manual login: `cloudflared tunnel login`
- Check cert exists: `ls -la ~/.cloudflared/cert.pem`
- Re-authenticate if cert expired

### High Memory Usage

**Check:**
```bash
# System memory
free -h

# Process memory
htop  # or: top

# Docker container memory
docker stats
```

**Solutions:**
- Adjust Node.js heap: Add `--max-old-space-size=512` to service ExecStart
- Scale down PostgreSQL: Edit `docker-compose.yml`, reduce `shared_buffers`
- Add swap space if needed

## Maintenance

### Updating Cloudflared

```bash
# Download latest
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb

# Install update
sudo dpkg -i cloudflared-linux-amd64.deb

# Restart service
sudo systemctl restart cloudflared
```

### Updating Analytics Server

```bash
cd /opt/weather-mcp/analytics-server

# Pull latest code
git pull origin main

# Install dependencies
npm install

# Rebuild
npm run build

# Run migrations if needed
npm run db:migrate

# Restart services
sudo systemctl restart analytics-api
sudo systemctl restart analytics-worker
```

### Database Backups

```bash
# Backup database
docker exec postgres pg_dump -U analytics analytics > backup-$(date +%Y%m%d).sql

# Restore database
docker exec -i postgres psql -U analytics analytics < backup-20251115.sql
```

### Log Rotation

Systemd journal logs are auto-rotated, but you can configure:

```bash
sudo nano /etc/systemd/journald.conf
```

```ini
[Journal]
SystemMaxUse=500M
MaxRetentionSec=7day
```

Restart journald:
```bash
sudo systemctl restart systemd-journald
```

### SSL Certificate Renewal

**No action needed!** Cloudflare manages SSL certificates automatically.

### Monitoring Cloudflare IP Ranges

Cloudflare IPs change occasionally. Update nginx config:

```bash
# Download latest IPs
curl https://www.cloudflare.com/ips-v4 > /tmp/cf-ips-v4.txt
curl https://www.cloudflare.com/ips-v6 > /tmp/cf-ips-v6.txt

# Update nginx config with new ranges
# (Manual step - update set_real_ip_from directives)

# Test and reload
sudo nginx -t && sudo systemctl reload nginx
```

## Security Best Practices

- [ ] Use strong PostgreSQL password
- [ ] Restrict SSH to specific IP(s)
- [ ] Enable automatic security updates
- [ ] Monitor logs regularly
- [ ] Keep cloudflared updated
- [ ] Review Cloudflare audit logs
- [ ] Use Cloudflare WAF rules
- [ ] Enable Cloudflare rate limiting
- [ ] Set up alerting for service failures
- [ ] Regular database backups

## Additional Resources

- [Cloudflare Tunnel Documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [UFW Documentation](https://help.ubuntu.com/community/UFW)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Systemd Service Documentation](https://www.freedesktop.org/software/systemd/man/systemd.service.html)

## Support

For issues specific to:
- **Analytics Server:** https://github.com/weather-mcp/analytics-server/issues
- **Cloudflare Tunnel:** https://community.cloudflare.com/
- **Digital Ocean:** https://docs.digitalocean.com/

---

**Last Updated:** 2025-11-15
**Version:** 1.0.0
