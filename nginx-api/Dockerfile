FROM node:18-alpine

# Install nginx
RUN apk add --no-cache nginx wget

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy application code
COPY app.js ./

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Create nginx directories
RUN mkdir -p /run/nginx

# Expose port 8080 (nginx listens here, proxies to Node.js on 3000)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Copy startup script
COPY start.sh /start.sh
RUN chmod +x /start.sh

# Run both services
CMD ["/start.sh"]
