const express = require('express');
const router = express.Router();
const {
  uploadReport,
  analyzeReport,
  getReports,
  getReportById,
  deleteReport,
  getReportStats,
  getProfileAnalytics,
  getReportText,
  downloadReport,
  downloadAnnotatedPdf,
} = require('../controllers/reportController');
const { protect } = require('../middleware/authMiddleware');
const { upload, handleUploadError } = require('../middleware/uploadMiddleware');

router.use(protect);

// Fixed-path routes (`/stats`, `/profile-analytics`) are declared before the parameterised
// `/:id` block below — Express matches in declaration order, so reversing this would cause
// `/stats` and `/profile-analytics` to be swallowed by `/:id` and handed to `getReportById`.
router.get('/stats', getReportStats);
router.get('/profile-analytics', getProfileAnalytics);

router
  .route('/')
  .get(getReports)
  .post(upload.single('pdf'), handleUploadError, uploadReport);

router
  .route('/:id')
  .get(getReportById)
  .delete(deleteReport);

router.post('/:id/analyze', analyzeReport);
router.get('/:id/text', getReportText);
router.get('/:id/download', downloadReport);
router.get('/:id/download-annotated', downloadAnnotatedPdf);

module.exports = router;
