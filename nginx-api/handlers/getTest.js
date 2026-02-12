/**
 * Handler: Test endpoint
 * Operation ID: getTest
 * Method: GET
 * Path: /api/test
 */

async function getTest(req, res, next) {
  try {
    res.json({
      message: 'Test endpoint working',
      method: req.method,
      uri: req.originalUrl,
      timestamp: new Date().toISOString(),
      headers: req.headers
    });
  } catch (error) {
    next(error);
  }
}

module.exports = getTest;
