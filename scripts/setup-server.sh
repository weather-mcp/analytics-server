#!/bin/bash

# Server Setup Script for DigitalOcean
# This script prepares a fresh Ubuntu 22.04/24.04 droplet for deployment
# Run this script ON the DigitalOcean droplet after initial creation

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/analytics-server}"

# Function to print colored messages
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Check if running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run as root"
        exit 1
    fi
}

# Update system packages
update_system() {
    log_step "Updating system packages..."
    apt-get update
    apt-get upgrade -y
    log_info "System updated ✓"
}

# Install required packages
install_packages() {
    log_step "Installing required packages..."
    apt-get install -y \
        curl \
        wget \
        git \
        vim \
        htop \
        ufw \
        fail2ban \
        unattended-upgrades \
        ca-certificates \
        gnupg \
        lsb-release
    log_info "Required packages installed ✓"
}

# Install Docker
install_docker() {
    log_step "Installing Docker..."

    # Check if Docker is already installed
    if command -v docker &> /dev/null; then
        log_info "Docker is already installed"
        docker --version
        return
    fi

    # Add Docker's official GPG key
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    # Add the repository to Apt sources
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null

    # Update package index
    apt-get update

    # Install Docker Engine
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    # Start and enable Docker
    systemctl start docker
    systemctl enable docker

    log_info "Docker installed successfully ✓"
    docker --version
}

# Configure firewall
configure_firewall() {
    log_step "Configuring firewall (UFW)..."

    # Reset UFW to default
    ufw --force reset

    # Set default policies
    ufw default deny incoming
    ufw default allow outgoing

    # Allow SSH
    ufw allow 22/tcp comment 'SSH'

    # Allow HTTP and HTTPS
    ufw allow 80/tcp comment 'HTTP'
    ufw allow 443/tcp comment 'HTTPS'

    # Enable UFW
    ufw --force enable

    log_info "Firewall configured ✓"
    ufw status
}

# Configure fail2ban
configure_fail2ban() {
    log_step "Configuring fail2ban..."

    # Create local configuration
    cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
# Ban hosts for 1 hour
bantime = 3600

# A host is banned if it has generated "maxretry" during "findtime"
findtime = 600
maxretry = 5

# Email settings (configure if needed)
destemail = root@localhost
sendername = Fail2Ban
mta = sendmail

[sshd]
enabled = true
port = 22
logpath = %(sshd_log)s
backend = %(sshd_backend)s
EOF

    # Restart fail2ban
    systemctl restart fail2ban
    systemctl enable fail2ban

    log_info "Fail2ban configured ✓"
}

# Configure automatic security updates
configure_auto_updates() {
    log_step "Configuring automatic security updates..."

    # Enable unattended upgrades
    cat > /etc/apt/apt.conf.d/50unattended-upgrades << 'EOF'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};

Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::MinimalSteps "true";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
EOF

    # Enable automatic updates
    cat > /etc/apt/apt.conf.d/20auto-upgrades << 'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";
EOF

    log_info "Automatic security updates configured ✓"
}

# Create deployment directory
create_deploy_directory() {
    log_step "Creating deployment directory..."

    mkdir -p "$DEPLOY_PATH"
    chmod 755 "$DEPLOY_PATH"

    log_info "Deployment directory created at $DEPLOY_PATH ✓"
}

# Configure swap (if not exists)
configure_swap() {
    log_step "Configuring swap space..."

    # Check if swap already exists
    if swapon --show | grep -q '/swapfile'; then
        log_info "Swap is already configured"
        return
    fi

    # Create 2GB swap file
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile

    # Make swap permanent
    if ! grep -q '/swapfile' /etc/fstab; then
        echo '/swapfile none swap sw 0 0' >> /etc/fstab
    fi

    # Configure swappiness
    sysctl vm.swappiness=10
    if ! grep -q 'vm.swappiness' /etc/sysctl.conf; then
        echo 'vm.swappiness=10' >> /etc/sysctl.conf
    fi

    log_info "Swap configured (2GB) ✓"
}

# Optimize Docker for production
optimize_docker() {
    log_step "Optimizing Docker configuration..."

    mkdir -p /etc/docker

    cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2"
}
EOF

    systemctl restart docker

    log_info "Docker optimized ✓"
}

# Display system information
show_system_info() {
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_info "System Information"
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "OS: $(lsb_release -ds)"
    echo "Kernel: $(uname -r)"
    echo "Docker: $(docker --version)"
    echo "Memory: $(free -h | awk '/^Mem:/ {print $2}')"
    echo "Disk: $(df -h / | awk 'NR==2 {print $2}')"
    echo "Swap: $(free -h | awk '/^Swap:/ {print $2}')"
    echo ""
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# Main setup function
main() {
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_info "Analytics Server - Server Setup"
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    check_root
    update_system
    install_packages
    install_docker
    configure_firewall
    configure_fail2ban
    configure_auto_updates
    create_deploy_directory
    configure_swap
    optimize_docker

    echo ""
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_info "Server setup completed successfully! 🚀"
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    show_system_info
    echo ""
    log_info "Next steps:"
    echo "  1. Update SSH configuration if needed"
    echo "  2. Add SSH keys for deployment"
    echo "  3. Run deployment script from your local machine"
    echo ""
    log_warn "⚠️  Remember to:"
    echo "  - Configure domain DNS to point to this server"
    echo "  - Set up SSL/TLS certificates (Let's Encrypt recommended)"
    echo "  - Update .env file with production values after deployment"
    echo ""
}

# Run main function
main "$@"
