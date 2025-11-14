#!/bin/bash

# DigitalOcean Deployment Script
# This script automates deployment to a DigitalOcean droplet
# Can be run manually or via CI/CD

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration (can be overridden by environment variables)
DROPLET_IP="${DIGITALOCEAN_DROPLET_IP:-}"
SSH_USER="${DEPLOY_SSH_USER:-root}"
SSH_KEY="${SSH_KEY_PATH:-$HOME/.ssh/id_rsa}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/analytics-server}"
DOCKER_COMPOSE_FILES="${DOCKER_COMPOSE_FILES:-docker-compose.yml:docker-compose.prod.yml}"

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

# Function to check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check if required variables are set
    if [ -z "$DROPLET_IP" ]; then
        log_error "DIGITALOCEAN_DROPLET_IP environment variable is not set"
        echo "Usage: DIGITALOCEAN_DROPLET_IP=your-ip ./scripts/deploy-digitalocean.sh"
        exit 1
    fi

    # Check if SSH key exists
    if [ ! -f "$SSH_KEY" ]; then
        log_error "SSH key not found at: $SSH_KEY"
        echo "Set SSH_KEY_PATH environment variable to point to your SSH key"
        exit 1
    fi

    # Check if docker-compose files exist
    IFS=':' read -ra COMPOSE_FILES <<< "$DOCKER_COMPOSE_FILES"
    for file in "${COMPOSE_FILES[@]}"; do
        if [ ! -f "$file" ]; then
            log_error "Docker compose file not found: $file"
            exit 1
        fi
    done

    log_info "Prerequisites check passed ✓"
}

# Function to test SSH connection
test_ssh_connection() {
    log_info "Testing SSH connection to $DROPLET_IP..."

    if ssh -i "$SSH_KEY" -o ConnectTimeout=10 -o StrictHostKeyChecking=no \
        "$SSH_USER@$DROPLET_IP" "echo 'SSH connection successful'" > /dev/null 2>&1; then
        log_info "SSH connection successful ✓"
    else
        log_error "Failed to connect to $DROPLET_IP via SSH"
        exit 1
    fi
}

# Function to create deployment directory on server
create_deploy_directory() {
    log_info "Creating deployment directory on server..."

    ssh -i "$SSH_KEY" "$SSH_USER@$DROPLET_IP" << EOF
        mkdir -p $DEPLOY_PATH
        echo "Deployment directory created at $DEPLOY_PATH"
EOF
}

# Function to copy files to server
copy_files_to_server() {
    log_info "Copying files to server..."

    # Copy docker-compose files
    IFS=':' read -ra COMPOSE_FILES <<< "$DOCKER_COMPOSE_FILES"
    for file in "${COMPOSE_FILES[@]}"; do
        log_info "Copying $file..."
        scp -i "$SSH_KEY" "$file" "$SSH_USER@$DROPLET_IP:$DEPLOY_PATH/"
    done

    # Copy environment example
    if [ -f ".env.example" ]; then
        log_info "Copying .env.example..."
        scp -i "$SSH_KEY" .env.example "$SSH_USER@$DROPLET_IP:$DEPLOY_PATH/"
    fi

    # Copy configuration directories
    for dir in nginx prometheus alertmanager grafana scripts; do
        if [ -d "$dir" ]; then
            log_info "Copying $dir directory..."
            scp -r -i "$SSH_KEY" "$dir" "$SSH_USER@$DROPLET_IP:$DEPLOY_PATH/"
        fi
    done

    log_info "File copy completed ✓"
}

# Function to check if .env exists on server
check_env_file() {
    log_info "Checking for .env file on server..."

    ENV_EXISTS=$(ssh -i "$SSH_KEY" "$SSH_USER@$DROPLET_IP" \
        "[ -f $DEPLOY_PATH/.env ] && echo 'true' || echo 'false'")

    if [ "$ENV_EXISTS" = "false" ]; then
        log_warn ".env file not found on server"
        log_warn "Creating .env from .env.example..."
        ssh -i "$SSH_KEY" "$SSH_USER@$DROPLET_IP" \
            "cp $DEPLOY_PATH/.env.example $DEPLOY_PATH/.env"
        log_warn "⚠️  IMPORTANT: You must update $DEPLOY_PATH/.env with production values!"
        log_warn "⚠️  Update database passwords, secrets, and other sensitive values"

        read -p "Continue with deployment? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Deployment cancelled"
            exit 0
        fi
    else
        log_info ".env file exists ✓"
    fi
}

# Function to deploy services
deploy_services() {
    log_info "Deploying services to $DROPLET_IP..."

    ssh -i "$SSH_KEY" "$SSH_USER@$DROPLET_IP" << 'EOF'
        set -e
        cd '"$DEPLOY_PATH"'

        # Build compose file arguments
        COMPOSE_ARGS=""
        IFS=':' read -ra FILES <<< '"$DOCKER_COMPOSE_FILES"'
        for file in "${FILES[@]}"; do
            COMPOSE_ARGS="$COMPOSE_ARGS -f $file"
        done

        echo "Pulling latest images..."
        docker compose $COMPOSE_ARGS pull

        echo "Starting services..."
        docker compose $COMPOSE_ARGS up -d --remove-orphans

        echo "Waiting for services to start..."
        sleep 15

        echo "Checking service status..."
        docker compose $COMPOSE_ARGS ps

        echo "Pruning old Docker images..."
        docker image prune -f

        echo "✅ Deployment completed"
EOF

    log_info "Services deployed successfully ✓"
}

# Function to run health check
run_health_check() {
    log_info "Running health check..."

    # Wait for services to fully start
    sleep 10

    HEALTH_CHECK_RESULT=$(ssh -i "$SSH_KEY" "$SSH_USER@$DROPLET_IP" \
        "cd $DEPLOY_PATH && bash scripts/health-check.sh 2>&1" || echo "FAILED")

    if [[ "$HEALTH_CHECK_RESULT" == *"FAILED"* ]]; then
        log_error "Health check failed!"
        log_error "$HEALTH_CHECK_RESULT"
        exit 1
    else
        log_info "Health check passed ✓"
    fi
}

# Function to display post-deployment info
show_post_deployment_info() {
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_info "Deployment completed successfully! 🚀"
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Server: $SSH_USER@$DROPLET_IP"
    echo "Deploy path: $DEPLOY_PATH"
    echo ""
    echo "Services:"
    echo "  - API: http://$DROPLET_IP:3000"
    echo "  - Health: http://$DROPLET_IP:3000/v1/health"
    echo "  - Metrics: http://$DROPLET_IP:3000/metrics"
    echo ""
    echo "Monitoring (via SSH tunnel):"
    echo "  - Grafana: http://localhost:3001"
    echo "  - Prometheus: http://localhost:9090"
    echo "  - Alertmanager: http://localhost:9093"
    echo ""
    echo "To access monitoring, run:"
    echo "  ssh -L 3001:localhost:3001 -L 9090:localhost:9090 -L 9093:localhost:9093 $SSH_USER@$DROPLET_IP"
    echo ""
    echo "To view logs:"
    echo "  ssh $SSH_USER@$DROPLET_IP 'cd $DEPLOY_PATH && docker compose logs -f'"
    echo ""
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# Function to rollback deployment
rollback_deployment() {
    log_warn "Rolling back deployment..."

    ssh -i "$SSH_KEY" "$SSH_USER@$DROPLET_IP" << 'EOF'
        cd '"$DEPLOY_PATH"'

        COMPOSE_ARGS=""
        IFS=':' read -ra FILES <<< '"$DOCKER_COMPOSE_FILES"'
        for file in "${FILES[@]}"; do
            COMPOSE_ARGS="$COMPOSE_ARGS -f $file"
        done

        echo "Stopping services..."
        docker compose $COMPOSE_ARGS down

        echo "Starting services with previous image..."
        docker compose $COMPOSE_ARGS up -d

        echo "Rollback completed"
EOF

    log_warn "Rollback completed"
}

# Main deployment function
main() {
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_info "Analytics Server - DigitalOcean Deployment"
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    # Run deployment steps
    check_prerequisites
    test_ssh_connection
    create_deploy_directory
    copy_files_to_server
    check_env_file
    deploy_services

    # Run health check
    if ! run_health_check; then
        log_error "Deployment failed health check"
        read -p "Rollback deployment? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rollback_deployment
        fi
        exit 1
    fi

    # Show post-deployment info
    show_post_deployment_info
}

# Trap errors and offer rollback
trap 'log_error "Deployment failed at line $LINENO"' ERR

# Run main function
main "$@"
