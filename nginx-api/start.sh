#!/bin/sh
# Startup script for nginx-api container
# Runs both Node.js app and nginx reverse proxy

echo "Starting nginx-api container..."

# Start Node.js app in background
echo "Starting Node.js application on port 3000..."
node /app/app.js &
NODE_PID=$!

# Wait for Node.js to be ready
echo "Waiting for Node.js to start..."
sleep 2

# Check if Node.js is still running
if ! kill -0 $NODE_PID 2>/dev/null; then
    echo "ERROR: Node.js failed to start"
    exit 1
fi

echo "Node.js started successfully (PID: $NODE_PID)"

# Start nginx in foreground
echo "Starting nginx on port 8080..."
exec nginx -g 'daemon off;'
