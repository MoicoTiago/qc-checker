/**
 * @file trainingService.js
 *
 * Manages the AI training pipeline. Admin-labeled reports and uploaded training
 * PDFs are processed into TrainingExample documents. These examples power two
 * features: quality prediction (cosine similarity of document embeddings against
 * known good/bad reports) and context-aware error rescoring (adjusting severity
 * based on error patterns observed in training data).
 */
const Report = require('../models/Report');
const TrainingExample = require('../models/TrainingExample');
const mlService = require('./mlService');
const { processDocument } = require('./pdfService');
const { analyseTemplate } = require('./templateProcessor');

const MIN_TEXT_LENGTH = 200;
const MAX_GOOD_REFERENCE_ERRORS = 12;

const normalizeTextForEmbedding = (text = '') => text.substring(0, 4000);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Syncs the training set from admin-labeled reports: finds all reports marked
 *  addedToTraining with a good/bad label, generates embeddings, and upserts
 *  corresponding TrainingExample documents. */
const buildTrainingExamplesFromLabeledReports = async () => {
  const labeledReports = await Report.find({
    addedToTraining: true,
    trainingLabel: { $in: ['good', 'bad'] },
    extractedText: { $exists: true, $ne: null },
  }).select('_id filename filePath fileSize trainingLabel extractedText analyzedBy metadata errorCount');

  let createdOrUpdated = 0;
  let skipped = 0;

  for (const report of labeledReports) {
    const text = (report.extractedText || '').trim();
    if (text.length < MIN_TEXT_LENGTH) {
      skipped += 1;
      continue;
    }

    const embedding = await mlService.getEmbedding(normalizeTextForEmbedding(text));
    if (!embedding || !embedding.length) {
      skipped += 1;
      continue;
    }

    await TrainingExample.findOneAndUpdate(
      { sourceReport: report._id },
      {
        filename: report.filename,
        filePath: report.filePath,
        fileSize: report.fileSize,
        type: report.trainingLabel,
        status: 'trained',
        extractedText: text.substring(0, 20000),
        uploadedBy: report.analyzedBy,
        sourceReport: report._id,
        trainedAt: new Date(),
        metadata: {
          pageCount: report.metadata?.pageCount || 0,
          sections: report.metadata?.sections || [],
          documentType: 'report',
        },
        embedding,
        manualOverride: true,
        detectedErrorCount: report.errorCount || 0,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    createdOrUpdated += 1;
  }

  return {
    labeledReports: labeledReports.length,
    createdOrUpdated,
    skipped,
  };
};

const average = (values) => {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
};

const normalizeMessage = (message = '') =>
  message
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/["'`]/g, '')
    .trim();

const makeErrorKey = (error = {}) =>
  `${error.type || 'unknown'}::${normalizeMessage(error.message || '')}`;

const computeRuleScore = (analysisResults = {}) => {
  const summary = analysisResults.errorSummary || {};
  const errors = analysisResults.errors || [];

  const complianceHigh = errors.filter((e) => e.type === 'compliance' && e.severity === 'high').length;
  const complianceMedium = errors.filter((e) => e.type === 'compliance' && e.severity === 'medium').length;
  const complianceLow = errors.filter((e) => e.type === 'compliance' && e.severity === 'low').length;

  const placeholder = summary.placeholder || 0;
  const missingData = summary.missing_data || 0;
  const consistency = summary.consistency || 0;
  const formatting = summary.formatting || 0;

  // Weighted penalty: checklist/compliance dominates; formatting is lower impact.
  const penalty =
    complianceHigh * 18 +
    complianceMedium * 10 +
    complianceLow * 6 +
    placeholder * 8 +
    missingData * 4 +
    consistency * 3 +
    formatting * 1;

  const score = clamp(100 - penalty, 0, 100);

  return {
    score,
    penalty,
    complianceHigh,
    complianceMedium,
    complianceLow,
  };
};

const computeCentroid = (vectors = []) => {
  if (!vectors.length) return null;
  const dim = vectors[0].length;
  const centroid = new Array(dim).fill(0);
  for (const vec of vectors) {
    for (let i = 0; i < dim; i++) centroid[i] += vec[i];
  }
  for (let i = 0; i < dim; i++) centroid[i] /= vectors.length;
  return centroid;
};

const toGoodProbability = (similarity, threshold) => {
  if (!Number.isFinite(similarity) || !Number.isFinite(threshold)) return 0.5;
  // Scale around threshold; 0.08 band gives useful spread for cosine similarities.
  return clamp(0.5 + (similarity - threshold) / 0.16, 0, 1);
};

/** Predicts report quality (good/bad/uncertain) by blending a rule-based
 *  checklist score (75% weight) with cosine similarity of the document's
 *  embedding against the centroid of known-good training examples (25% weight). */
const predictQualityFromTraining = async (text, analysisResults = {}) => {
  const content = (text || '').trim();
  const rule = computeRuleScore(analysisResults);

  // Hard fail for strong compliance misses.
  if (rule.complianceHigh > 0) {
    return {
      label: 'bad',
      confidence: 0.9,
      goodScore: Number((rule.score / 100).toFixed(4)),
      badScore: Number((1 - rule.score / 100).toFixed(4)),
      matchedExamples: 0,
      method: 'checklist-rule-good-profile',
      reason: 'High-severity compliance failures present',
    };
  }

  let profileGoodProbability = 0.5;
  let matchedExamples = 0;
  let profileReason = 'Profile signal unavailable';

  try {
    if (content.length >= MIN_TEXT_LENGTH) {
      const trainingExamples = await TrainingExample.find({
        status: 'trained',
        type: { $in: ['good', 'bad'] },
      }).select('type embedding manualOverride detectedErrorCount');

      const goodEmbeddings = trainingExamples
        .filter((ex) =>
          ex.type === 'good' &&
          Array.isArray(ex.embedding) &&
          ex.embedding.length > 0 &&
          (ex.manualOverride || (ex.detectedErrorCount || 0) < MAX_GOOD_REFERENCE_ERRORS)
        )
        .map((ex) => ex.embedding);
      const badEmbeddings = trainingExamples
        .filter((ex) => ex.type === 'bad' && Array.isArray(ex.embedding) && ex.embedding.length > 0)
        .map((ex) => ex.embedding);

      matchedExamples = goodEmbeddings.length + badEmbeddings.length;

      if (goodEmbeddings.length >= 2) {
        const docEmbedding = await mlService.getEmbedding(normalizeTextForEmbedding(content));
        if (docEmbedding && docEmbedding.length) {
          const goodCentroid = computeCentroid(goodEmbeddings);
          const docSimilarity = mlService.calculateSimilarity(docEmbedding, goodCentroid);

          const avgGoodSimilarity = average(
            goodEmbeddings.map((emb) => mlService.calculateSimilarity(emb, goodCentroid))
          );
          const avgBadSimilarity = badEmbeddings.length
            ? average(badEmbeddings.map((emb) => mlService.calculateSimilarity(emb, goodCentroid)))
            : avgGoodSimilarity - 0.08;

          const threshold = (avgGoodSimilarity + avgBadSimilarity) / 2;
          profileGoodProbability = toGoodProbability(docSimilarity, threshold);
          profileReason = 'Profile signal from similarity to good centroid';
        } else {
          profileReason = 'Could not generate document embedding';
        }
      } else {
        profileReason = 'Not enough good examples for profile centroid';
      }
    } else {
      profileReason = 'Text too short for profile embedding';
    }
  } catch (error) {
    profileReason = `Profile lookup failed: ${error.message}`;
  }

  const ruleGoodProbability = rule.score / 100;
  const combinedGoodProbability = 0.75 * ruleGoodProbability + 0.25 * profileGoodProbability;
  const combinedBadProbability = 1 - combinedGoodProbability;

  let label = 'uncertain';
  if (combinedGoodProbability >= 0.7) label = 'good';
  if (combinedGoodProbability <= 0.45) label = 'bad';

  const confidence = clamp(Math.abs(combinedGoodProbability - 0.575) * 2, 0, 0.99);

  return {
    label,
    confidence: Number(confidence.toFixed(4)),
    goodScore: Number(combinedGoodProbability.toFixed(4)),
    badScore: Number(combinedBadProbability.toFixed(4)),
    matchedExamples,
    method: 'checklist-rule-good-profile',
    reason: `${profileReason}; ruleScore=${rule.score}`,
  };
};

const buildErrorContextProfile = async () => {
  const trainingExamples = await TrainingExample.find({
    status: 'trained',
    type: { $in: ['good', 'bad'] },
    sourceReport: { $exists: true, $ne: null },
    manualOverride: false,
  }).select('type sourceReport');

  const reportIds = trainingExamples.map((example) => example.sourceReport);
  const reports = await Report.find({
    _id: { $in: reportIds },
    status: 'analyzed',
    errors: { $exists: true, $ne: [] },
  }).select('errors');

  const reportMap = new Map(reports.map((report) => [report._id.toString(), report]));

  const profile = {
    good: {},
    bad: {},
    totalGoodReports: 0,
    totalBadReports: 0,
  };

  for (const example of trainingExamples) {
    const report = reportMap.get(example.sourceReport.toString());
    if (!report) continue;

    const bucket = example.type === 'good' ? profile.good : profile.bad;
    if (example.type === 'good') profile.totalGoodReports += 1;
    if (example.type === 'bad') profile.totalBadReports += 1;

    for (const err of report.errors || []) {
      const key = makeErrorKey(err);
      bucket[key] = (bucket[key] || 0) + 1;
    }
  }

  return profile;
};

/** Adjusts error severity based on patterns learned from training data.
 *  Errors frequently seen in good reports but not bad ones are suppressed or
 *  downgraded. Only missing_data and formatting errors are eligible. */
const applyContextAwareErrorRescoring = async (errors = []) => {
  try {
    if (!errors.length) {
      return { errors, adjustments: { suppressed: 0, downgraded: 0 } };
    }

    const profile = await buildErrorContextProfile();
    if (profile.totalGoodReports < 2 || profile.totalBadReports < 1) {
      return {
        errors,
        adjustments: { suppressed: 0, downgraded: 0, skipped: true },
      };
    }

    const eligibleTypes = new Set(['missing_data', 'formatting']);
    const rescored = [];
    let suppressed = 0;
    let downgraded = 0;

    for (const err of errors) {
      if (!eligibleTypes.has(err.type)) {
        rescored.push(err);
        continue;
      }

      const key = makeErrorKey(err);
      const goodCount = profile.good[key] || 0;
      const badCount = profile.bad[key] || 0;

      // High-confidence acceptable pattern: seen multiple times in good, never in bad.
      if (goodCount >= 2 && badCount === 0) {
        suppressed += 1;
        continue;
      }

      // Mild acceptable pattern: more common in good than bad, keep but downgrade severity.
      if (goodCount >= 2 && goodCount > badCount) {
        rescored.push({
          ...err,
          severity: 'low',
          message: `${err.message} (accepted in similar good reports)`,
        });
        downgraded += 1;
        continue;
      }

      rescored.push(err);
    }

    return {
      errors: rescored,
      adjustments: { suppressed, downgraded, skipped: false },
    };
  } catch (error) {
    console.warn('Context-aware error rescoring skipped:', error.message);
    return {
      errors,
      adjustments: { suppressed: 0, downgraded: 0, skipped: true },
    };
  }
};

/** Processes a training PDF: extracts text via pdfService, runs template or
 *  generic analysis to populate metadata, generates an embedding for similarity
 *  comparison, and marks the example as trained. */
const processTrainingExample = async (exampleId) => {
  const example = await TrainingExample.findById(exampleId);
  if (!example) {
    throw new Error('Training example not found');
  }

  try {
    example.status = 'processing';
    await example.save();

    const pdfResult = await processDocument(example.filePath);
    const text = (pdfResult.text || '').trim();

    if (text.length < MIN_TEXT_LENGTH) {
      example.status = 'failed';
      example.extractedText = text;
      await example.save();
      throw new Error('Extracted text too short for training');
    }

    example.extractedText = text.substring(0, 20000);

    if (example.type === 'template') {
      // Run the template structural analyser instead of the generic metadata
      const templateMeta = analyseTemplate(text, {
        pageCount: pdfResult.numPages || pdfResult.pageCount || 0,
        sections: pdfResult.sections || [],
        headerFields: pdfResult.headerFields || {},
      });
      example.metadata = templateMeta;

      // Still generate an embedding so similarity comparison is possible
      const embedding = await mlService.getEmbedding(normalizeTextForEmbedding(text));
      if (embedding && embedding.length) {
        example.embedding = embedding;
      }
    } else {
      example.metadata = {
        pageCount: pdfResult.numPages || pdfResult.pageCount || 0,
        sections: pdfResult.sections?.map((s) => s.title) || [],
        documentType: 'training-upload',
      };

      const embedding = await mlService.getEmbedding(normalizeTextForEmbedding(text));
      if (embedding && embedding.length) {
        example.embedding = embedding;
      }
    }

    example.status = 'trained';
    example.trainedAt = new Date();
    await example.save();

    return example;
  } catch (error) {
    example.status = 'failed';
    await example.save();
    throw error;
  }
};

const getActiveTemplate = async () => {
  return TrainingExample.findOne({ type: 'template', isActive: true, status: 'trained' })
    .select('filename metadata embedding extractedText trainedAt')
    .lean();
};

module.exports = {
  buildTrainingExamplesFromLabeledReports,
  predictQualityFromTraining,
  applyContextAwareErrorRescoring,
  processTrainingExample,
  getActiveTemplate,
};
