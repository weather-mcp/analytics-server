#!/bin/bash

# Cron Setup Script
# Configures automated tasks for the analytics server
# Usage: sudo ./setup-cron.sh

set -e

echo "=================================================="
echo "Analytics Server - Cron Setup"
echo "=================================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Error: This script must be run as root (use sudo)"
    exit 1
fi

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Project root: $PROJECT_ROOT"
echo ""

# Ask for configuration
read -p "Enter backup schedule (default: daily at 2 AM) [0 2 * * *]: " BACKUP_SCHEDULE
BACKUP_SCHEDULE=${BACKUP_SCHEDULE:-"0 2 * * *"}

read -p "Enter health check schedule (default: every 5 minutes) [*/5 * * * *]: " HEALTH_SCHEDULE
HEALTH_SCHEDULE=${HEALTH_SCHEDULE:-"*/5 * * * *"}

read -p "Enter backup directory (default: $PROJECT_ROOT/backups): " BACKUP_DIR
BACKUP_DIR=${BACKUP_DIR:-"$PROJECT_ROOT/backups"}

read -p "Enter user to run cron jobs as (default: $SUDO_USER): " CRON_USER
CRON_USER=${CRON_USER:-"$SUDO_USER"}

echo ""
echo "Configuration:"
echo "  Backup schedule: $BACKUP_SCHEDULE"
echo "  Health check schedule: $HEALTH_SCHEDULE"
echo "  Backup directory: $BACKUP_DIR"
echo "  User: $CRON_USER"
echo ""

read -p "Continue with these settings? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Setup cancelled."
    exit 0
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"
chown "$CRON_USER:$CRON_USER" "$BACKUP_DIR"

# Create temporary crontab file
TEMP_CRON=$(mktemp)

# Backup existing crontab
if crontab -u "$CRON_USER" -l > /dev/null 2>&1; then
    crontab -u "$CRON_USER" -l > "$TEMP_CRON"
    echo "✓ Backed up existing crontab"
else
    touch "$TEMP_CRON"
    echo "✓ Creating new crontab"
fi

# Remove existing analytics cron jobs
sed -i '/# Analytics Server/d' "$TEMP_CRON"
sed -i '/backup-db.sh/d' "$TEMP_CRON"
sed -i '/health-check.sh/d' "$TEMP_CRON"

# Add analytics cron jobs
cat >> "$TEMP_CRON" << EOF

# Analytics Server - Automated Tasks
# Generated on $(date)

# Database backup (runs at $BACKUP_SCHEDULE)
$BACKUP_SCHEDULE cd $PROJECT_ROOT && $SCRIPT_DIR/backup-db.sh $BACKUP_DIR >> $PROJECT_ROOT/logs/backup.log 2>&1

# Health check (runs at $HEALTH_SCHEDULE)
$HEALTH_SCHEDULE cd $PROJECT_ROOT && $SCRIPT_DIR/health-check.sh >> $PROJECT_ROOT/logs/health.log 2>&1

EOF

# Install new crontab
crontab -u "$CRON_USER" "$TEMP_CRON"
rm "$TEMP_CRON"

echo "✓ Crontab installed"
echo ""

# Create logs directory
mkdir -p "$PROJECT_ROOT/logs"
chown "$CRON_USER:$CRON_USER" "$PROJECT_ROOT/logs"
echo "✓ Logs directory created"

# Set up logrotate
LOGROTATE_CONF="/etc/logrotate.d/analytics-server"
cat > "$LOGROTATE_CONF" << EOF
$PROJECT_ROOT/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    notifempty
    create 0644 $CRON_USER $CRON_USER
    missingok
}
EOF
echo "✓ Logrotate configured"

echo ""
echo "=================================================="
echo "✓ Cron setup completed successfully!"
echo "=================================================="
echo ""
echo "Scheduled tasks:"
echo ""
echo "1. Database Backup"
echo "   Schedule: $BACKUP_SCHEDULE ($(echo "$BACKUP_SCHEDULE" | sed 's/\*\*\*\*/every day/'))"
echo "   Location: $BACKUP_DIR"
echo "   Log: $PROJECT_ROOT/logs/backup.log"
echo ""
echo "2. Health Check"
echo "   Schedule: $HEALTH_SCHEDULE ($(echo "$HEALTH_SCHEDULE" | sed 's/\*\/5.*/every 5 minutes/'))"
echo "   Log: $PROJECT_ROOT/logs/health.log"
echo ""
echo "To view scheduled tasks:"
echo "  crontab -u $CRON_USER -l"
echo ""
echo "To view logs:"
echo "  tail -f $PROJECT_ROOT/logs/backup.log"
echo "  tail -f $PROJECT_ROOT/logs/health.log"
echo ""
echo "To manually run backups:"
echo "  $SCRIPT_DIR/backup-db.sh $BACKUP_DIR"
echo ""
echo "To manually run health checks:"
echo "  $SCRIPT_DIR/health-check.sh"
echo ""
