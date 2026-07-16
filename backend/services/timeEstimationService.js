// Business assumptions for review-time estimates. These should be tuned if the
// product later captures real manual/AI review durations from users.
const ESTIMATE_CONFIG = {
  wordsPerFallbackPage: 500,
  manualMinutesPerPage: 2.5,
  aiSkimMinutesPerPage: 0.5,
  aiSetupMinutes: 1,
  aiIssueReviewRatio: 0.45,
  issueTypeMinutes: {
    placeholder: 1,
    missing_data: 2,
    compliance: 2.5,
    consistency: 2,
    formatting: 0.75,
  },
  severityMultiplier: {
    low: 0.75,
    medium: 1,
    high: 1.5,
  },
};

const toPositiveNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

const estimatePageCount = ({ pageCount, wordCount }) => {
  const explicitPages = toPositiveNumber(pageCount);
  if (explicitPages > 0) {
    return Math.ceil(explicitPages);
  }

  const words = toPositiveNumber(wordCount);
  return words > 0 ? Math.ceil(words / ESTIMATE_CONFIG.wordsPerFallbackPage) : 0;
};

const getIssueMinutes = (error = {}) => {
  const baseMinutes = ESTIMATE_CONFIG.issueTypeMinutes[error.type] ?? 1.5;
  const multiplier = ESTIMATE_CONFIG.severityMultiplier[error.severity] ?? 1;
  return baseMinutes * multiplier;
};

const roundMinutes = (minutes) => Math.round(Math.max(0, minutes));

const estimateReviewTime = ({ pageCount = 0, wordCount = 0, errors = [] } = {}) => {
  const safeErrors = Array.isArray(errors) ? errors : [];
  const estimatedPages = estimatePageCount({ pageCount, wordCount });
  const issueMinutes = safeErrors.reduce((sum, error) => sum + getIssueMinutes(error), 0);

  const manualMinutes =
    estimatedPages * ESTIMATE_CONFIG.manualMinutesPerPage +
    issueMinutes;

  const aiMinutes =
    (estimatedPages > 0 || safeErrors.length > 0 ? ESTIMATE_CONFIG.aiSetupMinutes : 0) +
    estimatedPages * ESTIMATE_CONFIG.aiSkimMinutesPerPage +
    issueMinutes * ESTIMATE_CONFIG.aiIssueReviewRatio;

  const savedMinutes = Math.max(0, manualMinutes - aiMinutes);

  return {
    estimatedPages,
    estimatedManualReviewMinutes: roundMinutes(manualMinutes),
    estimatedAiReviewMinutes: roundMinutes(aiMinutes),
    estimatedTimeSavedMinutes: roundMinutes(savedMinutes),
    timeSavedPercent:
      manualMinutes > 0 ? Math.round((savedMinutes / manualMinutes) * 100) : 0,
  };
};

const getReportTimeMetrics = (report = {}) => {
  const estimatedSavedMinutes = toPositiveNumber(report.estimatedTimeSavedMinutes);
  const legacySavedMinutes = toPositiveNumber(report.timeSaved);
  const manualMinutes = toPositiveNumber(
    report.estimatedManualReviewMinutes ??
    report.manualTime
  );
  const aiMinutes = toPositiveNumber(
    report.estimatedAiReviewMinutes ??
    report.aiTime
  );

  if (manualMinutes > 0 || aiMinutes > 0 || estimatedSavedMinutes > 0) {
    return {
      manualMinutes,
      aiMinutes,
      savedMinutes: estimatedSavedMinutes,
    };
  }

  // Older reports may only have the legacy `timeSaved` field. When metadata and
  // errors are present, re-estimate the full timing breakdown for analytics.
  if (report.metadata || Array.isArray(report.errors)) {
    const estimated = estimateReviewTime({
      pageCount: report.metadata?.pageCount,
      wordCount: report.metadata?.wordCount,
      errors: report.errors || [],
    });

    if (
      estimated.estimatedManualReviewMinutes > 0 ||
      estimated.estimatedAiReviewMinutes > 0 ||
      estimated.estimatedTimeSavedMinutes > 0
    ) {
      return {
        manualMinutes: estimated.estimatedManualReviewMinutes,
        aiMinutes: estimated.estimatedAiReviewMinutes,
        savedMinutes: estimated.estimatedTimeSavedMinutes,
      };
    }
  }

  return {
    manualMinutes: 0,
    aiMinutes: 0,
    savedMinutes: legacySavedMinutes,
  };
};

const aggregateReportTimeMetrics = (reports = []) => {
  const totals = reports.reduce(
    (sum, report) => {
      const metrics = getReportTimeMetrics(report);
      sum.manualMinutes += metrics.manualMinutes;
      sum.aiMinutes += metrics.aiMinutes;
      sum.savedMinutes += metrics.savedMinutes;
      return sum;
    },
    { manualMinutes: 0, aiMinutes: 0, savedMinutes: 0 }
  );

  return {
    totalManualReviewMinutes: Math.round(totals.manualMinutes),
    totalAiReviewMinutes: Math.round(totals.aiMinutes),
    totalTimeSavedMinutes: Math.round(totals.savedMinutes),
    timeSavedPercent:
      totals.manualMinutes > 0
        ? Math.round((totals.savedMinutes / totals.manualMinutes) * 100)
        : 0,
  };
};

module.exports = {
  ESTIMATE_CONFIG,
  estimateReviewTime,
  getReportTimeMetrics,
  aggregateReportTimeMetrics,
};
