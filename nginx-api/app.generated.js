// Auto-generated Express app from OpenAPI specification
// Generated on: 2026-02-09T12:00:10.837Z
// 
// TODO sections indicate where you need to add business logic.
// Everything else is generated automatically from openapi.yaml

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
// Operation ID: getHealth
app.get('/health', async (req, res, next) => {
  try {
    // TODO: Add your business logic here
    
    // Sample response (replace with actual data)
    const response = {
          "status": "healthy",
          "timestamp": "2026-02-09T10:30:00.000Z",
          "uptime": 3600.5
    };
    
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});

// Application information
// Operation ID: getInfo
app.get('/api/info', async (req, res, next) => {
  try {
    // TODO: Add your business logic here
    
    // Sample response (replace with actual data)
    const response = {
          "app": "nginx-api",
          "version": "1.0.0",
          "cluster": "nginx-api-7d8f9c5b6-abc12",
          "environment": "production"
    };
    
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});

// Test endpoint
// Operation ID: getTest
app.get('/api/test', async (req, res, next) => {
  try {
    // TODO: Add your business logic here
    
    // Sample response (replace with actual data)
    const response = {
          "message": "Test endpoint working",
          "method": "GET",
          "uri": "/api/test",
          "timestamp": "2026-02-09T12:00:10.839Z",
          "headers": {}
    };
    
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});

// Echo endpoint
// Operation ID: postEcho
app.post('/api/echo', async (req, res, next) => {
  try {
    const requestBody = req.body;
    
    // TODO: Validate request body
    // TODO: Add your business logic here
    
    res.status(201).json({ success: true });
  } catch (error) {
    next(error);
  }
});

// List users
// Operation ID: getUsers
app.get('/api/users', async (req, res, next) => {
  try {
    // TODO: Add your business logic here
    
    // Sample response (replace with actual data)
    const response = {
          "users": []
    };
    
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});

// Create user
// Operation ID: createUser
app.post('/api/users', async (req, res, next) => {
  try {
    const requestBody = req.body;
    
    // TODO: Validate request body
    // TODO: Add your business logic here
    
    // Sample response (replace with actual data)
    const response = {
          "id": 1,
          "name": "Alice",
          "createdAt": "2026-02-09T12:00:10.839Z"
    };
    
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`API server listening on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

module.exports = app;
