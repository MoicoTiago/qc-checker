const express = require('express');
const router = express.Router();
const {
  login,
  getMe,
  changePassword,
  updateProfile,
  updatePreferences,
  getPreferences,
  exportUserData,
  deleteAccount,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { loginLimiter, authLimiter } = require('../middleware/rateLimitMiddleware');

router.post('/login', loginLimiter, login);

router.get('/me', authLimiter, protect, getMe);

router.put('/change-password', authLimiter, protect, changePassword);

router.put('/profile', authLimiter, protect, updateProfile);

router.get('/preferences', authLimiter, protect, getPreferences);

router.put('/preferences', authLimiter, protect, updatePreferences);

router.get('/export', authLimiter, protect, exportUserData);

router.delete('/account', authLimiter, protect, deleteAccount);

module.exports = router;
