/**
 * Handler: Health check
 * Operation ID: getHealth
 * Method: GET
 * Path: /health
 */

async function getHealth(req, res, next) {
  try {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  } catch (error) {
    next(error);
  }
}

module.exports = getHealth;
