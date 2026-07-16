/**
 * @file Upload middleware — configures multer for two distinct upload contexts.
 *
 * - `upload`          – user report uploads, stored in `uploads/`
 * - `trainingUpload`  – admin training-data uploads, stored in `training/`
 *
 * Both accept only PDF files with a 120 MB size limit.
 *
 * `handleUploadError` is an Express error-handler that normalises multer-specific
 * errors (e.g. LIMIT_FILE_SIZE) and generic throw-from-fileFilter errors into
 * consistent JSON responses so callers don't need to inspect error types.
 */
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const MAX_PDF_SIZE_MB = 120;
const MAX_PDF_SIZE_BYTES = MAX_PDF_SIZE_MB * 1024 * 1024;

const trainingDir = path.join(__dirname, '..', 'training');
if (!fs.existsSync(trainingDir)) {
  fs.mkdirSync(trainingDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    // Timestamp + random suffix prevents filename collisions when multiple users upload simultaneously
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

// Separate storage engine keeps admin training PDFs isolated from user uploads,
// so training-data management (bulk delete, re-index) can't accidentally affect reports.
const trainingStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'training/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `training-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_PDF_SIZE_BYTES,
  },
});

const trainingUpload = multer({
  storage: trainingStorage,
  fileFilter,
  limits: {
    fileSize: MAX_PDF_SIZE_BYTES,
  },
});

const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: `File too large. Maximum size is ${MAX_PDF_SIZE_MB}MB.`  });
    }
    return res.status(400).json({ message: err.message });
  }
  
  if (err) {
    return res.status(400).json({ message: err.message });
  }
  
  next();
};

module.exports = { upload, trainingUpload, handleUploadError };
