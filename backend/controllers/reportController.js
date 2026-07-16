/**
 * @file Report controller — handlers for the /api/reports routes.
 *
 * Endpoints handled:
 *  - POST   /              → uploadReport        (upload PDF, kick off async analysis)
 *  - POST   /:id/analyze   → analyzeReport       (re-run analysis on an existing report)
 *  - GET    /              → getReports           (role-scoped list)
 *  - GET    /:id           → getReportById
 *  - DELETE /:id           → deleteReport
 *  - GET    /stats         → getReportStats       (aggregate error/time-saved metrics)
 *  - GET    /analytics     → getProfileAnalytics  (per-user profile analytics with trend buckets)
 *  - GET    /:id/text      → getReportText
 *  - GET    /:id/download  → downloadReport       (generated QC summary PDF)
 *  - GET    /:id/download-annotated → downloadAnnotatedPdf (original PDF with error annotations)
 */
const Report = require('../models/Report');
const User = require('../models/User');
const Team = require('../models/Team');
const { processDocument } = require('../services/pdfService');
const { analyzeDocument } = require('../services/errorDetection');
const { predictQualityFromTraining } = require('../services/trainingService');
const { generateReportPdf } = require('../services/reportPdfService');
const { generateAnnotatedPdf } = require('../services/annotatedPdfService');
const { getReportTimeMetrics } = require('../services/timeEstimationService');
const audit = require('../services/auditService');
const fs = require('fs');
const path = require('path');

// Builds the bucketing strategy for the Profile page's analytics (pass-rate trend, per-period
// aggregates). Extracted from the handler so each scope's date math and label format is testable
// in isolation and can be reused by the admin's per-user analytics route. All date math uses
// UTC (`setUTCHours`/`setUTCDate`) so aggregation doesn't drift for users in different zones —
// the display layer formats with `timeZone: 'UTC'` to match.
const getProfileAnalyticsScopeConfig = (scope) => {
  const now = new Date();
  // Silent fallback to 'all' for unknown scopes mirrors the permissive contract the frontend
  // `<select>` depends on; any value outside the whitelist is treated as the broadest view.
  const safeScope = ['week', 'month', 'all'].includes(scope) ? scope : 'all';

  if (safeScope === 'week') {
    const startDate = new Date(now);
    startDate.setUTCDate(now.getUTCDate() - 6);
    startDate.setUTCHours(0, 0, 0, 0);

    return {
      scope: safeScope,
      startDate,
      bucketCount: 7,
      getBucketDate: (offset) => {
        const bucketDate = new Date(startDate);
        bucketDate.setUTCDate(startDate.getUTCDate() + offset);
        return bucketDate;
      },
      getBucketKey: (date) => date.toISOString().slice(0, 10),
      formatBucketLabel: (date) =>
        new Intl.DateTimeFormat('en-GB', {
          day: 'numeric',
          month: 'short',
          timeZone: 'UTC',
        }).format(date),
    };
  }

  if (safeScope === 'month') {
    const startDate = new Date(now);
    startDate.setUTCDate(now.getUTCDate() - 29);
    startDate.setUTCHours(0, 0, 0, 0);

    return {
      scope: safeScope,
      startDate,
      bucketCount: 30,
      getBucketDate: (offset) => {
        const bucketDate = new Date(startDate);
        bucketDate.setUTCDate(startDate.getUTCDate() + offset);
        return bucketDate;
      },
      getBucketKey: (date) => date.toISOString().slice(0, 10),
      formatBucketLabel: (date) =>
        new Intl.DateTimeFormat('en-GB', {
          day: 'numeric',
          month: 'short',
          timeZone: 'UTC',
        }).format(date),
    };
  }

  return {
    scope: safeScope,
    startDate: null,
    bucketCount: 0,
    getBucketKey: (date) =>
      `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
    formatBucketLabel: (date) =>
      new Intl.DateTimeFormat('en-GB', {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(date),
  };
};

/**
 * Creates a Report document with status "processing" and responds to the client
 * immediately (201), then fires off `processReportAsync` without awaiting it
 * (fire-and-forget). This keeps the upload request fast while heavy analysis
 * runs in the background; the client polls or receives updates for completion.
 */
const uploadReport = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload a PDF file' });
    }

    const report = await Report.create({
      filename: req.file.originalname,
      filePath: req.file.path,
      fileSize: req.file.size,
      analyzedBy: req.user._id,
      status: 'processing',
    });

    res.status(201).json({
      _id: report._id,
      filename: report.filename,
      fileSize: report.fileSize,
      status: report.status,
      message: 'File uploaded successfully. Processing started.',
    });

    processReportAsync(report._id, req.file.path);

  } catch (error) {
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    }
    console.error('Upload error:', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * Async analysis pipeline (called fire-and-forget from uploadReport / analyzeReport):
 *   1. Text extraction via pdfService.processDocument
 *   2. Error detection via errorDetection.analyzeDocument
 *   3. Quality prediction via trainingService.predictQualityFromTraining
 *   4. DB update — persists results and sets status to "analyzed" (or "failed" on error)
 */
const processReportAsync = async (reportId, filePath) => {
  try {
    console.log(`Processing report ${reportId}...`);
    
    const documentData = await processDocument(filePath);
    console.log(`Text extracted: ${documentData.wordCount} words`);

    const analysisResults = await analyzeDocument(
      documentData.text,
      documentData.sections,
      {
        headerFields: documentData.headerFields,
        pageCount: documentData.numPages,
        wordCount: documentData.wordCount,
      }
    );
    console.log(`Analysis complete: ${analysisResults.errorCount} errors found`);

    const qualityAssessment = await predictQualityFromTraining(
      documentData.text,
      analysisResults
    );
    console.log(
      `Quality prediction: ${qualityAssessment.label} (confidence ${qualityAssessment.confidence})`
    );

    await Report.findByIdAndUpdate(reportId, {
      status: 'analyzed',
      extractedText: documentData.text,
      errors: analysisResults.errors,
      errorCount: analysisResults.errorCount,
      errorSummary: analysisResults.errorSummary,
      timeSaved: analysisResults.timeSaved,
      estimatedManualReviewMinutes: analysisResults.estimatedManualReviewMinutes,
      estimatedAiReviewMinutes: analysisResults.estimatedAiReviewMinutes,
      estimatedTimeSavedMinutes: analysisResults.estimatedTimeSavedMinutes,
      timeSavedPercent: analysisResults.timeSavedPercent,
      qualityAssessment: {
        label: qualityAssessment.label,
        confidence: qualityAssessment.confidence,
        goodScore: qualityAssessment.goodScore,
        badScore: qualityAssessment.badScore,
        matchedExamples: qualityAssessment.matchedExamples,
        method: qualityAssessment.method || 'checklist-rule-good-profile',
        evaluatedAt: new Date(),
      },
      metadata: {
        pageCount: documentData.numPages,
        wordCount: documentData.wordCount,
        sections: documentData.sections.map(s => s.title),
        headerFields: documentData.headerFields,
      },
    });

    console.log(`Report ${reportId} processed successfully`);
  } catch (error) {
    console.error(`Error processing report ${reportId}:`, error);
    await Report.findByIdAndUpdate(reportId, {
      status: 'failed',
    });
  }
};

const analyzeReport = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);

    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    if (
      req.user.role === 'user' &&
      report.analyzedBy.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (!report.filePath || !fs.existsSync(report.filePath)) {
      return res.status(400).json({ message: 'PDF file not found' });
    }

    report.status = 'processing';
    await report.save();

    res.json({ message: 'Analysis started', reportId: report._id });

    processReportAsync(report._id, report.filePath);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Role-scoped report list used as the admin Reports-tab fallback (when /api/admin/reports errors)
// and as the primary source for team leaders and regular users. Scoping mirrors userController.getUsers:
// regular users see only their own; team leaders see themselves plus users they manage; admins
// (no branch) receive all reports. `extractedText` is stripped because it can be megabytes per
// document and no list-view UI consumes it — fetched on demand via /api/reports/:id/text instead.
const getReports = async (req, res) => {
  try {
    let query = {};

    if (req.user.role === 'user') {
      query.analyzedBy = req.user._id;
    } else if (req.user.role === 'team_leader') {
      const User = require('../models/User');
      const teamMembers = await User.find({ managedBy: req.user._id }).select('_id');
      const teamMemberIds = teamMembers.map((u) => u._id);
      teamMemberIds.push(req.user._id);
      query.analyzedBy = { $in: teamMemberIds };
    }

    const reports = await Report.find(query)
      .select('-extractedText')
      .populate('analyzedBy', 'name email')
      .sort({ createdAt: -1 });

    res.json(reports);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getReportById = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id)
      .populate('analyzedBy', 'name email');

    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    if (
      req.user.role === 'user' &&
      report.analyzedBy._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: 'Not authorized to view this report' });
    }

    res.json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteReport = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);

    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    if (
      req.user.role === 'user' &&
      report.analyzedBy.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: 'Not authorized to delete this report' });
    }

    if (report.filePath && fs.existsSync(report.filePath)) {
      fs.unlink(report.filePath, (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    }

    await Report.findByIdAndDelete(req.params.id);

    await audit.log('report_deleted', {
      req,
      userId: req.user._id,
      email: req.user.email,
      details: {
        reportId: report._id,
        filename: report.filename,
        deletedBy: req.user.role,
      },
    });

    res.json({ message: 'Report deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getReportStats = async (req, res) => {
  try {
    let matchQuery = {};

    if (req.user.role === 'user') {
      matchQuery.analyzedBy = req.user._id;
    } else if (req.user.role === 'team_leader') {
      const User = require('../models/User');
      const teamMembers = await User.find({ managedBy: req.user._id }).select('_id');
      const teamMemberIds = teamMembers.map((u) => u._id);
      teamMemberIds.push(req.user._id);
      matchQuery.analyzedBy = { $in: teamMemberIds };
    }

    const stats = await Report.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalReports: { $sum: 1 },
          totalErrors: { $sum: '$errorCount' },
          totalTimeSaved: { $sum: '$timeSaved' },
          totalManualReviewMinutes: { $sum: '$estimatedManualReviewMinutes' },
          totalAiReviewMinutes: { $sum: '$estimatedAiReviewMinutes' },
          totalTimeSavedMinutes: {
            $sum: {
              $cond: [
                { $gt: ['$estimatedTimeSavedMinutes', 0] },
                '$estimatedTimeSavedMinutes',
                '$timeSaved',
              ],
            },
          },
          placeholderErrors: { $sum: '$errorSummary.placeholder' },
          consistencyErrors: { $sum: '$errorSummary.consistency' },
          complianceErrors: { $sum: '$errorSummary.compliance' },
          formattingErrors: { $sum: '$errorSummary.formatting' },
          missingDataErrors: { $sum: '$errorSummary.missing_data' },
        },
      },
    ]);

    const result = stats[0] || {
      totalReports: 0,
      totalErrors: 0,
      totalTimeSaved: 0,
      totalManualReviewMinutes: 0,
      totalAiReviewMinutes: 0,
      totalTimeSavedMinutes: 0,
      placeholderErrors: 0,
      consistencyErrors: 0,
      complianceErrors: 0,
      formattingErrors: 0,
      missingDataErrors: 0,
    };
    result.totalTimeSaved = result.totalTimeSavedMinutes || result.totalTimeSaved || 0;
    result.timeSavedPercent =
      result.totalManualReviewMinutes > 0
        ? Math.round((result.totalTimeSaved / result.totalManualReviewMinutes) * 100)
        : 0;

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Self-service analytics for the Profile page. Scoped strictly to `req.user._id` — admins who
// need to inspect another user's analytics go through GET /api/admin/users/:id/profile-analytics
// in adminRoutes.js, which duplicates the aggregation with explicit authorisation.
const getProfileAnalytics = async (req, res) => {
  try {
    const userId = req.user._id;
    const scopeConfig = getProfileAnalyticsScopeConfig(req.query.scope);
    const reportQuery = { analyzedBy: userId };

    if (scopeConfig.startDate) {
      reportQuery.createdAt = { $gte: scopeConfig.startDate };
    }

    const reports = await Report.find(reportQuery)
      .select(
        'filename status errorCount errorSummary timeSaved estimatedManualReviewMinutes estimatedAiReviewMinutes estimatedTimeSavedMinutes timeSavedPercent qualityAssessment createdAt errors metadata'
      )
      .sort({ createdAt: -1 })
      .lean();

    const summary = {
      totalReports: reports.length,
      analyzedReports: 0,
      pendingReports: 0,
      failedReports: 0,
      totalErrors: 0,
      averageErrorsPerReport: 0,
      totalTimeSaved: 0,
      totalManualReviewMinutes: 0,
      totalAiReviewMinutes: 0,
      totalTimeSavedMinutes: 0,
      timeSavedPercent: 0,
    };

    const errorBreakdown = {
      placeholder: 0,
      consistency: 0,
      compliance: 0,
      formatting: 0,
      missing_data: 0,
    };

    const qualityBreakdown = {
      good: 0,
      bad: 0,
      uncertain: 0,
    };
    const errorTypesByReport = {
      placeholder: 0,
      consistency: 0,
      compliance: 0,
      formatting: 0,
      missing_data: 0,
    };
    const checklistFailureCounts = new Map();

    const trendBuckets = new Map();
    const bucketDates = [];

    // Pre-populate a contiguous bucket range so the Pass-Rate chart's X-axis stays continuous
    // even during quiet periods — gaps would otherwise collapse the line chart and misrepresent
    // inactivity as missing data. For 'all' scope we derive bounds from the oldest report so the
    // axis never shows empty months preceding the user's first upload.
    if (scopeConfig.scope === 'all') {
      const now = new Date();
      const oldestReportDate = reports.length
        ? new Date(reports[reports.length - 1].createdAt)
        : now;
      const firstBucketDate = new Date(
        Date.UTC(oldestReportDate.getUTCFullYear(), oldestReportDate.getUTCMonth(), 1)
      );
      const lastBucketDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

      for (
        let bucketDate = new Date(firstBucketDate);
        bucketDate <= lastBucketDate;
        bucketDate = new Date(Date.UTC(bucketDate.getUTCFullYear(), bucketDate.getUTCMonth() + 1, 1))
      ) {
        bucketDates.push(bucketDate);
      }
    } else {
      for (let offset = 0; offset < scopeConfig.bucketCount; offset += 1) {
        bucketDates.push(scopeConfig.getBucketDate(offset));
      }
    }

    bucketDates.forEach((bucketDate) => {
      const key = scopeConfig.getBucketKey(bucketDate);

      trendBuckets.set(key, {
        periodLabel: scopeConfig.formatBucketLabel(bucketDate),
        reportCount: 0,
        errorCount: 0,
        analyzedCount: 0,
        passedCount: 0,
        failedCount: 0,
      });
    });

    reports.forEach((report) => {
      const timeMetrics = getReportTimeMetrics(report);
      summary.totalErrors += report.errorCount || 0;
      summary.totalTimeSaved += timeMetrics.savedMinutes;
      summary.totalManualReviewMinutes += timeMetrics.manualMinutes;
      summary.totalAiReviewMinutes += timeMetrics.aiMinutes;
      summary.totalTimeSavedMinutes += timeMetrics.savedMinutes;

      if (report.status === 'analyzed') {
        summary.analyzedReports += 1;
      } else if (report.status === 'failed') {
        summary.failedReports += 1;
      } else if (['pending', 'processing'].includes(report.status)) {
        summary.pendingReports += 1;
      }

      errorBreakdown.placeholder += report.errorSummary?.placeholder || 0;
      errorBreakdown.consistency += report.errorSummary?.consistency || 0;
      errorBreakdown.compliance += report.errorSummary?.compliance || 0;
      errorBreakdown.formatting += report.errorSummary?.formatting || 0;
      errorBreakdown.missing_data += report.errorSummary?.missing_data || 0;

      if ((report.errorSummary?.placeholder || 0) > 0) errorTypesByReport.placeholder += 1;
      if ((report.errorSummary?.consistency || 0) > 0) errorTypesByReport.consistency += 1;
      if ((report.errorSummary?.compliance || 0) > 0) errorTypesByReport.compliance += 1;
      if ((report.errorSummary?.formatting || 0) > 0) errorTypesByReport.formatting += 1;
      if ((report.errorSummary?.missing_data || 0) > 0) errorTypesByReport.missing_data += 1;

      // Defensive `!== undefined` guard: a malformed or legacy label (e.g. from a schema change)
      // would otherwise silently create a new key on qualityBreakdown and the frontend would read
      // `undefined` for the known buckets, collapsing the chart.
      const qualityLabel = report.qualityAssessment?.label;
      if (qualityLabel && qualityBreakdown[qualityLabel] !== undefined) {
        qualityBreakdown[qualityLabel] += 1;
      }

      (report.errors || []).forEach((error) => {
        if (!error?.message) {
          return;
        }

        const currentCount = checklistFailureCounts.get(error.message) || 0;
        checklistFailureCounts.set(error.message, currentCount + 1);
      });

      const createdAt = report.createdAt ? new Date(report.createdAt) : null;
      if (createdAt) {
        const key = scopeConfig.getBucketKey(createdAt);
        const existingBucket = trendBuckets.get(key);

        if (existingBucket) {
          existingBucket.reportCount += 1;
          existingBucket.errorCount += report.errorCount || 0;
          if (report.status === 'analyzed') {
            existingBucket.analyzedCount += 1;
            if (report.qualityAssessment?.label === 'good') {
              existingBucket.passedCount += 1;
            } else if (report.qualityAssessment?.label === 'bad') {
              existingBucket.failedCount += 1;
            }
          }
        }
      }
    });

    if (summary.analyzedReports > 0) {
      summary.averageErrorsPerReport = Number(
        (summary.totalErrors / summary.analyzedReports).toFixed(2)
      );
    }
    summary.totalTimeSaved = Math.round(summary.totalTimeSaved);
    summary.totalManualReviewMinutes = Math.round(summary.totalManualReviewMinutes);
    summary.totalAiReviewMinutes = Math.round(summary.totalAiReviewMinutes);
    summary.totalTimeSavedMinutes = Math.round(summary.totalTimeSavedMinutes);
    summary.timeSavedPercent =
      summary.totalManualReviewMinutes > 0
        ? Math.round((summary.totalTimeSaved / summary.totalManualReviewMinutes) * 100)
        : 0;

    const mostCommonErrorTypes = Object.entries(errorBreakdown)
      .map(([type, count]) => ({
        type,
        count,
        reportsAffected: errorTypesByReport[type] || 0,
      }))
      .sort((a, b) => {
        if (b.count !== a.count) {
          return b.count - a.count;
        }

        return b.reportsAffected - a.reportsAffected;
      });

    const checklistFailureBreakdown = Array.from(checklistFailureCounts.entries())
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const passFailRateTrends = Array.from(trendBuckets.values()).map((bucket) => ({
      periodLabel: bucket.periodLabel,
      analyzedCount: bucket.analyzedCount,
      passedCount: bucket.passedCount,
      failedCount: bucket.failedCount,
      passRate:
        bucket.analyzedCount > 0
          ? Number(((bucket.passedCount / bucket.analyzedCount) * 100).toFixed(1))
          : 0,
    }));

    // Chart keeps the last 10 analysed reports in chronological (left→right oldest→newest) order:
    // sort ascending by date first so `.slice(-10)` returns the most recent window, already in
    // the order Recharts expects to render.
    const qualityScoreTrend = reports
      .filter((report) => report.status === 'analyzed')
      .map((report) => ({
        _id: report._id,
        filename: report.filename,
        createdAt: report.createdAt,
        qualityLabel: report.qualityAssessment?.label || null,
        qualityScore: Number(((report.qualityAssessment?.goodScore || 0) * 100).toFixed(1)),
      }))
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .slice(-10);

    const recentReports = reports.slice(0, 5).map((report) => ({
      _id: report._id,
      filename: report.filename,
      createdAt: report.createdAt,
      status: report.status,
      errorCount: report.errorCount || 0,
      timeSaved: getReportTimeMetrics(report).savedMinutes,
      estimatedManualReviewMinutes: getReportTimeMetrics(report).manualMinutes,
      estimatedAiReviewMinutes: getReportTimeMetrics(report).aiMinutes,
      estimatedTimeSavedMinutes: getReportTimeMetrics(report).savedMinutes,
      timeSavedPercent: report.timeSavedPercent || 0,
      qualityLabel: report.qualityAssessment?.label || null,
      errorSummary: {
        placeholder: report.errorSummary?.placeholder || 0,
        consistency: report.errorSummary?.consistency || 0,
        compliance: report.errorSummary?.compliance || 0,
        formatting: report.errorSummary?.formatting || 0,
        missing_data: report.errorSummary?.missing_data || 0,
      },
    }));

    res.json({
      scope: scopeConfig.scope,
      summary,
      errorBreakdown,
      qualityBreakdown,
      trends: Array.from(trendBuckets.values()),
      passFailRateTrends,
      mostCommonErrorTypes,
      checklistFailureBreakdown,
      qualityScoreTrend,
      recentReports,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getReportText = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id).select('extractedText filename analyzedBy');

    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    if (
      req.user.role === 'user' &&
      report.analyzedBy.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    res.json({
      filename: report.filename,
      text: report.extractedText || 'No text extracted yet',
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const downloadReport = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id)
      .populate('analyzedBy', 'name email');

    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    const analyzedById = typeof report.analyzedBy === 'object'
      ? report.analyzedBy._id.toString()
      : report.analyzedBy.toString();

    if (
      req.user.role === 'user' &&
      analyzedById !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Find the user's team (if any)
    const team = await Team.findOne({ members: analyzedById })
      .populate('teamLead', 'name email')
      .lean();

    const user = report.analyzedBy;
    const sanitisedFilename = report.filename.replace(/\.pdf$/i, '');
    const downloadName = `QC_Report_${sanitisedFilename}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);

    const doc = generateReportPdf(report, user, team);
    doc.pipe(res);
    doc.end();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Fetches the report and its detected errors, delegates to `generateAnnotatedPdf`
 * (which overlays error highlights onto the original PDF), then streams the
 * resulting buffer back as a downloadable attachment.
 */
const downloadAnnotatedPdf = async (req, res) => {
  console.log('=== downloadAnnotatedPdf called for report:', req.params.id, '===');
  try {
    const report = await Report.findById(req.params.id);

    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    if (
      req.user.role === 'user' &&
      report.analyzedBy.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (report.status !== 'analyzed') {
      return res.status(400).json({ message: 'Report has not been analyzed yet' });
    }

    if (!report.filePath) {
      return res.status(400).json({ message: 'Original PDF file path not found in database' });
    }

    if (!fs.existsSync(report.filePath)) {
      return res.status(400).json({ message: `Original PDF file not found on disk: ${report.filePath}` });
    }

    if (!report.errors || report.errors.length === 0) {
      return res.status(400).json({ message: 'No errors to annotate' });
    }

    console.log(`Generating annotated PDF for report ${report._id} with ${report.errors.length} errors`);
    
    const annotatedPdf = await generateAnnotatedPdf(report);
    
    const sanitisedFilename = report.filename.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9-_]/g, '_');
    const downloadName = `${sanitisedFilename}_ANNOTATED.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Content-Length', annotatedPdf.length);
    
    console.log(`Sending annotated PDF: ${downloadName} (${annotatedPdf.length} bytes)`);
    res.send(annotatedPdf);
  } catch (error) {
    console.error('Error generating annotated PDF:', error);
    res.status(500).json({ message: `Failed to generate annotated PDF: ${error.message}` });
  }
};

module.exports = {
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
};
