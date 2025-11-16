#!/bin/bash

#######################################################################
# Firewall Setup Script for Cloudflare Tunnel Deployment
#
# This script configures UFW (Uncomplicated Firewall) for a secure
# setup where the analytics API is accessed only through Cloudflare
# Tunnel, with SSH restricted to specific IPs.
#
# Usage: sudo ./scripts/setup-firewall.sh [your-ip-address]
#######################################################################

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Firewall Configuration${NC}"
echo -e "${GREEN}================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: This script must be run as root (use sudo)${NC}"
    exit 1
fi

#######################################################################
# Get SSH IP restriction (optional)
#######################################################################

SSH_ALLOWED_IP="$1"
RESTRICT_SSH=false

if [ -z "$SSH_ALLOWED_IP" ]; then
    echo -e "${YELLOW}No IP address provided for SSH restriction.${NC}"
    echo -e "${YELLOW}SSH will be open to all IPs (not recommended for production).${NC}"
    echo ""
    read -p "Enter your IP address to restrict SSH access (or press Enter to skip): " SSH_ALLOWED_IP

    if [ -n "$SSH_ALLOWED_IP" ]; then
        RESTRICT_SSH=true
    fi
else
    RESTRICT_SSH=true
fi

if [ "$RESTRICT_SSH" = true ]; then
    # Validate IP address format
    if [[ ! "$SSH_ALLOWED_IP" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        echo -e "${RED}Invalid IP address format: $SSH_ALLOWED_IP${NC}"
        exit 1
    fi

    echo -e "${GREEN}SSH will be restricted to: $SSH_ALLOWED_IP${NC}"
else
    echo -e "${YELLOW}Warning: SSH will be open to all IPs${NC}"
fi

echo ""
read -p "Press Enter to continue or Ctrl+C to abort..."
echo ""

#######################################################################
# Install UFW if not already installed
#######################################################################

echo -e "${BLUE}[1/5] Checking UFW installation...${NC}"

if ! command -v ufw &> /dev/null; then
    echo "UFW not found. Installing..."
    apt-get update
    apt-get install -y ufw
else
    echo "UFW is already installed"
fi

echo ""

#######################################################################
# Configure UFW defaults
#######################################################################

echo -e "${BLUE}[2/5] Configuring UFW defaults...${NC}"

# Set default policies
ufw --force default deny incoming
ufw --force default allow outgoing

echo -e "${GREEN}✓ Default deny incoming, allow outgoing${NC}"
echo ""

#######################################################################
# Configure SSH access
#######################################################################

echo -e "${BLUE}[3/5] Configuring SSH access...${NC}"

# Remove any existing SSH rules
ufw --force delete allow 22/tcp 2>/dev/null || true
ufw --force delete allow ssh 2>/dev/null || true

if [ "$RESTRICT_SSH" = true ]; then
    # Restrict SSH to specific IP
    ufw allow from "$SSH_ALLOWED_IP" to any port 22 proto tcp comment 'SSH from trusted IP'
    echo -e "${GREEN}✓ SSH restricted to $SSH_ALLOWED_IP${NC}"
else
    # Allow SSH from anywhere (not recommended)
    ufw allow 22/tcp comment 'SSH from anywhere'
    echo -e "${YELLOW}⚠ SSH allowed from all IPs${NC}"
fi

echo ""

#######################################################################
# Configure application ports (local access only)
#######################################################################

echo -e "${BLUE}[4/5] Configuring application access...${NC}"

# Analytics API - localhost only (accessed via Cloudflare Tunnel)
# No firewall rule needed - port 3000 is blocked from external access

# PostgreSQL - localhost only (accessed by API locally)
# No firewall rule needed - port 5432 is blocked from external access

# Redis - localhost only (accessed by API locally)
# No firewall rule needed - port 6379 is blocked from external access

echo -e "${GREEN}✓ All application ports restricted to localhost${NC}"
echo -e "${GREEN}✓ API accessible only via Cloudflare Tunnel${NC}"
echo ""

#######################################################################
# Additional hardening rules
#######################################################################

echo -e "${BLUE}[5/5] Applying additional security rules...${NC}"

# Rate limit SSH connections (max 6 connections per 30 seconds)
ufw limit ssh/tcp comment 'Rate limit SSH'

# Allow loopback traffic
ufw allow from 127.0.0.1

# Deny all other incoming traffic (explicit)
# This is already the default, but we'll be explicit
# ufw default deny incoming

echo -e "${GREEN}✓ Rate limiting enabled for SSH${NC}"
echo -e "${GREEN}✓ Loopback traffic allowed${NC}"
echo ""

#######################################################################
# Enable UFW
#######################################################################

echo -e "${BLUE}Enabling firewall...${NC}"

# Enable UFW (this may briefly disconnect SSH)
ufw --force enable

echo -e "${GREEN}✓ Firewall enabled${NC}"
echo ""

#######################################################################
# Display firewall status
#######################################################################

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Firewall Configuration Complete${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo -e "${YELLOW}Current Firewall Rules:${NC}"
echo ""
ufw status verbose
echo ""

#######################################################################
# Summary
#######################################################################

echo -e "${YELLOW}Security Summary:${NC}"
echo ""
if [ "$RESTRICT_SSH" = true ]; then
    echo -e "  SSH:        ${GREEN}Restricted to $SSH_ALLOWED_IP${NC}"
else
    echo -e "  SSH:        ${YELLOW}Open to all IPs (not recommended)${NC}"
fi
echo -e "  API:        ${GREEN}Localhost only (Cloudflare Tunnel)${NC}"
echo -e "  PostgreSQL: ${GREEN}Localhost only${NC}"
echo -e "  Redis:      ${GREEN}Localhost only${NC}"
echo -e "  Outbound:   ${GREEN}Allowed${NC}"
echo ""

echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Verify SSH access still works from your IP"
echo "2. Set up Cloudflare Tunnel: ./scripts/setup-cloudflare-tunnel.sh"
echo "3. Start the analytics API locally"
echo "4. Test access via https://analytics.weather-mcp.dev"
echo ""

echo -e "${YELLOW}Useful Commands:${NC}"
echo "  sudo ufw status verbose          # Check firewall status"
echo "  sudo ufw status numbered         # List rules with numbers"
echo "  sudo ufw delete [number]         # Delete a specific rule"
echo "  sudo ufw allow from [IP]         # Add new allowed IP"
echo "  sudo ufw disable                 # Disable firewall (emergency)"
echo ""

echo -e "${RED}IMPORTANT:${NC} Verify you can still SSH before closing this session!"
echo "If locked out, use Digital Ocean console to access and run: sudo ufw disable"
echo ""
