const express = require('express');
const router = express.Router();
const {
    createPasswordResetRequest,
    getPasswordResetRequests,
    completePasswordResetRequest,
    rejectPasswordResetRequest,
} = require ('../controllers/passwordResetRequestController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

// POST is intentionally open to any authenticated user so end-users can submit their own reset
// request from the login/profile flow. Every other verb here is staff-only (admin/team_leader)
// because they drive the Manage-tab queue.
router
    .route('/')
    .post(createPasswordResetRequest)
    .get(authorize('admin', 'team_leader'), getPasswordResetRequests);

router.put('/:id/complete', authorize('admin', 'team_leader'), completePasswordResetRequest);
router.put('/:id/reject', authorize('admin', 'team_leader'), rejectPasswordResetRequest);

module.exports = router;
