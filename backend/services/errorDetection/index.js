/**
 * Orchestration layer for all error detection.
 *
 * Runs multiple detector passes (placeholder, formatting, missing data,
 * checklist, template compliance, and ML-enhanced), deduplicates the
 * combined results, applies context-aware rescoring derived from training
 * data, and estimates the review time saved.
 */

const placeholderDetector = require('./placeholderDetector');
const formattingChecker = require('./formattingChecker');
const missingDataChecker = require('./missingDataChecker');
const checklistChecker = require('./checklistChecker');
const templateChecker = require('./templateChecker');
const mlEnhancedDetector = require('./mlEnhancedDetector');
const { applyContextAwareErrorRescoring, getActiveTemplate } = require('../trainingService');
const { estimateReviewTime } = require('../timeEstimationService');

/**
 * Run every detector against the document and return a unified result.
 *
 * @param {string} text - Full document text.
 * @param {Array<{title: string, content: string}>} sections - Pre-parsed document sections.
 * @param {Object} options - Optional overrides (headerFields, wordCount, pageCount).
 * @returns {Promise<{errors: Array, errorCount: number, errorSummary: Object,
 *   timeSaved: number, estimatedTimeSavedMinutes: number, contextAdjustments: Array}>}
 */
const analyzeDocument = async (text, sections = [], options = {}) => {
  const errors = [];

  const placeholderErrors = placeholderDetector.detect(text);
  errors.push(...placeholderErrors);

  const formattingErrors = formattingChecker.detect(text);
  errors.push(...formattingErrors);

  const missingDataErrors = missingDataChecker.detect(text, sections, options.headerFields || {});
  errors.push(...missingDataErrors);

  const checklistErrors = checklistChecker.detect(text, sections);
  errors.push(...checklistErrors);

  try {
    const activeTemplate = await getActiveTemplate();
    if (activeTemplate?.metadata) {
      const templateErrors = templateChecker.detect(text, activeTemplate.metadata);
      errors.push(...templateErrors);
    }
  } catch (err) {
    console.warn('Template compliance check skipped:', err.message);
  }

  try {
    const mlErrors = await mlEnhancedDetector.analyzeWithML(text, sections);
    errors.push(...mlErrors);

    const similarityErrors = await mlEnhancedDetector.findSimilarSections(sections);
    errors.push(...similarityErrors);
  } catch (error) {
    console.log('ML analysis skipped:', error.message);
  }

  const uniqueErrors = deduplicateErrors(errors);
  const groupedErrors = sortErrorsByType(uniqueErrors);
  const rescoredResult = await applyContextAwareErrorRescoring(groupedErrors);
  const finalErrors = sortErrorsByType(rescoredResult.errors);
  const errorSummary = buildErrorSummary(finalErrors);
  const wordCount =
    Number(options.wordCount) ||
    String(text || '').split(/\s+/).filter(Boolean).length;
  const timing = estimateReviewTime({
    pageCount: options.pageCount,
    wordCount,
    errors: finalErrors,
  });

  return {
    errors: finalErrors,
    errorCount: finalErrors.length,
    errorSummary,
    timeSaved: timing.estimatedTimeSavedMinutes,
    ...timing,
    contextAdjustments: rescoredResult.adjustments,
  };
};

const buildErrorSummary = (errors) => {
  const summary = {
    placeholder: 0,
    consistency: 0,
    compliance: 0,
    formatting: 0,
    missing_data: 0,
  };

  for (const err of errors) {
    if (summary[err.type] !== undefined) summary[err.type] += 1;
  }

  return summary;
};

/** Dedup key: type + first 40 chars of originalText + lineStart. */
const deduplicateErrors = (errors) => {
  const seen = new Set();
  return errors.filter((error) => {
    const originalText = (error.originalText || '').substring(0, 40).toLowerCase();
    const lineStart = error.location?.lineStart || 0;
    const key = `${error.type}-${originalText}-${lineStart}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

/** Multi-level sort: error type order → severity (high first) → alphabetical message. */
const sortErrorsByType = (errors) => {
  const typeOrder = {
    placeholder: 0,
    consistency: 1,
    compliance: 2,
    formatting: 3,
    missing_data: 4,
  };

  return [...errors].sort((a, b) => {
    const orderA = typeOrder[a.type] ?? 99;
    const orderB = typeOrder[b.type] ?? 99;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    const sevOrder = { high: 0, medium: 1, low: 2 };
    const sevA = sevOrder[a.severity] ?? 99;
    const sevB = sevOrder[b.severity] ?? 99;
    
    if (sevA !== sevB) {
      return sevA - sevB;
    }

    return (a.message || '').localeCompare(b.message || '');
  });
};

module.exports = { analyzeDocument };
