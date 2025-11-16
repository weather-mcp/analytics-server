# Deployment Guide

Complete guide for deploying the Weather MCP Analytics Server to production.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Local Testing](#local-testing)
- [Digital Ocean Deployment](#digital-ocean-deployment)
- [Post-Deployment](#post-deployment)
- [Security Hardening](#security-hardening)
- [Monitoring Setup](#monitoring-setup)
- [Backup Configuration](#backup-configuration)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required

- Domain name (e.g., `analytics.weather-mcp.dev`)
- Digital Ocean account (or similar VPS provider)
- SSH access to server
- Basic Linux/Docker knowledge

### Recommended

- Cloudflare account (for DDoS protection)
- Email for Let's Encrypt SSL
- Monitoring/alerting setup (optional)

---

## Local Testing

**IMPORTANT**: Test locally before deploying to production!

### 1. Clone and Configure

```bash
git clone https://github.com/weather-mcp/analytics-server.git
cd analytics-server

# Create environment file
cp .env.example .env
nano .env
```

### 2. Start All Services

```bash
# Build and start
docker-compose up -d

# Check logs
docker-compose logs -f

# Verify all services are healthy
docker-compose ps
```

### 3. Verify Functionality

```bash
# Check API health
curl http://localhost:3000/v1/health

# Test event ingestion
curl -X POST http://localhost:3000/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "events": [{
      "version": "1.0.0",
      "tool": "test",
      "status": "success",
      "timestamp_hour": "2025-11-12T20:00:00Z",
      "analytics_level": "minimal"
    }]
  }'

# Check statistics
curl http://localhost:3000/v1/stats/overview

# View dashboard
open http://localhost:5173

# Check Prometheus metrics
curl http://localhost:3000/metrics
```

### 4. Run Tests

```bash
# Install dependencies
npm install

# Run tests (requires infrastructure running)
npm test

# All tests should pass
```

### 5. Clean Up

```bash
# Stop services
docker-compose down

# Remove volumes (optional)
docker-compose down -v
```

---

## Digital Ocean Deployment

### Step 1: Create Droplet

1. **Log in to Digital Ocean**
   - Go to https://cloud.digitalocean.com

2. **Create Droplet**
   - Click "Create" → "Droplets"
   - **Image**: Ubuntu 22.04 LTS
   - **Plan**: Basic ($6/month)
     - 1 GB RAM
     - 1 vCPU
     - 25 GB SSD
     - 1000 GB transfer
   - **Datacenter**: Choose closest to users
   - **Authentication**: SSH keys (recommended) or password
   - **Hostname**: `analytics-server`

3. **Configure Firewall**
   - Create firewall with these rules:
     - **Inbound**:
       - SSH (22) from your IP
       - HTTP (80) from anywhere
       - HTTPS (443) from anywhere
     - **Outbound**:
       - All protocols to anywhere

4. **Note the IP Address**
   - Copy the droplet's public IP (e.g., `165.227.XXX.XXX`)

### Step 2: DNS Configuration

1. **Add A Record**
   ```
   Type: A
   Name: analytics (or @)
   Value: <DROPLET_IP>
   TTL: 300
   ```

2. **Add CNAME for Dashboard** (optional)
   ```
   Type: CNAME
   Name: dashboard
   Value: analytics.weather-mcp.dev
   TTL: 300
   ```

3. **Wait for DNS Propagation**
   ```bash
   # Test DNS resolution
   nslookup analytics.weather-mcp.dev
   ```

### Step 3: Server Setup

1. **SSH into Server**
   ```bash
   ssh root@analytics.weather-mcp.dev
   ```

2. **Update System**
   ```bash
   apt-get update
   apt-get upgrade -y
   apt-get install -y curl git ufw fail2ban
   ```

3. **Create Non-Root User**
   ```bash
   adduser analytics
   usermod -aG sudo analytics

   # Copy SSH keys
   rsync --archive --chown=analytics:analytics ~/.ssh /home/analytics

   # Switch to new user
   su - analytics
   ```

4. **Configure Firewall**
   ```bash
   sudo ufw default deny incoming
   sudo ufw default allow outgoing
   sudo ufw allow ssh
   sudo ufw allow http
   sudo ufw allow https
   sudo ufw enable

   # Verify
   sudo ufw status
   ```

### Step 4: Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker analytics

# Start Docker on boot
sudo systemctl enable docker

# Log out and back in for group changes
exit
ssh analytics@analytics.weather-mcp.dev

# Verify Docker
docker --version
docker-compose --version
```

### Step 5: Deploy Application

1. **Clone Repository**
   ```bash
   cd ~
   git clone https://github.com/weather-mcp/analytics-server.git
   cd analytics-server
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   nano .env
   ```

   **Production Settings**:
   ```bash
   # Server
   NODE_ENV=production
   PORT=3000
   LOG_LEVEL=info

   # Database (CHANGE PASSWORD!)
   DB_HOST=postgres
   DB_PORT=5432
   DB_NAME=analytics
   DB_USER=analytics
   DB_PASSWORD=YOUR_STRONG_PASSWORD_HERE

   # Redis
   REDIS_HOST=redis
   REDIS_PORT=6379

   # API
   RATE_LIMIT_PER_MINUTE=60
   MAX_BATCH_SIZE=100

   # Security
   TRUST_PROXY=true
   CORS_ORIGIN=*
   ```

3. **Start Services**
   ```bash
   # Build and start
   docker-compose up -d

   # Check status
   docker-compose ps

   # View logs
   docker-compose logs -f
   ```

4. **Verify Services**
   ```bash
   # Health check
   curl http://localhost:3000/v1/health

   # Should return: {"status":"healthy",...}
   ```

### Step 6: Install Nginx

1. **Install Nginx**
   ```bash
   sudo apt-get install -y nginx
   ```

2. **Create nginx Configuration**
   ```bash
   sudo nano /etc/nginx/sites-available/analytics
   ```

   **Content**:
   ```nginx
   # HTTP - Redirect to HTTPS
   server {
       listen 80;
       listen [::]:80;
       server_name analytics.weather-mcp.dev;

       # Let's Encrypt challenge
       location /.well-known/acme-challenge/ {
           root /var/www/html;
       }

       # Redirect to HTTPS
       location / {
           return 301 https://$server_name$request_uri;
       }
   }

   # HTTPS - API Server
   server {
       listen 443 ssl http2;
       listen [::]:443 ssl http2;
       server_name analytics.weather-mcp.dev;

       # SSL certificates (will be added by certbot)
       ssl_certificate /etc/letsencrypt/live/analytics.weather-mcp.dev/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/analytics.weather-mcp.dev/privkey.pem;
       include /etc/letsencrypt/options-ssl-nginx.conf;
       ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

       # Security headers
       add_header X-Frame-Options "SAMEORIGIN" always;
       add_header X-Content-Type-Options "nosniff" always;
       add_header X-XSS-Protection "1; mode=block" always;
       add_header Referrer-Policy "no-referrer-when-downgrade" always;
       add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

       # Rate limiting
       limit_req_zone $binary_remote_addr zone=api_limit:10m rate=60r/m;
       limit_req zone=api_limit burst=10 nodelay;

       # Proxy to API
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }

       # Dashboard static files
       location /dashboard {
           alias /home/analytics/analytics-server/dashboard/dist;
           try_files $uri $uri/ /dashboard/index.html;
       }
   }
   ```

3. **Enable Site**
   ```bash
   sudo ln -s /etc/nginx/sites-available/analytics /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

### Step 7: SSL/TLS Setup

1. **Install Certbot**
   ```bash
   sudo apt-get install -y certbot python3-certbot-nginx
   ```

2. **Get SSL Certificate**
   ```bash
   sudo certbot --nginx -d analytics.weather-mcp.dev
   ```

   Follow prompts:
   - Enter email address
   - Agree to Terms of Service
   - Choose redirect option: 2 (Redirect HTTP to HTTPS)

3. **Test Auto-Renewal**
   ```bash
   sudo certbot renew --dry-run
   ```

4. **Verify HTTPS**
   ```bash
   curl https://analytics.weather-mcp.dev/v1/health
   ```

---

## Post-Deployment

### 1. Verify Everything Works

```bash
# API health
curl https://analytics.weather-mcp.dev/v1/health

# Test event ingestion
curl -X POST https://analytics.weather-mcp.dev/v1/events \
  -H "Content-Type: application/json" \
  -d '{"events":[{
    "version":"1.0.0",
    "tool":"test",
    "status":"success",
    "timestamp_hour":"2025-11-12T20:00:00Z",
    "analytics_level":"minimal"
  }]}'

# Check dashboard
open https://analytics.weather-mcp.dev/dashboard

# Check metrics
curl https://analytics.weather-mcp.dev/metrics
```

### 2. Set Up Monitoring

Add monitoring service (Uptime Robot, Pingdom, etc.):
- Monitor: `https://analytics.weather-mcp.dev/v1/health`
- Interval: 5 minutes
- Alert on: Status code != 200

### 3. Configure Automated Backups

See [Backup Configuration](#backup-configuration) below.

### 4. Update DNS (If Using Cloudflare)

1. **Add Site to Cloudflare**
   - Add your domain
   - Update nameservers at registrar

2. **Configure SSL/TLS**
   - SSL/TLS mode: Full (strict)
   - Always Use HTTPS: On

3. **Enable DDoS Protection**
   - Security → DDoS protection
   - Under Attack Mode (if needed)

### 5. Test from MCP Server

Update Weather MCP server to use production endpoint:
```bash
ANALYTICS_ENDPOINT=https://analytics.weather-mcp.dev/v1/events
```

---

## Security Hardening

### 1. SSH Hardening

```bash
sudo nano /etc/ssh/sshd_config
```

Update settings:
```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
Port 2222  # Optional: change default port
```

```bash
sudo systemctl restart sshd
```

### 2. Configure Fail2Ban

```bash
sudo nano /etc/fail2ban/jail.local
```

Add:
```ini
[sshd]
enabled = true
maxretry = 3
bantime = 3600

[nginx-limit-req]
enabled = true
filter = nginx-limit-req
logpath = /var/log/nginx/error.log
maxretry = 3
bantime = 3600
```

```bash
sudo systemctl restart fail2ban
```

### 3. Regular Updates

Set up automatic security updates:
```bash
sudo apt-get install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### 4. Change Database Password

```bash
cd ~/analytics-server
nano .env
# Update DB_PASSWORD

# Restart services
docker-compose down
docker-compose up -d
```

---

## Monitoring Setup

### Option 1: Prometheus + Grafana (Self-Hosted)

1. **Add to docker-compose.yml**:
   ```yaml
   prometheus:
     image: prom/prometheus:latest
     volumes:
       - ./prometheus.yml:/etc/prometheus/prometheus.yml
       - prometheus_data:/prometheus
     ports:
       - "9090:9090"
     restart: unless-stopped

   grafana:
     image: grafana/grafana:latest
     volumes:
       - grafana_data:/var/lib/grafana
     ports:
       - "3001:3000"
     restart: unless-stopped
   ```

2. **Create prometheus.yml**:
   ```yaml
   global:
     scrape_interval: 15s

   scrape_configs:
     - job_name: 'analytics-api'
       static_configs:
         - targets: ['api:3000']
   ```

3. **Restart**:
   ```bash
   docker-compose up -d
   ```

### Option 2: External Monitoring

Use managed services:
- **Datadog**: Application monitoring
- **New Relic**: Performance monitoring
- **Sentry**: Error tracking
- **Uptime Robot**: Uptime monitoring

---

## Backup Configuration

### 1. Database Backups

Create backup script:
```bash
mkdir -p ~/backups
nano ~/backups/backup-db.sh
```

**Content**:
```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/home/analytics/backups"
CONTAINER="analytics-postgres"

docker exec $CONTAINER pg_dump -U analytics analytics | \
  gzip > $BACKUP_DIR/analytics_$DATE.sql.gz

# Keep only last 7 days
find $BACKUP_DIR -name "analytics_*.sql.gz" -mtime +7 -delete

echo "Backup completed: analytics_$DATE.sql.gz"
```

```bash
chmod +x ~/backups/backup-db.sh
```

### 2. Cron Job

```bash
crontab -e
```

Add:
```
0 2 * * * /home/analytics/backups/backup-db.sh >> /home/analytics/backups/backup.log 2>&1
```

### 3. Verify Backups

```bash
# Test backup script
~/backups/backup-db.sh

# Verify backup exists
ls -lh ~/backups/
```

### 4. Off-Site Backups (Recommended)

Use DigitalOcean Spaces, S3, or similar:
```bash
# Install s3cmd
sudo apt-get install -y s3cmd

# Configure
s3cmd --configure

# Update backup script to upload
s3cmd put $BACKUP_DIR/analytics_$DATE.sql.gz s3://my-backups/
```

---

## Troubleshooting

### Service Won't Start

```bash
# Check logs
docker-compose logs api
docker-compose logs worker
docker-compose logs postgres

# Check disk space
df -h

# Check memory
free -h
```

### Database Connection Issues

```bash
# Check postgres is running
docker-compose ps postgres

# Check logs
docker-compose logs postgres

# Test connection
docker-compose exec postgres psql -U analytics -d analytics
```

### High CPU/Memory Usage

```bash
# Check resource usage
docker stats

# Check logs for errors
docker-compose logs --tail=100 api worker

# Restart services
docker-compose restart
```

### SSL Certificate Issues

```bash
# Check certificate
sudo certbot certificates

# Renew manually
sudo certbot renew --force-renewal

# Test nginx config
sudo nginx -t
```

### Rate Limiting Too Aggressive

Adjust in nginx config:
```nginx
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=120r/m;  # Increase to 120/min
limit_req zone=api_limit burst=20 nodelay;  # Increase burst to 20
```

Then:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## Maintenance Tasks

### Weekly

- [ ] Check error logs
- [ ] Verify backups completed
- [ ] Review dashboard metrics
- [ ] Check disk space

### Monthly

- [ ] Update system packages
- [ ] Update Docker images
- [ ] Review security logs
- [ ] Test backup restoration

### Quarterly

- [ ] Security audit
- [ ] Performance review
- [ ] Capacity planning
- [ ] Update documentation

---

## Useful Commands

```bash
# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f api

# Restart services
docker-compose restart

# Stop services
docker-compose down

# Update and restart
git pull
docker-compose pull
docker-compose up -d --build

# Check resource usage
docker stats

# Database shell
docker-compose exec postgres psql -U analytics -d analytics

# Redis CLI
docker-compose exec redis redis-cli

# Check queue depth
docker-compose exec redis redis-cli LLEN analytics:events
```

---

## Getting Help

- **Issues**: https://github.com/weather-mcp/analytics-server/issues
- **Documentation**: https://github.com/weather-mcp/analytics-server/tree/main/docs
- **Community**: https://github.com/weather-mcp/mcp-server/discussions

---

**Last Updated**: 2025-11-12
**Version**: 1.0.0
