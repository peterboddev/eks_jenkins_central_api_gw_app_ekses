/**
 * Handler: Echo endpoint
 * Operation ID: postEcho
 * Method: POST
 * Path: /api/echo
 */

async function postEcho(req, res, next) {
  try {
    res.json({
      received: req.body,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

module.exports = postEcho;
