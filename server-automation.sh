#!/bin/bash

# ========================================================
# Server Automation Script for tri-card-eye-stats
# ========================================================
# This script automates server management tasks including:
# - Installation and setup
# - Deployment
# - Updates
# - Monitoring
# - Backups
# - Automatic restarts
# - Log management
# ========================================================

# Set script to exit on error
set -e

# Configuration variables
APP_NAME="tri-card-eye-stats"
APP_DIR="$HOME/$APP_NAME"
REPO_URL="https://github.com/yourusername/$APP_NAME.git"  # Replace with your actual repo URL
LOG_DIR="$APP_DIR/logs"
BACKUP_DIR="$APP_DIR/backups"
ENV_FILE="$APP_DIR/.env"
NODE_VERSION="18"  # Specify the Node.js version you want to use
PORT=3000
HEALTH_CHECK_INTERVAL=5  # Minutes between health checks
MAX_LOG_SIZE=100M  # Maximum log file size before rotation
MAX_LOG_FILES=10   # Number of log files to keep

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ========================================================
# Helper Functions
# ========================================================

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

check_dependencies() {
    log "Checking dependencies..."
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        error "Node.js is not installed. Installing Node.js $NODE_VERSION..."
        curl -fsSL https://deb.nodesource.com/setup_$NODE_VERSION.x | sudo -E bash -
        sudo apt-get install -y nodejs
    else
        success "Node.js is installed: $(node -v)"
    fi
    
    # Check if npm is installed
    if ! command -v npm &> /dev/null; then
        error "npm is not installed. Installing npm..."
        sudo apt-get install -y npm
    else
        success "npm is installed: $(npm -v)"
    fi
    
    # Check if PM2 is installed
    if ! command -v pm2 &> /dev/null; then
        warn "PM2 is not installed. Installing PM2..."
        sudo npm install -g pm2
    else
        success "PM2 is installed: $(pm2 -v)"
    fi
    
    # Check if Git is installed
    if ! command -v git &> /dev/null; then
        error "Git is not installed. Installing Git..."
        sudo apt-get update
        sudo apt-get install -y git
    else
        success "Git is installed: $(git --version)"
    fi
}

setup_directories() {
    log "Setting up directories..."
    
    # Create application directory if it doesn't exist
    if [ ! -d "$APP_DIR" ]; then
        mkdir -p "$APP_DIR"
        success "Created application directory: $APP_DIR"
    fi
    
    # Create logs directory
    if [ ! -d "$LOG_DIR" ]; then
        mkdir -p "$LOG_DIR"
        success "Created logs directory: $LOG_DIR"
    fi
    
    # Create backups directory
    if [ ! -d "$BACKUP_DIR" ]; then
        mkdir -p "$BACKUP_DIR"
        success "Created backups directory: $BACKUP_DIR"
    fi
}

clone_repository() {
    log "Cloning repository..."
    
    if [ -d "$APP_DIR/.git" ]; then
        warn "Repository already exists. Pulling latest changes..."
        cd "$APP_DIR"
        git pull
        success "Repository updated successfully"
    else
        log "Cloning repository from $REPO_URL..."
        git clone "$REPO_URL" "$APP_DIR"
        success "Repository cloned successfully"
    fi
}

setup_environment() {
    log "Setting up environment..."
    
    if [ ! -f "$ENV_FILE" ]; then
        warn ".env file not found. Creating a template .env file..."
        cat > "$ENV_FILE" << EOF
# Supabase configuration
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key

# Telegram configuration
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_CHAT_ID=your-telegram-chat-id

# Server configuration
PORT=$PORT
NODE_ENV=production
EOF
        error "Please edit $ENV_FILE with your actual configuration values"
        exit 1
    else
        success "Environment file exists"
    fi
}

install_dependencies() {
    log "Installing application dependencies..."
    
    cd "$APP_DIR"
    npm install
    success "Dependencies installed successfully"
}

build_application() {
    log "Building application..."
    
    cd "$APP_DIR"
    npm run build
    success "Application built successfully"
}

start_application() {
    log "Starting application with PM2..."
    
    cd "$APP_DIR"
    
    # Check if the application is already running
    if pm2 list | grep -q "$APP_NAME"; then
        warn "Application is already running. Restarting..."
        pm2 restart "$APP_NAME"
    else
        # Start the application with PM2
        pm2 start server.cjs --name "$APP_NAME" --log "$LOG_DIR/app.log" --time
        
        # Save the PM2 configuration
        pm2 save
        
        # Setup PM2 to start on system boot
        pm2 startup
    fi
    
    success "Application started successfully"
}

stop_application() {
    log "Stopping application..."
    
    if pm2 list | grep -q "$APP_NAME"; then
        pm2 stop "$APP_NAME"
        success "Application stopped successfully"
    else
        warn "Application is not running"
    fi
}

restart_application() {
    log "Restarting application..."
    
    if pm2 list | grep -q "$APP_NAME"; then
        pm2 restart "$APP_NAME"
        success "Application restarted successfully"
    else
        warn "Application is not running. Starting..."
        start_application
    fi
}

check_application_health() {
    log "Checking application health..."
    
    # Check if the application is running
    if ! pm2 list | grep -q "$APP_NAME"; then
        error "Application is not running. Starting..."
        start_application
        return
    fi
    
    # Check if the application is responding
    if ! curl -s "http://localhost:$PORT" > /dev/null; then
        error "Application is not responding. Restarting..."
        restart_application
    else
        success "Application is healthy"
    fi
}

update_application() {
    log "Updating application..."
    
    cd "$APP_DIR"
    
    # Backup current version
    backup_application
    
    # Pull latest changes
    git pull
    
    # Install dependencies
    install_dependencies
    
    # Build application
    build_application
    
    # Restart application
    restart_application
    
    success "Application updated successfully"
}

backup_application() {
    log "Backing up application..."
    
    BACKUP_FILE="$BACKUP_DIR/$APP_NAME-$(date +'%Y%m%d-%H%M%S').tar.gz"
    
    # Create a backup of the application
    tar -czf "$BACKUP_FILE" -C "$(dirname "$APP_DIR")" "$(basename "$APP_DIR")" --exclude="$APP_DIR/node_modules" --exclude="$APP_DIR/dist"
    
    # Remove old backups (keep the 5 most recent)
    ls -t "$BACKUP_DIR"/*.tar.gz | tail -n +6 | xargs -r rm
    
    success "Application backed up to $BACKUP_FILE"
}

rotate_logs() {
    log "Rotating logs..."
    
    # Check if logrotate is installed
    if ! command -v logrotate &> /dev/null; then
        warn "logrotate is not installed. Installing..."
        sudo apt-get update
        sudo apt-get install -y logrotate
    fi
    
    # Create logrotate configuration
    LOGROTATE_CONF="/etc/logrotate.d/$APP_NAME"
    
    if [ ! -f "$LOGROTATE_CONF" ]; then
        log "Creating logrotate configuration..."
        
        sudo tee "$LOGROTATE_CONF" > /dev/null << EOF
$LOG_DIR/*.log {
    daily
    size $MAX_LOG_SIZE
    rotate $MAX_LOG_FILES
    compress
    delaycompress
    missingok
    notifempty
    create 644 root root
}
EOF
        success "Logrotate configuration created"
    else
        success "Logrotate configuration already exists"
    fi
    
    # Force log rotation
    sudo logrotate -f "$LOGROTATE_CONF"
    
    success "Logs rotated successfully"
}

setup_cron_jobs() {
    log "Setting up cron jobs..."
    
    # Create a temporary file for crontab
    TEMP_CRON=$(mktemp)
    
    # Export current crontab
    crontab -l > "$TEMP_CRON" 2>/dev/null || echo "" > "$TEMP_CRON"
    
    # Add health check cron job if it doesn't exist
    if ! grep -q "check_application_health" "$TEMP_CRON"; then
        echo "*/$HEALTH_CHECK_INTERVAL * * * * $APP_DIR/server-automation.sh health-check >> $LOG_DIR/health-check.log 2>&1" >> "$TEMP_CRON"
        success "Added health check cron job"
    fi
    
    # Add daily update cron job if it doesn't exist
    if ! grep -q "update_application" "$TEMP_CRON"; then
        echo "0 3 * * * $APP_DIR/server-automation.sh update >> $LOG_DIR/update.log 2>&1" >> "$TEMP_CRON"
        success "Added daily update cron job"
    fi
    
    # Add log rotation cron job if it doesn't exist
    if ! grep -q "rotate_logs" "$TEMP_CRON"; then
        echo "0 0 * * * $APP_DIR/server-automation.sh rotate-logs >> $LOG_DIR/rotate-logs.log 2>&1" >> "$TEMP_CRON"
        success "Added log rotation cron job"
    fi
    
    # Add weekly backup cron job if it doesn't exist
    if ! grep -q "backup_application" "$TEMP_CRON"; then
        echo "0 2 * * 0 $APP_DIR/server-automation.sh backup >> $LOG_DIR/backup.log 2>&1" >> "$TEMP_CRON"
        success "Added weekly backup cron job"
    fi
    
    # Install the new crontab
    crontab "$TEMP_CRON"
    
    # Remove the temporary file
    rm "$TEMP_CRON"
    
    success "Cron jobs setup successfully"
}

# ========================================================
# Main Script
# ========================================================

# Copy this script to the application directory
if [ "$0" != "$APP_DIR/server-automation.sh" ]; then
    mkdir -p "$APP_DIR"
    cp "$0" "$APP_DIR/server-automation.sh"
    chmod +x "$APP_DIR/server-automation.sh"
    log "Script copied to $APP_DIR/server-automation.sh"
fi

# Process command line arguments
case "$1" in
    install)
        log "=== Installing $APP_NAME ==="
        check_dependencies
        setup_directories
        clone_repository
        setup_environment
        install_dependencies
        build_application
        start_application
        setup_cron_jobs
        success "=== Installation completed successfully ==="
        ;;
    start)
        log "=== Starting $APP_NAME ==="
        start_application
        ;;
    stop)
        log "=== Stopping $APP_NAME ==="
        stop_application
        ;;
    restart)
        log "=== Restarting $APP_NAME ==="
        restart_application
        ;;
    update)
        log "=== Updating $APP_NAME ==="
        update_application
        ;;
    backup)
        log "=== Backing up $APP_NAME ==="
        backup_application
        ;;
    health-check)
        check_application_health
        ;;
    rotate-logs)
        rotate_logs
        ;;
    *)
        echo "Usage: $0 {install|start|stop|restart|update|backup|health-check|rotate-logs}"
        echo ""
        echo "Commands:"
        echo "  install      Install and setup the application"
        echo "  start        Start the application"
        echo "  stop         Stop the application"
        echo "  restart      Restart the application"
        echo "  update       Update the application to the latest version"
        echo "  backup       Create a backup of the application"
        echo "  health-check Check if the application is running and responding"
        echo "  rotate-logs  Rotate log files"
        exit 1
        ;;
esac

exit 0
