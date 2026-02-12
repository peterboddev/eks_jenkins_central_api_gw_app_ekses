// Auto-generated Express app from OpenAPI specification
// Generated on: 2026-02-09T12:00:10.846Z
// 
// This app uses modular handlers in the ./handlers directory.
// Edit handler files to add your business logic.

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

// Import handlers
const getHealth = require('./handlers/getHealth');
const getInfo = require('./handlers/getInfo');
const getTest = require('./handlers/getTest');
const postEcho = require('./handlers/postEcho');
const getUsers = require('./handlers/getUsers');
const createUser = require('./handlers/createUser');

// Routes
app.get('/health', getHealth); // Health check
app.get('/api/info', getInfo); // Application information
app.get('/api/test', getTest); // Test endpoint
app.post('/api/echo', postEcho); // Echo endpoint
app.get('/api/users', getUsers); // List users
app.post('/api/users', createUser); // Create user

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
