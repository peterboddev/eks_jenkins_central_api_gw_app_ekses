/**
 * Handler: List users
 * Operation ID: getUsers
 * Method: GET
 * Path: /api/users
 */

async function getUsers(req, res, next) {
  try {
    // TODO: Connect to database, fetch users
    res.json({
      users: [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' }
      ]
    });
  } catch (error) {
    next(error);
  }
}

module.exports = getUsers;
