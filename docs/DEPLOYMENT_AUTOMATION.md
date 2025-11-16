# Deployment Automation Guide

**Purpose:** Automated deployment to DigitalOcean using GitHub Actions
**Version:** 1.0.0
**Last Updated:** 2025-01-13

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Initial Server Setup](#initial-server-setup)
4. [GitHub Configuration](#github-configuration)
5. [Automated Deployment](#automated-deployment)
6. [Manual Deployment](#manual-deployment)
7. [Troubleshooting](#troubleshooting)

---

## Overview

This guide explains how to set up automated deployments to DigitalOcean using GitHub Actions CI/CD pipelines.

### Deployment Flow

```
Code Push to main
    ↓
GitHub Actions Triggered
    ↓
Run Tests (Parallel with PostgreSQL & Redis)
    ↓
Build Docker Images
    ↓
Push to GitHub Container Registry
    ↓
Deploy to DigitalOcean Droplet
    ↓
Run Health Checks
    ↓
Notify Success/Failure
```

### Features

- ✅ Automated testing on every push/PR
- ✅ Docker image building and caching
- ✅ Zero-downtime deployments
- ✅ Automated health checks
- ✅ Rollback on failure
- ✅ Security scanning
- ✅ Environment-specific configurations

---

## Prerequisites

### Required Accounts

1. **DigitalOcean Account**
   - Sign up at https://www.digitalocean.com
   - Create API token (Settings → API → Generate New Token)

2. **GitHub Account**
   - Repository access with admin permissions
   - Ability to create secrets and workflows

### Required Tools (Local Machine)

```bash
# Git
git --version

# SSH client
ssh -V

# Docker (optional, for local testing)
docker --version
```

---

## Initial Server Setup

### Step 1: Create DigitalOcean Droplet

1. **Log in to DigitalOcean**
   - Go to https://cloud.digitalocean.com

2. **Create New Droplet**
   - Click "Create" → "Droplets"
   - **Image:** Ubuntu 22.04 LTS or 24.04 LTS
   - **Plan:** Basic ($6/month - 1GB RAM, 25GB SSD)
   - **Datacenter:** Choose closest to your users
   - **Authentication:** SSH Key (recommended) or Password
   - **Hostname:** analytics-server

3. **Note the IP Address**
   - Save the droplet's public IP address (e.g., 192.0.2.1)

### Step 2: Initial Server Configuration

**Connect to your droplet:**

```bash
ssh root@YOUR_DROPLET_IP
```

**Run the setup script:**

```bash
# Download the setup script
curl -fsSL https://raw.githubusercontent.com/weather-mcp/analytics-server/main/scripts/setup-server.sh -o setup-server.sh

# Make it executable
chmod +x setup-server.sh

# Run the script
./setup-server.sh
```

This script will:
- Update system packages
- Install Docker and Docker Compose
- Configure firewall (UFW)
- Set up fail2ban
- Configure automatic security updates
- Create deployment directory (/opt/analytics-server)
- Configure swap space (2GB)
- Optimize Docker for production

**Alternatively, copy and run manually:**

```bash
# On your local machine, from the project root
scp scripts/setup-server.sh root@YOUR_DROPLET_IP:/tmp/
ssh root@YOUR_DROPLET_IP 'bash /tmp/setup-server.sh'
```

### Step 3: Verify Server Setup

```bash
# Check Docker is running
docker --version
docker compose version

# Check firewall status
ufw status

# Check available disk space
df -h

# Check memory
free -h
```

---

## GitHub Configuration

### Step 1: Set Up GitHub Secrets

Navigate to your GitHub repository → Settings → Secrets and variables → Actions

**Add the following secrets:**

1. **DIGITALOCEAN_ACCESS_TOKEN**
   - Your DigitalOcean API token
   - Get from: https://cloud.digitalocean.com/account/api/tokens

2. **DIGITALOCEAN_DROPLET_IP**
   - Your droplet's public IP address
   - Example: `192.0.2.1`

3. **DIGITALOCEAN_SSH_KEY**
   - Your private SSH key for accessing the droplet
   - Generate if you don't have one:
     ```bash
     ssh-keygen -t ed25519 -C "github-actions@analytics-server"
     cat ~/.ssh/id_ed25519  # Copy this to GitHub Secret
     ```
   - **Important:** Copy the entire private key including headers
     ```
     -----BEGIN OPENSSH PRIVATE KEY-----
     ...
     -----END OPENSSH PRIVATE KEY-----
     ```

### Step 2: Configure Environment Variables on Server

**Connect to your droplet:**

```bash
ssh root@YOUR_DROPLET_IP
```

**Create .env file:**

```bash
cd /opt/analytics-server
cp .env.production.template .env
nano .env
```

**Update these critical values:**

```bash
# Database password (generate strong password)
DB_PASSWORD=your_strong_db_password_here

# Redis password
REDIS_PASSWORD=your_strong_redis_password_here

# Grafana admin password
GRAFANA_ADMIN_PASSWORD=your_strong_grafana_password_here

# CORS origins (your actual domains)
CORS_ORIGIN=https://weather-mcp.dev,https://analytics.weather-mcp.dev

# SMTP settings for alerts
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_FROM=analytics-alerts@weather-mcp.dev
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-gmail-app-password
```

**Validate configuration:**

```bash
bash scripts/check-env.sh
```

### Step 3: Add SSH Key to Droplet

If you haven't already added your SSH key:

```bash
# On your local machine
ssh-copy-id root@YOUR_DROPLET_IP

# Or manually:
cat ~/.ssh/id_ed25519.pub | ssh root@YOUR_DROPLET_IP "cat >> ~/.ssh/authorized_keys"
```

### Step 4: Enable GitHub Container Registry

The workflow uses GitHub Container Registry (ghcr.io) to store Docker images.

**Permissions are handled automatically** through the `GITHUB_TOKEN` secret.

---

## Automated Deployment

### How It Works

**Workflows:**

1. **CI Workflow** (`.github/workflows/ci.yml`)
   - Runs on: Pull requests and feature branches
   - Tests code with PostgreSQL and Redis
   - Builds Docker image (without pushing)
   - Security scanning
   - Lint Dockerfile
   - Comments on PRs with results

2. **Deploy Workflow** (`.github/workflows/deploy.yml`)
   - Runs on: Pushes to `main` branch and version tags
   - Runs all tests
   - Builds and pushes Docker images
   - Deploys to DigitalOcean
   - Runs health checks
   - Rolls back on failure

### Triggering Deployments

**Automatic Deployment:**

```bash
# Any push to main triggers deployment
git checkout main
git push origin main
```

**Tag-based Deployment:**

```bash
# Create a version tag
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```

**Manual Deployment:**

1. Go to GitHub → Actions
2. Select "Deploy to DigitalOcean" workflow
3. Click "Run workflow"
4. Select environment (production/staging)
5. Click "Run workflow"

### Monitoring Deployments

1. **GitHub Actions UI:**
   - Go to your repository → Actions tab
   - Click on the running workflow
   - Watch real-time logs

2. **Deployment Status:**
   - Green checkmark = Success
   - Red X = Failed (automatic rollback triggered)
   - Yellow dot = In progress

3. **Post-Deployment:**
   - Check API health: `https://analytics.weather-mcp.dev/v1/health`
   - View logs: `ssh root@YOUR_DROPLET_IP "cd /opt/analytics-server && docker compose logs -f"`

---

## Manual Deployment

For testing or emergency deployments, use the manual deployment script.

### Prerequisites

```bash
# Set environment variables
export DIGITALOCEAN_DROPLET_IP=your.droplet.ip
export SSH_KEY_PATH=~/.ssh/id_rsa  # Or your key path
```

### Run Deployment

```bash
# From project root
./scripts/deploy-digitalocean.sh
```

### What It Does

1. ✓ Checks prerequisites
2. ✓ Tests SSH connection
3. ✓ Creates deployment directory
4. ✓ Copies files to server
5. ✓ Checks for .env file
6. ✓ Pulls latest images
7. ✓ Deploys services
8. ✓ Runs health check
9. ✓ Displays post-deployment info

### Deployment Options

```bash
# Use custom SSH user
export DEPLOY_SSH_USER=deployuser
./scripts/deploy-digitalocean.sh

# Use custom deployment path
export DEPLOY_PATH=/var/www/analytics
./scripts/deploy-digitalocean.sh

# Use different compose files
export DOCKER_COMPOSE_FILES="docker-compose.yml:docker-compose.staging.yml"
./scripts/deploy-digitalocean.sh
```

---

## Troubleshooting

### Common Issues

#### 1. SSH Connection Fails

**Error:** `Permission denied (publickey)`

**Solution:**
```bash
# Verify SSH key is added to GitHub Secrets correctly
# Test SSH connection manually:
ssh -i ~/.ssh/id_ed25519 root@YOUR_DROPLET_IP

# Add key to droplet if missing:
ssh-copy-id -i ~/.ssh/id_ed25519 root@YOUR_DROPLET_IP
```

#### 2. Docker Image Pull Fails

**Error:** `Error response from daemon: pull access denied`

**Solution:**
```bash
# Ensure packages:write permission in workflow
# Check GitHub Container Registry settings:
# Repo → Settings → Actions → General → Workflow permissions
# Enable "Read and write permissions"
```

#### 3. Health Check Fails

**Error:** `Health check failed after 5 attempts`

**Solution:**
```bash
# SSH into server and check logs:
ssh root@YOUR_DROPLET_IP
cd /opt/analytics-server
docker compose logs api
docker compose logs postgres
docker compose logs redis

# Check service status:
docker compose ps

# Restart services:
docker compose restart
```

#### 4. Environment Variables Not Set

**Error:** `Required variable not set`

**Solution:**
```bash
# Check .env file exists on server:
ssh root@YOUR_DROPLET_IP "cat /opt/analytics-server/.env"

# Run validation script:
ssh root@YOUR_DROPLET_IP "cd /opt/analytics-server && bash scripts/check-env.sh"

# Update missing variables:
ssh root@YOUR_DROPLET_IP "nano /opt/analytics-server/.env"
```

#### 5. Port Already in Use

**Error:** `Bind for 0.0.0.0:3000 failed: port is already allocated`

**Solution:**
```bash
# Check what's using the port:
ssh root@YOUR_DROPLET_IP "lsof -i :3000"

# Stop conflicting service:
docker compose down
```

### Debugging Workflow Failures

**View detailed logs:**
1. Go to GitHub → Actions
2. Click on failed workflow
3. Click on failed job
4. Expand step to see full logs

**Common workflow fixes:**

```yaml
# Increase timeout if needed
timeout-minutes: 30

# Add debug output
run: |
  set -x  # Enable command echoing
  your-command-here

# Continue on error for testing
continue-on-error: true
```

### Rollback Procedure

**Automatic Rollback:**
- Triggered automatically if health check fails
- Restarts services with previous images

**Manual Rollback:**

```bash
# SSH into server
ssh root@YOUR_DROPLET_IP
cd /opt/analytics-server

# Stop current services
docker compose down

# Pull previous version (by tag)
docker compose pull ghcr.io/weather-mcp/analytics-server:v1.0.0

# Start services
docker compose up -d

# Verify
bash scripts/health-check.sh
```

### Getting Help

**Check logs:**
```bash
# All services
docker compose logs

# Specific service
docker compose logs api
docker compose logs worker

# Follow logs
docker compose logs -f --tail=100
```

**Check system resources:**
```bash
# Disk space
df -h

# Memory usage
free -h

# Docker resource usage
docker stats
```

**Check network:**
```bash
# Test external connectivity
curl -I https://analytics.weather-mcp.dev

# Test from inside container
docker compose exec api curl localhost:3000/v1/health
```

---

## Best Practices

### Security

1. **Use Strong Passwords**
   - Minimum 20 characters
   - Include letters, numbers, symbols
   - Never commit .env to git

2. **Rotate Secrets Regularly**
   - Update passwords every 90 days
   - Rotate API tokens annually

3. **Limit Access**
   - Use principle of least privilege
   - Separate deploy keys per environment

### Performance

1. **Monitor Deployments**
   - Watch metrics during deployment
   - Check for memory/CPU spikes
   - Verify response times

2. **Deploy During Low Traffic**
   - Schedule deployments for off-peak hours
   - Monitor for 30 minutes post-deployment

3. **Use Canary Deployments** (Advanced)
   - Deploy to subset of servers first
   - Monitor before full rollout

### Maintenance

1. **Regular Updates**
   - Keep base images updated
   - Update dependencies monthly
   - Apply security patches promptly

2. **Backup Before Deployment**
   - Automatic backups before each deployment
   - Verify backup integrity regularly

3. **Document Changes**
   - Update CHANGELOG.md
   - Document breaking changes
   - Tag releases properly

---

## Advanced Configuration

### Multi-Environment Setup

Create separate environments (staging, production):

```yaml
# .github/workflows/deploy-staging.yml
on:
  push:
    branches: [develop]
environment:
  name: staging
  url: https://staging.analytics.weather-mcp.dev
```

### Custom Health Checks

Extend health checks:

```yaml
- name: Check API endpoints
  run: |
    curl -f https://analytics.weather-mcp.dev/v1/stats/overview
    curl -f https://analytics.weather-mcp.dev/metrics
```

### Notification Integration

Add Slack/Discord notifications:

```yaml
- name: Notify Slack
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

---

## Resources

### Documentation

- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) - Manual deployment guide
- [OPERATIONS_GUIDE.md](OPERATIONS_GUIDE.md) - Operations procedures
- [MONITORING_GUIDE.md](MONITORING_GUIDE.md) - Monitoring setup

### External Links

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [DigitalOcean Documentation](https://docs.digitalocean.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)

---

## Support

For issues with deployment automation:
- **GitHub Issues**: https://github.com/weather-mcp/analytics-server/issues
- **Discussions**: https://github.com/weather-mcp/.github/discussions

---

**Deployment Automation Guide Version:** 1.0.0
**Last Updated:** 2025-01-13
**Maintained by:** Weather MCP Team
