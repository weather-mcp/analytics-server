#!/bin/bash

#######################################################################
# Cloudflare Tunnel Setup Script
#
# This script automates the installation and configuration of
# Cloudflare Tunnel (cloudflared) for the Weather MCP Analytics Server
#
# Usage: sudo ./scripts/setup-cloudflare-tunnel.sh
#######################################################################

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
CLOUDFLARED_VERSION="latest"
TUNNEL_NAME="weather-mcp-analytics"
SERVICE_PORT="3000"
DOMAIN="analytics.weather-mcp.dev"

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Cloudflare Tunnel Setup${NC}"
echo -e "${GREEN}================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: This script must be run as root (use sudo)${NC}"
    exit 1
fi

# Get the actual user (not root when using sudo)
ACTUAL_USER=${SUDO_USER:-$USER}
USER_HOME=$(eval echo ~$ACTUAL_USER)

echo -e "${YELLOW}Installing as user: $ACTUAL_USER${NC}"
echo -e "${YELLOW}Home directory: $USER_HOME${NC}"
echo ""

#######################################################################
# Step 1: Install cloudflared
#######################################################################

echo -e "${GREEN}[1/6] Installing cloudflared...${NC}"

# Detect architecture
ARCH=$(uname -m)
case $ARCH in
    x86_64)
        CLOUDFLARED_ARCH="amd64"
        ;;
    aarch64|arm64)
        CLOUDFLARED_ARCH="arm64"
        ;;
    armv7l)
        CLOUDFLARED_ARCH="armhf"
        ;;
    *)
        echo -e "${RED}Unsupported architecture: $ARCH${NC}"
        exit 1
        ;;
esac

# Download and install
CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CLOUDFLARED_ARCH}.deb"
echo "Downloading from: $CLOUDFLARED_URL"

wget -q --show-progress "$CLOUDFLARED_URL" -O /tmp/cloudflared.deb
dpkg -i /tmp/cloudflared.deb
rm /tmp/cloudflared.deb

# Verify installation
if ! command -v cloudflared &> /dev/null; then
    echo -e "${RED}Failed to install cloudflared${NC}"
    exit 1
fi

INSTALLED_VERSION=$(cloudflared --version)
echo -e "${GREEN}✓ Installed: $INSTALLED_VERSION${NC}"
echo ""

#######################################################################
# Step 2: Authenticate with Cloudflare
#######################################################################

echo -e "${GREEN}[2/6] Authenticating with Cloudflare...${NC}"
echo -e "${YELLOW}A browser window will open for authentication.${NC}"
echo -e "${YELLOW}Please login to your Cloudflare account.${NC}"
echo ""
read -p "Press Enter to continue..."

# Run as actual user, not root
sudo -u $ACTUAL_USER cloudflared tunnel login

if [ ! -f "$USER_HOME/.cloudflared/cert.pem" ]; then
    echo -e "${RED}Authentication failed - cert.pem not found${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Authentication successful${NC}"
echo ""

#######################################################################
# Step 3: Create Tunnel
#######################################################################

echo -e "${GREEN}[3/6] Creating Cloudflare Tunnel...${NC}"

# Check if tunnel already exists
EXISTING_TUNNEL=$(sudo -u $ACTUAL_USER cloudflared tunnel list | grep "$TUNNEL_NAME" || true)

if [ -n "$EXISTING_TUNNEL" ]; then
    echo -e "${YELLOW}Tunnel '$TUNNEL_NAME' already exists${NC}"
    TUNNEL_ID=$(echo "$EXISTING_TUNNEL" | awk '{print $1}')
else
    # Create new tunnel
    sudo -u $ACTUAL_USER cloudflared tunnel create "$TUNNEL_NAME"
    TUNNEL_ID=$(sudo -u $ACTUAL_USER cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
fi

echo -e "${GREEN}✓ Tunnel ID: $TUNNEL_ID${NC}"
echo ""

#######################################################################
# Step 4: Configure Tunnel
#######################################################################

echo -e "${GREEN}[4/6] Configuring Tunnel...${NC}"

# Create config directory if it doesn't exist
mkdir -p $USER_HOME/.cloudflared
chown $ACTUAL_USER:$ACTUAL_USER $USER_HOME/.cloudflared

# Find credentials file
CREDENTIALS_FILE="$USER_HOME/.cloudflared/${TUNNEL_ID}.json"

if [ ! -f "$CREDENTIALS_FILE" ]; then
    echo -e "${RED}Credentials file not found: $CREDENTIALS_FILE${NC}"
    exit 1
fi

# Create config file
CONFIG_FILE="$USER_HOME/.cloudflared/config.yml"

cat > "$CONFIG_FILE" <<EOF
# Cloudflare Tunnel Configuration
# Weather MCP Analytics Server

tunnel: $TUNNEL_ID
credentials-file: $CREDENTIALS_FILE

# Ingress rules - order matters!
ingress:
  # Analytics API
  - hostname: $DOMAIN
    service: http://localhost:$SERVICE_PORT
    originRequest:
      noTLSVerify: false
      connectTimeout: 30s
      httpHostHeader: $DOMAIN

  # Catch-all rule (required)
  - service: http_status:404

# Logging
loglevel: info
EOF

chown $ACTUAL_USER:$ACTUAL_USER "$CONFIG_FILE"

echo -e "${GREEN}✓ Configuration file created: $CONFIG_FILE${NC}"
echo ""

#######################################################################
# Step 5: Configure DNS
#######################################################################

echo -e "${GREEN}[5/6] Configuring DNS...${NC}"

# Route DNS through Cloudflare
sudo -u $ACTUAL_USER cloudflared tunnel route dns "$TUNNEL_NAME" "$DOMAIN"

echo -e "${GREEN}✓ DNS configured for $DOMAIN${NC}"
echo ""

#######################################################################
# Step 6: Install as System Service
#######################################################################

echo -e "${GREEN}[6/6] Installing systemd service...${NC}"

# Install service (runs as root by default)
cloudflared service install

# Update service to run as actual user
SERVICE_FILE="/etc/systemd/system/cloudflared.service"

if [ -f "$SERVICE_FILE" ]; then
    # Backup original
    cp "$SERVICE_FILE" "${SERVICE_FILE}.backup"

    # Update to run as actual user
    sed -i "s|User=root|User=$ACTUAL_USER|g" "$SERVICE_FILE"
    sed -i "s|/root/.cloudflared|$USER_HOME/.cloudflared|g" "$SERVICE_FILE"

    # Reload systemd
    systemctl daemon-reload
fi

# Enable and start service
systemctl enable cloudflared
systemctl start cloudflared

# Check status
sleep 2
if systemctl is-active --quiet cloudflared; then
    echo -e "${GREEN}✓ Cloudflared service is running${NC}"
else
    echo -e "${RED}Warning: Cloudflared service may not be running properly${NC}"
    echo -e "${YELLOW}Check status with: sudo systemctl status cloudflared${NC}"
fi

echo ""

#######################################################################
# Summary
#######################################################################

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo -e "Tunnel Name:    ${GREEN}$TUNNEL_NAME${NC}"
echo -e "Tunnel ID:      ${GREEN}$TUNNEL_ID${NC}"
echo -e "Domain:         ${GREEN}$DOMAIN${NC}"
echo -e "Local Service:  ${GREEN}http://localhost:$SERVICE_PORT${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Ensure your analytics API is running on port $SERVICE_PORT"
echo "2. Test your tunnel: curl https://$DOMAIN/health"
echo "3. Check tunnel status: sudo systemctl status cloudflared"
echo "4. View tunnel logs: sudo journalctl -u cloudflared -f"
echo ""
echo -e "${YELLOW}Useful Commands:${NC}"
echo "  sudo systemctl status cloudflared   # Check service status"
echo "  sudo systemctl restart cloudflared  # Restart tunnel"
echo "  sudo systemctl stop cloudflared     # Stop tunnel"
echo "  cloudflared tunnel list             # List all tunnels"
echo "  cloudflared tunnel info $TUNNEL_NAME # Tunnel details"
echo ""
echo -e "${GREEN}Your analytics API is now securely accessible via Cloudflare!${NC}"
echo ""
