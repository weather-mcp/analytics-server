# Monitoring Guide - Analytics Server

Complete guide for monitoring the Analytics Server using Prometheus, Grafana, and Alertmanager.

**Version:** 1.0
**Last Updated:** 2025-01-13

---

## Table of Contents

1. [Overview](#overview)
2. [Monitoring Stack Components](#monitoring-stack-components)
3. [Accessing Monitoring Tools](#accessing-monitoring-tools)
4. [Grafana Dashboards](#grafana-dashboards)
5. [Prometheus Metrics](#prometheus-metrics)
6. [Alert Configuration](#alert-configuration)
7. [Common Monitoring Tasks](#common-monitoring-tasks)
8. [Troubleshooting](#troubleshooting)

---

## Overview

The Analytics Server includes a comprehensive monitoring stack for tracking system health, performance, and operational metrics. This is **internal monitoring** for infrastructure and application health, not the public analytics dashboard.

### Monitoring vs Analytics

- **Monitoring (this guide):** Internal operational metrics (API health, queue depth, database performance)
- **Public Analytics:** Product usage statistics displayed on website (tool usage, geographic distribution)

### Architecture

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│  Analytics  │────▶│  Prometheus  │────▶│    Grafana    │
│   Server    │     │  (metrics)   │     │ (dashboards)  │
│  (API/Worker)│     └──────────────┘     └───────────────┘
└─────────────┘             │
                            │
                            ▼
                    ┌──────────────┐
                    │ Alertmanager │
                    │(notifications)│
                    └──────────────┘
```

---

## Monitoring Stack Components

### 1. Prometheus
- **Purpose:** Metrics collection and storage
- **Port:** 9090
- **Data Retention:** 30 days
- **Scrape Interval:** 15 seconds (API: 10 seconds)

### 2. Grafana
- **Purpose:** Visualization and dashboards
- **Port:** 3001
- **Default Credentials:** admin/admin (change on first login)
- **Dashboards:** 3 pre-configured dashboards

### 3. Alertmanager
- **Purpose:** Alert routing and notifications
- **Port:** 9093
- **Notification Methods:** Email, Slack (configurable)

---

## Accessing Monitoring Tools

### Development Environment

```bash
# Start all services including monitoring
docker compose up -d

# Access URLs
Prometheus:    http://localhost:9090
Grafana:       http://localhost:3001
Alertmanager:  http://localhost:9093
```

### Production Environment

Monitoring tools are only exposed to localhost in production. Access via SSH tunnel:

```bash
# SSH tunnel to access Grafana
ssh -L 3001:localhost:3001 user@your-server.com

# Then access in browser
http://localhost:3001
```

**Security Note:** Never expose Prometheus, Grafana, or Alertmanager directly to the internet.

---

## Grafana Dashboards

### Dashboard 1: API Health

**Purpose:** Monitor API server health and performance

**Key Metrics:**
- **Request Rate:** HTTP requests per second by endpoint
- **Error Rate:** 4xx and 5xx error percentages
- **Response Time:** p50, p95, p99 latency percentiles
- **Events Received:** Analytics events ingested per second
- **API Uptime:** Current service status

**When to Check:**
- Daily health checks
- After deployments
- When users report issues
- During traffic spikes

**Alert Thresholds:**
- Error rate >5%: Warning
- Error rate >10%: Critical
- Response time p95 >1s: Warning
- API down: Critical

### Dashboard 2: Worker & Queue

**Purpose:** Monitor event processing pipeline

**Key Metrics:**
- **Queue Depth:** Number of events waiting to be processed
- **Events Processed:** Successful and failed event processing rate
- **Batch Size:** Distribution of worker batch sizes
- **Processing Time:** Time to process event batches
- **Worker Errors:** Errors by type (database_insert, aggregation_update, batch_processing)

**When to Check:**
- When queue depth is growing
- After schema changes
- During database maintenance
- When processing seems slow

**Alert Thresholds:**
- Queue depth >1000: Warning
- Queue depth >5000: Critical
- Queue near capacity (>9000): Critical
- Processing stalled: Critical

### Dashboard 3: Database & Infrastructure

**Purpose:** Monitor database and system resources

**Key Metrics:**
- **Query Duration:** Database query performance (p50, p95, p99)
- **Query Rate:** Database queries per second
- **Connection Pool:** Active, idle, and waiting connections
- **Cache Hit Rate:** Percentage of cache hits
- **Memory Usage:** Process memory consumption
- **CPU Usage:** Process CPU utilization

**When to Check:**
- When database seems slow
- When memory is high
- During performance tuning
- Before/after index changes

**Alert Thresholds:**
- Connection pool >80: Warning
- Slow queries >1s: Warning
- Memory >400MB: Warning
- Memory >450MB: Critical

---

## Prometheus Metrics

### Accessing Metrics

**Prometheus UI:** http://localhost:9090

**Raw Metrics:** http://localhost:3000/metrics (API endpoint)

### Key Metric Categories

#### HTTP Metrics
```promql
# Total HTTP requests
http_requests_total

# Request duration histogram
http_request_duration_seconds_bucket

# By status code
http_requests_total{status_code="200"}
```

#### Event Metrics
```promql
# Events received
events_received_total{analytics_level="minimal",tool="forecast"}

# Events processed
events_processed_total{status="success"}

# Processing duration
events_processing_duration_seconds
```

#### Queue Metrics
```promql
# Current queue depth
queue_depth

# Queue operations
queue_operations_total{operation="enqueue",status="success"}
```

#### Database Metrics
```promql
# Query duration
database_query_duration_seconds

# Queries total
database_queries_total{operation="insert",table="events"}

# Connection pool
database_connection_pool{state="total"}
```

#### Worker Metrics
```promql
# Batch size
worker_batch_size

# Worker errors
worker_errors_total{error_type="database_insert"}
```

### Example Queries

**API Error Rate (last 5 minutes):**
```promql
100 * (
  sum(rate(http_requests_total{status_code=~"5.."}[5m]))
  /
  sum(rate(http_requests_total[5m]))
)
```

**p95 Response Time:**
```promql
histogram_quantile(0.95,
  rate(http_request_duration_seconds_bucket[5m])
)
```

**Events per Minute:**
```promql
rate(events_received_total[1m]) * 60
```

---

## Alert Configuration

### Alert Severity Levels

- **Critical:** Immediate action required (paged)
- **Warning:** Should be investigated (emailed)
- **Info:** For awareness only (logged)

### Configured Alerts

#### Critical Alerts
1. **APIDown:** API unreachable for >1 minute
2. **VeryHighErrorRate:** >10% error rate for >1 minute
3. **CriticalQueueBacklog:** >5000 events in queue
4. **QueueNearCapacity:** >9000 events (90% capacity)
5. **WorkerProcessingStalled:** Worker not processing despite queue backlog
6. **DatabaseDown:** Database unreachable for >1 minute
7. **CriticalMemoryUsage:** >450MB memory usage

#### Warning Alerts
1. **HighErrorRate:** >5% error rate for >2 minutes
2. **HighResponseTime:** p95 >1s for >5 minutes
3. **QueueBacklog:** >1000 events in queue for >5 minutes
4. **HighWorkerErrorRate:** >0.1 errors/second
5. **HighDatabaseConnections:** >80 connections
6. **SlowDatabaseQueries:** p95 >1s
7. **HighMemoryUsage:** >400MB memory usage
8. **StaleDataWarning:** No events received in 5+ minutes

### Configuring Email Notifications

Edit `alertmanager/alertmanager.yml`:

```yaml
global:
  smtp_smarthost: 'smtp.gmail.com:587'
  smtp_from: 'analytics-alerts@your-domain.com'
  smtp_auth_username: 'your-email@gmail.com'
  smtp_auth_password: 'your-app-password' # Gmail app password
```

### Testing Alerts

```bash
# Manually fire an alert for testing
curl -X POST http://localhost:9093/api/v1/alerts -d '[{
  "labels": {
    "alertname": "TestAlert",
    "severity": "warning"
  },
  "annotations": {
    "summary": "This is a test alert"
  }
}]'
```

---

## Common Monitoring Tasks

### Daily Health Check

```bash
# 1. Check Grafana dashboards
# Visit: http://localhost:3001
# Look for: Red panels, high error rates, growing queue

# 2. Check Prometheus targets
# Visit: http://localhost:9090/targets
# Ensure all targets are "UP"

# 3. Check Alertmanager
# Visit: http://localhost:9093
# Look for: Active alerts

# 4. Run health check script
./scripts/health-check.sh
```

### Investigating High Error Rate

1. **Check API Health Dashboard**
   - Identify which endpoint has errors
   - Check if error rate correlates with traffic spike

2. **Query Prometheus for Details**
   ```promql
   # Errors by route
   sum by (route) (rate(http_requests_total{status_code=~"5.."}[5m]))
   ```

3. **Check Application Logs**
   ```bash
   docker compose logs api | grep ERROR
   ```

4. **Verify Database Health**
   - Check connection pool on Database dashboard
   - Look for slow queries

### Investigating Queue Backup

1. **Check Worker & Queue Dashboard**
   - Is queue depth growing?
   - Is worker processing events?
   - Are there worker errors?

2. **Check Worker Status**
   ```bash
   docker compose logs worker
   ```

3. **Check Database Performance**
   - Slow inserts could cause backup
   - Check Database dashboard

4. **Scale Worker if Needed**
   ```bash
   # Temporarily scale to 2 workers
   docker compose up -d --scale worker=2
   ```

### Investigating Slow Performance

1. **Check All Dashboards**
   - API Health: High response time?
   - Database: Slow queries?
   - Infrastructure: High CPU/memory?

2. **Query Prometheus**
   ```promql
   # Slowest endpoints
   topk(5, histogram_quantile(0.95,
     sum by (route) (rate(http_request_duration_seconds_bucket[5m]))
   ))
   ```

3. **Check Database Indexes**
   ```bash
   # Connect to database
   docker compose exec postgres psql -U analytics -d analytics

   # Check slow queries
   SELECT * FROM pg_stat_statements
   ORDER BY mean_time DESC LIMIT 10;
   ```

---

## Troubleshooting

### Prometheus Not Scraping Metrics

**Symptoms:** No data in Grafana, targets down in Prometheus

**Solutions:**
1. Check Prometheus targets: http://localhost:9090/targets
2. Verify API is exposing /metrics endpoint
3. Check docker network connectivity
4. Review Prometheus logs:
   ```bash
   docker compose logs prometheus
   ```

### Grafana Dashboards Empty

**Symptoms:** Dashboards load but show no data

**Solutions:**
1. Check Prometheus datasource in Grafana
   - Settings → Data Sources → Prometheus
   - Click "Test" button
2. Verify time range (top-right in Grafana)
3. Check if metrics exist in Prometheus directly
4. Review Grafana logs:
   ```bash
   docker compose logs grafana
   ```

### Alerts Not Firing

**Symptoms:** Metrics show issues but no alerts

**Solutions:**
1. Check Alertmanager is running:
   ```bash
   docker compose ps alertmanager
   ```
2. Verify alert rules in Prometheus:
   - http://localhost:9090/alerts
3. Check Alertmanager configuration:
   ```bash
   docker compose exec alertmanager amtool check-config /etc/alertmanager/alertmanager.yml
   ```
4. Review Alertmanager logs:
   ```bash
   docker compose logs alertmanager
   ```

### Email Alerts Not Sending

**Symptoms:** Alerts firing but no emails received

**Solutions:**
1. Check Alertmanager configuration (SMTP settings)
2. Verify email credentials are correct
3. Check spam folder
4. Test SMTP connection:
   ```bash
   telnet smtp.gmail.com 587
   ```
5. Check Alertmanager logs for SMTP errors

---

## Best Practices

### 1. Regular Monitoring

- Check Grafana dashboards daily
- Review alerts weekly
- Analyze trends monthly

### 2. Alert Fatigue Prevention

- Tune alert thresholds based on actual usage
- Use inhibition rules to prevent duplicate alerts
- Adjust repeat intervals appropriately

### 3. Metric Retention

- Keep 30 days in Prometheus (default)
- Export long-term data if needed
- Consider remote storage for >30 days

### 4. Dashboard Customization

- Clone and modify dashboards as needed
- Add panels for your specific needs
- Share dashboards with team

### 5. Documentation

- Document custom metrics
- Update alert runbooks
- Keep this guide current

---

## Additional Resources

- **Prometheus Documentation:** https://prometheus.io/docs/
- **Grafana Documentation:** https://grafana.com/docs/
- **PromQL Tutorial:** https://prometheus.io/docs/prometheus/latest/querying/basics/
- **Alert Rule Examples:** https://awesome-prometheus-alerts.grep.to/

---

**Monitoring Guide Version:** 1.0
**Last Updated:** 2025-01-13
**Maintained By:** Analytics Server Team
