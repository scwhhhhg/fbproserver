#!/bin/bash

# executor_wrapper.sh - Safe wrapper for FacebookPro Blaster Telegram bot calls
# This ensures proper environment and working directory
# Supports both development and production (encrypted) modes

# Set strict error handling
set -e

# Define paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOT_DIR="${SCRIPT_DIR}"
BASE_DIR="$(dirname "$BOT_DIR")"

# Set timezone
export TZ='Asia/Jakarta'

# Set NODE_ENV (default to production for encrypted mode)
export NODE_ENV="${NODE_ENV:-production}"

# Ensure we're in the correct directory
cd "$BOT_DIR" || {
    echo "❌ Failed to change to bot directory: $BOT_DIR"
    exit 1
}

# Determine which executor to use
# Development: executor.js exists (with extension)
# Production: executor exists (without extension, obfuscated by build.js)

if [ -f "executor.js" ]; then
    # Development mode: Use Node.js to run executor.js
    EXECUTOR_CMD="node executor.js"
    echo "ℹ️  Using Node.js executor (development): executor.js"
elif [ -f "executor" ]; then
    # Production mode: executor file without extension (obfuscated)
    # Check if it's a text file (JavaScript) or binary
    if file "executor" 2>/dev/null | grep -q "text"; then
        # It's a JavaScript file without extension
        EXECUTOR_CMD="node executor"
        echo "ℹ️  Using Node.js executor (production): executor"
    elif [ -x "executor" ]; then
        # It's an executable binary
        EXECUTOR_CMD="./executor"
        echo "ℹ️  Using compiled executor (binary): ./executor"
    else
        # File exists but not executable, try with node anyway
        EXECUTOR_CMD="node executor"
        echo "ℹ️  Using Node.js executor (fallback): executor"
    fi
else
    echo "❌ No executor found in $BOT_DIR"
    echo "   Looking for: executor.js (dev) or executor (prod)"
    exit 1
fi


# Parse arguments
COMMAND="$1"
BOT_NAME="$2"
ACCOUNT_ID="$3"

# Validate minimum arguments
if [ -z "$COMMAND" ]; then
    echo "❌ Usage: $0 <command> [bot_name] [account_id]"
    echo "   Examples:"
    echo "   $0 status"
    echo "   $0 list"
    echo "   $0 run updatestatus account1"
    echo "   $0 validate-cookies"
    exit 1
fi

# Log the execution
LOG_DIR="${BASE_DIR}/logs"
mkdir -p "$LOG_DIR"

if [ -n "$BOT_NAME" ] && [ -n "$ACCOUNT_ID" ]; then
    LOG_FILE="${LOG_DIR}/telegram_executor_${ACCOUNT_ID}_${BOT_NAME}_$(date +%Y%m%d_%H%M%S).log"
else
    LOG_FILE="${LOG_DIR}/telegram_executor_${COMMAND}_$(date +%Y%m%d_%H%M%S).log"
fi

{
    echo "=== FacebookPro Blaster Executor Call ==="
    echo "Time: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "Mode: $NODE_ENV"
    echo "Executor: $EXECUTOR_CMD"
    echo "Command: $COMMAND"
    [ -n "$BOT_NAME" ] && echo "Bot: $BOT_NAME"
    [ -n "$ACCOUNT_ID" ] && echo "Account: $ACCOUNT_ID"
    echo "Working Dir: $(pwd)"
    echo "Node Version: $(node --version 2>/dev/null || echo 'N/A')"
    echo "=========================================="
    echo ""
} > "$LOG_FILE"

# Execute with proper error handling
# Build command based on arguments provided
if [ -n "$ACCOUNT_ID" ]; then
    # Full command with bot and account
    $EXECUTOR_CMD "$COMMAND" "$BOT_NAME" "$ACCOUNT_ID" 2>&1 | tee -a "$LOG_FILE"
    EXIT_CODE=${PIPESTATUS[0]}
elif [ -n "$BOT_NAME" ]; then
    # Command with bot only (e.g., run bot for all accounts)
    $EXECUTOR_CMD "$COMMAND" "$BOT_NAME" 2>&1 | tee -a "$LOG_FILE"
    EXIT_CODE=${PIPESTATUS[0]}
else
    # Command only (e.g., status, list, validate-cookies)
    $EXECUTOR_CMD "$COMMAND" 2>&1 | tee -a "$LOG_FILE"
    EXIT_CODE=${PIPESTATUS[0]}
fi

# Log exit status
{
    echo ""
    echo "=========================================="
    echo "Exit Code: $EXIT_CODE"
    echo "Completed: $(date '+%Y-%m-%d %H:%M:%S')"
} >> "$LOG_FILE"

# Return the exit code
exit $EXIT_CODE