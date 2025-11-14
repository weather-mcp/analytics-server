# Operations Guide

Quick reference for common operational tasks on the Analytics Server.

---

## Table of Contents

1. [Daily Operations](#daily-operations)
2. [Service Management](#service-management)
3. [Monitoring](#monitoring)
4. [Backup and Restore](#backup-and-restore)
5. [Troubleshooting](#troubleshooting)
6. [Performance Tuning](#performance-tuning)
7. [Security Maintenance](#security-maintenance)

---

## Daily Operations

### Check Service Health

```bash
# Quick health check
./scripts/health-check.sh

# Detailed health check
./scripts/health-check.sh --verbose

# Check via API
curl https://analytics.weather-mcp.dev/v1/health
```

### View Logs

```bash
# View all logs (live)
docker compose logs -f

# View API logs only
docker compose logs -f api

# View worker logs
docker compose logs -f worker

# View last 100 lines
docker compose logs --tail=100 api

# View logs from specific time
docker compose logs --since=1h api
```

### Check Resource Usage

```bash
# Container stats
docker stats

# Disk usage
df -h

# Database size
docker compose exec postgres psql -U analytics -d analytics -c "
  SELECT pg_size_pretty(pg_database_size('analytics'))
"

# Queue depth
docker compose exec redis redis-cli LLEN analytics:events

# Event count
docker compose exec postgres psql -U analytics -d analytics -c "
  SELECT COUNT(*) FROM events
"
```

---

## Service Management

### Start Services

```bash
# Start all services
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Start specific service
docker compose start api
docker compose start worker
```

### Stop Services

```bash
# Stop all services
docker compose stop

# Stop specific service
docker compose stop api
docker compose stop worker

# Stop and remove containers
docker compose down
```

### Restart Services

```bash
# Restart all services
docker compose restart

# Restart specific service
docker compose restart api
docker compose restart worker
docker compose restart nginx

# Graceful restart (zero downtime)
docker compose up -d --no-deps --build api
```

### Update Application

```bash
# 1. Pull latest code
cd /home/analytics/analytics-server
git pull

# 2. Rebuild images
docker compose -f docker-compose.yml -f docker-compose.prod.yml build

# 3. Restart with new images
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# 4. Verify health
./scripts/health-check.sh
```

### Scale Worker (if needed)

```bash
# Scale to 2 workers
docker compose up -d --scale worker=2

# Scale back to 1 worker
docker compose up -d --scale worker=1
```

---

## Monitoring

### Check System Metrics

```bash
# API metrics (Prometheus format)
curl http://localhost:3000/metrics

# Worker status
docker compose exec worker node -e "
  const stats = require('./dist/worker').getWorkerStats();
  console.log(JSON.stringify(stats, null, 2));
"
```

### Monitor Queue

```bash
# Queue depth (real-time)
watch -n 1 "docker compose exec redis redis-cli LLEN analytics:events"

# Queue info
docker compose exec redis redis-cli INFO stats
```

### Monitor Database

```bash
# Active connections
docker compose exec postgres psql -U analytics -d analytics -c "
  SELECT count(*) FROM pg_stat_activity
"

# Database size over time
docker compose exec postgres psql -U analytics -d analytics -c "
  SELECT
    date_trunc('day', NOW()) as day,
    pg_size_pretty(pg_database_size('analytics')) as size
"

# Table sizes
docker compose exec postgres psql -U analytics -d analytics -c "
  SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
"
```

### Check SSL Certificate Expiration

```bash
# Check expiration date
openssl x509 -in nginx/ssl/fullchain.pem -noout -dates

# Check days until expiration
openssl x509 -in nginx/ssl/fullchain.pem -noout -checkend 2592000
echo $?  # 0 = valid for at least 30 days, 1 = expires within 30 days
```

---

## Backup and Restore

### Create Backup

```bash
# Manual backup
./scripts/backup-db.sh backups

# Backup with custom directory
./scripts/backup-db.sh /path/to/backup/dir

# View backups
ls -lh backups/
```

### Restore from Backup

```bash
# List available backups
ls -lh backups/

# Restore specific backup
./scripts/restore-db.sh backups/analytics_backup_20250113_120000.sql.gz

# WARNING: This will drop and recreate the database!
```

### Verify Backup

```bash
# Check backup file integrity
gunzip -t backups/analytics_backup_20250113_120000.sql.gz

# View backup contents (first 100 lines)
gunzip -c backups/analytics_backup_20250113_120000.sql.gz | head -100
```

### Backup Maintenance

```bash
# List old backups (older than 7 days)
find backups/ -name "analytics_backup_*.sql.gz" -type f -mtime +7

# Delete old backups (older than 7 days)
find backups/ -name "analytics_backup_*.sql.gz" -type f -mtime +7 -delete

# Check backup disk usage
du -sh backups/
```

---

## Troubleshooting

### Service Won't Start

```bash
# 1. Check logs
docker compose logs api

# 2. Check environment variables
docker compose config | grep -A 10 "api:"

# 3. Check disk space
df -h

# 4. Check memory
free -h

# 5. Try starting manually
docker compose up api
```

### High Memory Usage

```bash
# 1. Check which service is using memory
docker stats

# 2. Restart the problematic service
docker compose restart api  # or worker, postgres, redis

# 3. Check for memory leaks
docker compose logs api | grep -i "memory\|heap"

# 4. Adjust memory limits in docker-compose.prod.yml if needed
```

### High CPU Usage

```bash
# 1. Check which service is using CPU
docker stats

# 2. Check queue depth (might be processing too much)
docker compose exec redis redis-cli LLEN analytics:events

# 3. Check for slow queries
docker compose exec postgres psql -U analytics -d analytics -c "
  SELECT query, calls, total_time, mean_time
  FROM pg_stat_statements
  ORDER BY mean_time DESC
  LIMIT 10
"

# 4. Adjust worker batch size if needed
```

### Database Connection Issues

```bash
# 1. Check if PostgreSQL is running
docker compose ps postgres

# 2. Check PostgreSQL logs
docker compose logs postgres

# 3. Test connection
docker compose exec postgres psql -U analytics -d analytics -c "SELECT 1"

# 4. Check connection count
docker compose exec postgres psql -U analytics -d analytics -c "
  SELECT count(*) FROM pg_stat_activity
"

# 5. Reset connections if needed
docker compose restart postgres
```

### Queue Backup (Too Many Events)

```bash
# 1. Check queue depth
docker compose exec redis redis-cli LLEN analytics:events

# 2. Check worker status
docker compose logs worker

# 3. Scale up workers temporarily
docker compose up -d --scale worker=2

# 4. Increase worker batch size
# Edit .env: WORKER_BATCH_SIZE=100
docker compose restart worker

# 5. Monitor queue drain
watch -n 5 "docker compose exec redis redis-cli LLEN analytics:events"
```

### Disk Space Full

```bash
# 1. Check disk usage
df -h

# 2. Find large files
du -sh /* | sort -h

# 3. Clean up Docker
docker system prune -a

# 4. Clean up old backups
find backups/ -name "*.sql.gz" -type f -mtime +7 -delete

# 5. Clean up old logs
find logs/ -name "*.log" -type f -mtime +30 -delete

# 6. Adjust retention policies if needed
# Edit .env: RAW_EVENTS_RETENTION_DAYS=30
```

---

## Performance Tuning

### Database Optimization

```bash
# Run VACUUM to reclaim space
docker compose exec postgres psql -U analytics -d analytics -c "VACUUM ANALYZE"

# Update table statistics
docker compose exec postgres psql -U analytics -d analytics -c "ANALYZE"

# Check for missing indexes
docker compose exec postgres psql -U analytics -d analytics -c "
  SELECT schemaname, tablename, attname, n_distinct, correlation
  FROM pg_stats
  WHERE schemaname = 'public'
  ORDER BY abs(correlation) DESC
"
```

### Cache Optimization

```bash
# Clear API cache (if needed)
docker compose exec redis redis-cli FLUSHDB

# Check cache hit rate
# View in API logs or Prometheus metrics
```

### Query Performance

```bash
# Enable query timing
docker compose exec postgres psql -U analytics -d analytics -c "
  \timing on
  SELECT * FROM daily_aggregations LIMIT 1;
"

# Check slow queries
docker compose exec postgres psql -U analytics -d analytics -c "
  SELECT query, calls, total_time, mean_time
  FROM pg_stat_statements
  WHERE mean_time > 100  -- queries taking > 100ms
  ORDER BY mean_time DESC
"
```

---

## Security Maintenance

### Update System Packages

```bash
# Update server packages
sudo apt-get update
sudo apt-get upgrade -y

# Reboot if needed
sudo reboot
```

### Update Docker Images

```bash
# Pull latest base images
docker compose pull

# Rebuild with latest images
docker compose -f docker-compose.yml -f docker-compose.prod.yml build

# Restart with new images
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Security Audit

```bash
# Check for CVEs in Node.js dependencies
docker compose exec api npm audit

# Check Docker security
docker scan analytics-api

# Check open ports
sudo netstat -tuln

# Check failed login attempts
sudo journalctl -u ssh | grep "Failed password"
```

### Rotate Secrets

```bash
# 1. Generate new passwords
openssl rand -base64 32

# 2. Update .env file
nano .env

# 3. Update database password
docker compose exec postgres psql -U postgres -c "
  ALTER USER analytics PASSWORD 'NEW_PASSWORD'
"

# 4. Update Redis password (if using auth)
# Edit redis.conf and restart

# 5. Restart services
docker compose restart
```

### SSL Certificate Renewal

```bash
# Check expiration
openssl x509 -in nginx/ssl/fullchain.pem -noout -dates

# Renew with Certbot
sudo certbot renew

# Copy new certificates
sudo cp /etc/letsencrypt/live/analytics.weather-mcp.dev/*.pem nginx/ssl/

# Reload Nginx
docker compose restart nginx

# Verify new certificate
curl -vI https://analytics.weather-mcp.dev 2>&1 | grep -A 2 "expire date"
```

---

## Emergency Procedures

### Emergency Shutdown

```bash
# Graceful shutdown
docker compose down

# Immediate shutdown (if needed)
docker compose kill
```

### Emergency Restart

```bash
# Quick restart
docker compose restart

# Full restart (rebuild if needed)
docker compose down
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Rollback

```bash
# 1. Stop services
docker compose down

# 2. Checkout previous version
git log  # Find commit hash
git checkout PREVIOUS_COMMIT_HASH

# 3. Rebuild
docker compose -f docker-compose.yml -f docker-compose.prod.yml build

# 4. Restore database if needed
./scripts/restore-db.sh backups/LAST_GOOD_BACKUP.sql.gz

# 5. Start services
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## Contact Information

**Primary Contact:** [Your Name]
**Email:** your-email@example.com
**Phone:** +1-xxx-xxx-xxxx

**VPS Provider Support:**
- DigitalOcean: https://www.digitalocean.com/support
- Hetzner: https://www.hetzner.com/support

**Community Support:**
- GitHub Issues: https://github.com/weather-mcp/analytics-server/issues

---

**Operations Guide Version:** 1.0
**Last Updated:** 2025-01-13
