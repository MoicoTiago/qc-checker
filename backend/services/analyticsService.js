const Report = require('../models/Report');
const { getReportTimeMetrics } = require('./timeEstimationService');

const getAnalyticsScopeConfig = (range) => {
  const now = new Date();

  if (range === 'all') {
    return {
      range: 'all',
      startDate: null,
      bucketCount: 0,
      getBucketDate: () => null,
      getBucketKey: (date) =>
        `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
      formatBucketLabel: (date) =>
        new Intl.DateTimeFormat('en-GB', {
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(date),
    };
  }

  const parsedDays = parseInt(range, 10);
  const safeDays = !isNaN(parsedDays) && parsedDays > 0 ? parsedDays : 30;
  const startDate = new Date(now);
  startDate.setUTCDate(now.getUTCDate() - (safeDays - 1));
  startDate.setUTCHours(0, 0, 0, 0);

  return {
    range: String(safeDays),
    startDate,
    bucketCount: safeDays,
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
};

const buildAnalyticsPayload = async ({ filter, scopeLabel, scopeDetails, range, postFetchFilter }) => {
  const scopeConfig = getAnalyticsScopeConfig(range);
  const reportFilter = { ...filter };

  if (scopeConfig.startDate) {
    const existingStartDate = reportFilter.createdAt?.$gte
      ? new Date(reportFilter.createdAt.$gte)
      : null;
    const effectiveStartDate = existingStartDate && existingStartDate > scopeConfig.startDate
      ? existingStartDate
      : scopeConfig.startDate;

    reportFilter.createdAt = {
      ...(reportFilter.createdAt || {}),
      $gte: effectiveStartDate,
    };
  }

  let reports = await Report.find(reportFilter)
    .select('filename status errorCount errorSummary timeSaved estimatedManualReviewMinutes estimatedAiReviewMinutes estimatedTimeSavedMinutes timeSavedPercent qualityAssessment createdAt analyzedBy errors metadata')
    .populate('analyzedBy', 'name email')
    .sort({ createdAt: -1 })
    .lean();

  if (typeof postFetchFilter === 'function') {
    reports = reports.filter(postFetchFilter);
  }

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
  };

  const errorBreakdown = {
    placeholder: 0,
    consistency: 0,
    compliance: 0,
    formatting: 0,
    missing_data: 0,
  };
  const qualityBreakdown = { good: 0, bad: 0, uncertain: 0 };
  const checklistFailureCounts = new Map();
  const errorTypesByReport = {
    placeholder: 0,
    consistency: 0,
    compliance: 0,
    formatting: 0,
    missing_data: 0,
  };

  const trendBuckets = new Map();
  const bucketDates = [];

  if (scopeConfig.range === 'all') {
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
      periodKey: key,
      periodLabel: scopeConfig.formatBucketLabel(bucketDate),
      reportCount: 0,
      errorCount: 0,
      analyzedCount: 0,
      passedCount: 0,
      failedCount: 0,
    });
  });

  const userStats = new Map();

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
    } else {
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

    const qualityLabel = report.qualityAssessment?.label;
    if (qualityLabel && qualityBreakdown[qualityLabel] !== undefined) {
      qualityBreakdown[qualityLabel] += 1;
    }

    (report.errors || []).forEach((error) => {
      if (error?.message) {
        checklistFailureCounts.set(error.message, (checklistFailureCounts.get(error.message) || 0) + 1);
      }
    });

    const createdAt = new Date(report.createdAt);
    const bucketKey = scopeConfig.getBucketKey(createdAt);
    const existingBucket = trendBuckets.get(bucketKey);
    if (existingBucket) {
      existingBucket.reportCount += 1;
      existingBucket.errorCount += report.errorCount || 0;
      if (report.status === 'analyzed') {
        existingBucket.analyzedCount += 1;
        if (report.qualityAssessment?.label === 'good') existingBucket.passedCount += 1;
        if (report.qualityAssessment?.label === 'bad') existingBucket.failedCount += 1;
      }
    }

    if (report.analyzedBy) {
      const odId = report.analyzedBy._id?.toString() || report.analyzedBy.toString();
      if (!userStats.has(odId)) {
        userStats.set(odId, {
          odId,
          userName: report.analyzedBy.name || 'Unknown',
          userEmail: report.analyzedBy.email || '',
          reportCount: 0,
          errorCount: 0,
          passedCount: 0,
          failedCount: 0,
        });
      }

      const userStat = userStats.get(odId);
      userStat.reportCount += 1;
      userStat.errorCount += report.errorCount || 0;
      if (report.qualityAssessment?.label === 'good') userStat.passedCount += 1;
      if (report.qualityAssessment?.label === 'bad') userStat.failedCount += 1;
    }
  });

  if (summary.analyzedReports > 0) {
    summary.averageErrorsPerReport = Number(
      (summary.totalErrors / summary.analyzedReports).toFixed(2)
    );
  }

  const passRate = summary.analyzedReports > 0
    ? Number(((qualityBreakdown.good / summary.analyzedReports) * 100).toFixed(1))
    : 0;

  summary.totalTimeSaved = Math.round(summary.totalTimeSaved);
  summary.totalManualReviewMinutes = Math.round(summary.totalManualReviewMinutes);
  summary.totalAiReviewMinutes = Math.round(summary.totalAiReviewMinutes);
  summary.totalTimeSavedMinutes = Math.round(summary.totalTimeSavedMinutes);

  const timeSavedPercent = summary.totalManualReviewMinutes > 0
    ? Math.round((summary.totalTimeSaved / summary.totalManualReviewMinutes) * 100)
    : 0;

  const errorBreakdownArray = [
    { name: 'Placeholder', value: errorBreakdown.placeholder },
    { name: 'Consistency', value: errorBreakdown.consistency },
    { name: 'Compliance', value: errorBreakdown.compliance },
    { name: 'Formatting', value: errorBreakdown.formatting },
    { name: 'Missing Data', value: errorBreakdown.missing_data },
  ];

  const topErrors = Array.from(checklistFailureCounts.entries())
    .map(([message, count]) => ({ message, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const checklistFailureBreakdown = Array.from(checklistFailureCounts.entries())
    .map(([message, count]) => ({ message, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

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

  const passFailRateTrends = Array.from(trendBuckets.values()).map((bucket) => ({
    periodKey: bucket.periodKey,
    periodLabel: bucket.periodLabel,
    analyzedCount: bucket.analyzedCount,
    passedCount: bucket.passedCount,
    failedCount: bucket.failedCount,
    passRate:
      bucket.analyzedCount > 0
        ? Number(((bucket.passedCount / bucket.analyzedCount) * 100).toFixed(1))
        : 0,
  }));

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

  const trendData = Array.from(trendBuckets.values()).map((bucket) => ({
    periodKey: bucket.periodKey,
    period: bucket.periodLabel,
    reports: bucket.reportCount,
    errors: bucket.errorCount,
    passed: bucket.passedCount,
    failed: bucket.failedCount,
    passRate:
      bucket.analyzedCount > 0
        ? Number(((bucket.passedCount / bucket.analyzedCount) * 100).toFixed(1))
        : 0,
  }));

  const userLeaderboard = Array.from(userStats.values())
    .map((userStat) => ({
      ...userStat,
      passRate: userStat.reportCount > 0
        ? Number(((userStat.passedCount / userStat.reportCount) * 100).toFixed(1))
        : 0,
    }))
    .sort((a, b) => b.reportCount - a.reportCount)
    .slice(0, 10);

  const recentReports = reports.slice(0, 10).map((report) => ({
    _id: report._id,
    filename: report.filename,
    status: report.status,
    errorCount: report.errorCount || 0,
    qualityLabel: report.qualityAssessment?.label || null,
    analyzedBy: report.analyzedBy?.name || 'Unknown',
    createdAt: report.createdAt,
  }));

  return {
    scopeLabel,
    scopeDetails,
    summary: {
      ...summary,
      passRate,
      manualTime: summary.totalManualReviewMinutes,
      aiTime: summary.totalAiReviewMinutes,
      timeSavedPercent,
    },
    errorBreakdown: errorBreakdownArray,
    qualityBreakdown,
    trendData,
    passFailRateTrends,
    qualityScoreTrend,
    mostCommonErrorTypes,
    checklistFailureBreakdown,
    topErrors,
    userLeaderboard,
    recentReports,
  };
};

const resolveAnalyticsScope = async ({ level, entityId, teamModel, userModel }) => {
  if (level === 'team' && entityId) {
    const team = await teamModel.findById(entityId).populate('members', 'name email').lean();
    if (!team) {
      return null;
    }

    return {
      filter: { analyzedBy: { $in: team.members.map((member) => member._id) } },
      scopeLabel: `Team: ${team.name}`,
      scopeDetails: {
        teamId: team._id,
        teamName: team.name,
        memberCount: team.members.length,
      },
    };
  }

  if (level === 'user' && entityId) {
    const targetUser = await userModel.findById(entityId).select('name email role').lean();
    if (!targetUser) {
      return null;
    }

    return {
      filter: { analyzedBy: entityId },
      scopeLabel: `User: ${targetUser.name}`,
      scopeDetails: {
        userId: targetUser._id,
        userName: targetUser.name,
        userEmail: targetUser.email,
        userRole: targetUser.role,
      },
    };
  }

  return {
    filter: {},
    scopeLabel: 'Company-wide',
    scopeDetails: null,
  };
};

module.exports = {
  buildAnalyticsPayload,
  getAnalyticsScopeConfig,
  resolveAnalyticsScope,
};
