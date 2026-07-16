const fs = require('fs');
const path = require('path');
const Report = require('../models/Report');

const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const UPLOADS_DIR = path.resolve(__dirname, '..', 'uploads');

/** Reads the report source-file retention window from env, falling back to 30 days. */
const getRetentionDays = () => {
  const configuredDays = Number(process.env.REPORT_FILE_RETENTION_DAYS);
  return Number.isFinite(configuredDays) && configuredDays > 0
    ? configuredDays
    : DEFAULT_RETENTION_DAYS;
};

/** Calculates the oldest upload date that should still keep its local source PDF. */
const getCutoffDate = (retentionDays = getRetentionDays(), now = new Date()) => {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
};

/** Normalises report file paths so DB values like `uploads/foo.pdf` map to backend/uploads. */
const resolveReportPath = (filePath) => {
  if (!filePath) {
    return '';
  }

  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(__dirname, '..', filePath);
};

/** Keeps cleanup scoped to report uploads only; DB path corruption must not delete arbitrary files. */
const isPathInsideUploadsDirectory = (filePath) => {
  if (!filePath) {
    return false;
  }

  const relativePath = path.relative(UPLOADS_DIR, filePath);
  return Boolean(relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath));
};

/** Records that the local source PDF is gone while preserving report analytics/history. */
const markSourceFileDeleted = async (report, deletedAt, reason) => {
  report.sourceFileDeletedAt = deletedAt;
  report.sourceFileDeletionReason = reason;
  await report.save();
};

/** Deletes expired local report PDFs but intentionally leaves Report documents and analytics intact. */
const cleanupExpiredReportFiles = async ({ now = new Date(), retentionDays = getRetentionDays() } = {}) => {
  const cutoffDate = getCutoffDate(retentionDays, now);
  const deletedAt = new Date(now);
  const expiredReports = await Report.find({
    createdAt: { $lte: cutoffDate },
    filePath: { $exists: true, $ne: '' },
    sourceFileDeletedAt: null,
  });

  const result = {
    scanned: expiredReports.length,
    deleted: 0,
    missing: 0,
    failed: 0,
  };

  for (const report of expiredReports) {
    const absolutePath = resolveReportPath(report.filePath);

    try {
      if (!isPathInsideUploadsDirectory(absolutePath)) {
        result.failed += 1;
        console.error(`Skipping report source file outside uploads directory for report ${report._id}`);
        continue;
      }

      if (absolutePath && fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
        result.deleted += 1;
        await markSourceFileDeleted(report, deletedAt, `retention_${retentionDays}_days`);
      } else {
        result.missing += 1;
        await markSourceFileDeleted(report, deletedAt, 'source_file_missing_during_cleanup');
      }
    } catch (error) {
      result.failed += 1;
      console.error(`Failed to clean report source file for report ${report._id}:`, error.message);
    }
  }

  return result;
};

/** Starts the daily source-file cleanup loop after DB startup; failures are logged, not thrown. */
const startReportFileCleanupJob = ({
  intervalMs = DEFAULT_CLEANUP_INTERVAL_MS,
  runOnStart = true,
} = {}) => {
  if (process.env.DISABLE_REPORT_FILE_CLEANUP === 'true') {
    console.log('Report file cleanup job disabled');
    return null;
  }

  const runCleanup = () => {
    cleanupExpiredReportFiles()
      .then((result) => {
        if (result.scanned > 0) {
          console.log(
            `Report file cleanup complete: scanned=${result.scanned}, deleted=${result.deleted}, missing=${result.missing}, failed=${result.failed}`
          );
        }
      })
      .catch((error) => {
        console.error('Report file cleanup failed:', error.message);
      });
  };

  if (runOnStart) {
    runCleanup();
  }

  const timer = setInterval(runCleanup, intervalMs);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  return timer;
};

module.exports = {
  DEFAULT_RETENTION_DAYS,
  DEFAULT_CLEANUP_INTERVAL_MS,
  cleanupExpiredReportFiles,
  getCutoffDate,
  getRetentionDays,
  isPathInsideUploadsDirectory,
  resolveReportPath,
  startReportFileCleanupJob,
};
