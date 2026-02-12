/**
 * Handler: Create user
 * Operation ID: createUser
 * Method: POST
 * Path: /api/users
 */

async function createUser(req, res, next) {
  try {
    // TODO: Validate input, save to database
    const newUser = {
      id: Date.now(),
      ...req.body,
      createdAt: new Date().toISOString()
    };
    res.status(201).json(newUser);
  } catch (error) {
    next(error);
  }
}

module.exports = createUser;
