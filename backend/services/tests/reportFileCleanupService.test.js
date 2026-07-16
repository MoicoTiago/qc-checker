jest.mock('fs', () => ({
  existsSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

jest.mock('../../models/Report', () => ({
  find: jest.fn(),
}));

const fs = require('fs');
const path = require('path');
const Report = require('../../models/Report');
const {
  cleanupExpiredReportFiles,
  getCutoffDate,
  getRetentionDays,
  isPathInsideUploadsDirectory,
  resolveReportPath,
  startReportFileCleanupJob,
} = require('../reportFileCleanupService');

const createReport = (overrides = {}) => ({
  _id: 'report-1',
  filePath: 'uploads/report.pdf',
  sourceFileDeletedAt: null,
  sourceFileDeletionReason: '',
  save: jest.fn().mockResolvedValue(),
  ...overrides,
});

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

describe('reportFileCleanupService', () => {
  const originalRetentionDays = process.env.REPORT_FILE_RETENTION_DAYS;
  const originalDisableCleanup = process.env.DISABLE_REPORT_FILE_CLEANUP;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.REPORT_FILE_RETENTION_DAYS;
    delete process.env.DISABLE_REPORT_FILE_CLEANUP;
  });

  afterEach(() => {
    if (originalRetentionDays === undefined) {
      delete process.env.REPORT_FILE_RETENTION_DAYS;
    } else {
      process.env.REPORT_FILE_RETENTION_DAYS = originalRetentionDays;
    }

    if (originalDisableCleanup === undefined) {
      delete process.env.DISABLE_REPORT_FILE_CLEANUP;
    } else {
      process.env.DISABLE_REPORT_FILE_CLEANUP = originalDisableCleanup;
    }

    jest.restoreAllMocks();
  });

  test('reads a positive retention window from the environment and falls back for invalid values', () => {
    process.env.REPORT_FILE_RETENTION_DAYS = '45';
    expect(getRetentionDays()).toBe(45);

    process.env.REPORT_FILE_RETENTION_DAYS = '0';
    expect(getRetentionDays()).toBe(30);

    process.env.REPORT_FILE_RETENTION_DAYS = 'not-a-number';
    expect(getRetentionDays()).toBe(30);
  });

  test('builds the retention cutoff from the supplied date and retention window', () => {
    const now = new Date('2026-04-22T12:00:00.000Z');

    expect(getCutoffDate(30, now)).toEqual(new Date('2026-03-23T12:00:00.000Z'));

    process.env.REPORT_FILE_RETENTION_DAYS = '10';
    const defaultedCutoff = getCutoffDate(undefined, now);
    expect(defaultedCutoff).toEqual(new Date('2026-04-12T12:00:00.000Z'));
    expect(getCutoffDate()).toBeInstanceOf(Date);
  });

  test('resolves relative uploaded file paths from the backend directory', () => {
    const resolvedPath = resolveReportPath('uploads/report.pdf');
    const absolutePath = path.resolve(__dirname, '../../uploads/absolute.pdf');

    expect(resolvedPath.replace(/\\/g, '/')).toMatch(/backend\/uploads\/report\.pdf$/);
    expect(resolveReportPath('')).toBe('');
    expect(resolveReportPath(absolutePath)).toBe(absolutePath);
    expect(isPathInsideUploadsDirectory(resolvedPath)).toBe(true);
    expect(isPathInsideUploadsDirectory('')).toBe(false);
    expect(isPathInsideUploadsDirectory(resolveReportPath('uploads'))).toBe(false);
    expect(isPathInsideUploadsDirectory(resolveReportPath('training/template.pdf'))).toBe(false);
  });

  test('deletes expired local source files and marks report metadata without deleting report records', async () => {
    const now = new Date('2026-04-22T12:00:00.000Z');
    const report = createReport();
    Report.find.mockResolvedValue([report]);
    fs.existsSync.mockReturnValue(true);

    const result = await cleanupExpiredReportFiles({ now, retentionDays: 30 });

    expect(Report.find).toHaveBeenCalledWith({
      createdAt: { $lte: new Date('2026-03-23T12:00:00.000Z') },
      filePath: { $exists: true, $ne: '' },
      sourceFileDeletedAt: null,
    });
    expect(fs.unlinkSync).toHaveBeenCalledTimes(1);
    expect(report.sourceFileDeletedAt).toEqual(now);
    expect(report.sourceFileDeletionReason).toBe('retention_30_days');
    expect(report.save).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ scanned: 1, deleted: 1, missing: 0, failed: 0 });
  });

  test('marks already-missing files so cleanup does not retry them forever', async () => {
    const now = new Date('2026-04-22T12:00:00.000Z');
    const report = createReport({ filePath: 'uploads/missing.pdf' });
    Report.find.mockResolvedValue([report]);
    fs.existsSync.mockReturnValue(false);

    const result = await cleanupExpiredReportFiles({ now, retentionDays: 30 });

    expect(fs.unlinkSync).not.toHaveBeenCalled();
    expect(report.sourceFileDeletedAt).toEqual(now);
    expect(report.sourceFileDeletionReason).toBe('source_file_missing_during_cleanup');
    expect(report.save).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ scanned: 1, deleted: 0, missing: 1, failed: 0 });
  });

  test('continues when deleting one file fails', async () => {
    const now = new Date('2026-04-22T12:00:00.000Z');
    const failedReport = createReport({ _id: 'failed-report', filePath: 'uploads/failed.pdf' });
    const deletedReport = createReport({ _id: 'deleted-report', filePath: 'uploads/deleted.pdf' });
    Report.find.mockResolvedValue([failedReport, deletedReport]);
    fs.existsSync.mockReturnValue(true);
    fs.unlinkSync
      .mockImplementationOnce(() => {
        throw new Error('disk busy');
      })
      .mockImplementationOnce(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await cleanupExpiredReportFiles({ now, retentionDays: 30 });

    expect(failedReport.save).not.toHaveBeenCalled();
    expect(deletedReport.save).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ scanned: 2, deleted: 1, missing: 0, failed: 1 });

    console.error.mockRestore();
  });

  test('skips paths outside the uploads directory', async () => {
    const now = new Date('2026-04-22T12:00:00.000Z');
    const report = createReport({ filePath: 'training/template.pdf' });
    Report.find.mockResolvedValue([report]);
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await cleanupExpiredReportFiles({ now, retentionDays: 30 });

    expect(fs.existsSync).not.toHaveBeenCalled();
    expect(fs.unlinkSync).not.toHaveBeenCalled();
    expect(report.save).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 1, deleted: 0, missing: 0, failed: 1 });

    console.error.mockRestore();
  });

  test('uses default cleanup arguments and returns zero counts when no reports are expired', async () => {
    process.env.REPORT_FILE_RETENTION_DAYS = '7';
    Report.find.mockResolvedValue([]);

    const result = await cleanupExpiredReportFiles();

    expect(Report.find).toHaveBeenCalledWith({
      createdAt: { $lte: expect.any(Date) },
      filePath: { $exists: true, $ne: '' },
      sourceFileDeletedAt: null,
    });
    expect(result).toEqual({ scanned: 0, deleted: 0, missing: 0, failed: 0 });
  });

  test('does not start the scheduled cleanup job when disabled', () => {
    process.env.DISABLE_REPORT_FILE_CLEANUP = 'true';
    jest.spyOn(console, 'log').mockImplementation(() => {});

    const timer = startReportFileCleanupJob();

    expect(timer).toBeNull();
    expect(console.log).toHaveBeenCalledWith('Report file cleanup job disabled');
  });

  test('starts the scheduled cleanup job, runs immediately, logs non-empty results, and unreferences the timer', async () => {
    const timer = { unref: jest.fn() };
    const report = createReport();
    jest.spyOn(global, 'setInterval').mockImplementation(() => timer);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    Report.find.mockResolvedValue([report]);
    fs.existsSync.mockReturnValue(true);

    const returnedTimer = startReportFileCleanupJob({ intervalMs: 1000 });
    await flushPromises();

    expect(returnedTimer).toBe(timer);
    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 1000);
    expect(timer.unref).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(
      'Report file cleanup complete: scanned=1, deleted=1, missing=0, failed=0'
    );
  });

  test('can skip the immediate scheduled run and handles timers without unref', () => {
    const timer = {};
    jest.spyOn(global, 'setInterval').mockImplementation(() => timer);

    const returnedTimer = startReportFileCleanupJob({ intervalMs: 1000, runOnStart: false });

    expect(returnedTimer).toBe(timer);
    expect(Report.find).not.toHaveBeenCalled();
  });

  test('scheduled cleanup does not log a completion summary when no reports are scanned', async () => {
    const timer = { unref: jest.fn() };
    jest.spyOn(global, 'setInterval').mockImplementation(() => timer);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    Report.find.mockResolvedValue([]);

    startReportFileCleanupJob();
    await flushPromises();

    expect(console.log).not.toHaveBeenCalled();
  });

  test('scheduled cleanup logs failures from the cleanup promise', async () => {
    const timer = { unref: jest.fn() };
    jest.spyOn(global, 'setInterval').mockImplementation(() => timer);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    Report.find.mockRejectedValue(new Error('database offline'));

    startReportFileCleanupJob();
    await flushPromises();

    expect(console.error).toHaveBeenCalledWith('Report file cleanup failed:', 'database offline');
  });
});
