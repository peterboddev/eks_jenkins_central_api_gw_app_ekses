/**
 * Handler: Application information
 * Operation ID: getInfo
 * Method: GET
 * Path: /api/info
 */

async function getInfo(req, res, next) {
  try {
    res.json({
      app: 'nginx-api',
      version: '1.0.0',
      cluster: process.env.HOSTNAME || 'unknown',
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    next(error);
  }
}

module.exports = getInfo;
