const express = require('express');
const router = express.Router();
const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  resetUserPassword,
} = require('../controllers/userController');
const { protect, authorize } = require('../middleware/authMiddleware');

// All user-management endpoints require an authenticated admin or team_leader. Note the delete
// handler below is the *non-cascading* variant; for a delete that also removes the user's reports
// see the admin-only DELETE /api/admin/users/:id route in adminRoutes.js.
router.use(protect);

router
  .route('/')
  .get(authorize('admin', 'team_leader'), getUsers)
  .post(authorize('admin', 'team_leader'), createUser);

router
  .route('/:id')
  .get(authorize('admin', 'team_leader'), getUserById)
  .put(authorize('admin', 'team_leader'), updateUser)
  .delete(authorize('admin', 'team_leader'), deleteUser);

router.put('/:id/reset-password', authorize('admin', 'team_leader'), resetUserPassword);

module.exports = router;
