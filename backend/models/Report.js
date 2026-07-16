const mongoose = require('mongoose');

const errorSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['placeholder', 'consistency', 'compliance', 'formatting', 'missing_data'],
      required: true,
    },
    severity: {
      type: String,
      enum: ['high', 'medium', 'low'],
      default: 'medium',
    },
    message: {
      type: String,
      required: true,
    },
    location: {
      section: String,
      page: Number,
      lineStart: Number,
      lineEnd: Number,
    },
    suggestion: {
      type: String,
    },
    originalText: {
      type: String,
    },
  },
  { _id: true }
);

const reportSchema = new mongoose.Schema(
  {
    filename: {
      type: String,
      required: [true, 'Filename is required'],
    },
    filePath: {
      type: String,
      required: [true, 'File path is required'],
    },
    fileSize: {
      type: Number,
    },
    // Set by the scheduled source-file cleanup job after the original PDF has been removed from
    // local disk. Analytics fields stay on the report document, so dashboards keep working even
    // when source-file-only features (re-analysis / annotated download) no longer can.
    sourceFileDeletedAt: {
      type: Date,
      default: null,
    },
    // Machine-readable reason for source file removal; useful for distinguishing retention
    // cleanup from cases where the file was already missing when the cleanup job checked it.
    sourceFileDeletionReason: {
      type: String,
      default: '',
      trim: true,
    },
    analyzedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Business-visible "analysis completed" time, kept separate from the ORM-managed `createdAt`
    // (see `timestamps: true` below). The Reports tab list and all admin-side sorts key off this
    // field so re-analysis / migration flows can update the timestamp without mutating createdAt.
    analyzedAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'analyzed', 'failed'],
      default: 'pending',
    },
    errors: [errorSchema],
    errorCount: {
      type: Number,
      default: 0,
    },
    errorSummary: {
      placeholder: { type: Number, default: 0 },
      consistency: { type: Number, default: 0 },
      compliance: { type: Number, default: 0 },
      formatting: { type: Number, default: 0 },
      missing_data: { type: Number, default: 0 },
    },
    timeSaved: {
      type: Number,
      default: 0,
    },
    estimatedManualReviewMinutes: {
      type: Number,
      default: 0,
    },
    estimatedAiReviewMinutes: {
      type: Number,
      default: 0,
    },
    estimatedTimeSavedMinutes: {
      type: Number,
      default: 0,
    },
    timeSavedPercent: {
      type: Number,
      default: 0,
    },
    extractedText: {
      type: String,
    },
    // Paired state with `trainingLabel` below: both are flipped together by the Reports-tab
    // "Add to Training" action (PATCH /api/admin/reports/:id/training). A report is considered
    // training-ready only when `addedToTraining === true` AND `trainingLabel` is non-null.
    addedToTraining: {
      type: Boolean,
      default: false,
    },

    // `null` is deliberately included in the enum so a freshly-created report can legally carry
    // an "unlabelled" state; the admin training endpoint narrows this to `'good'|'bad'` on write.
    trainingLabel: {
      type: String,
      enum: ['good', 'bad', null],
      default: null,
    },
    qualityAssessment: {
      label: {
        type: String,
        enum: ['good', 'bad', 'uncertain', null],
        default: null,
      },
      confidence: { type: Number, default: 0 },
      goodScore: { type: Number, default: 0 },
      badScore: { type: Number, default: 0 },
      matchedExamples: { type: Number, default: 0 },
      method: { type: String, default: 'checklist-rule-good-profile' },
      evaluatedAt: { type: Date },
    },
    metadata: {
      pageCount: { type: Number, default: 0 },
      wordCount: { type: Number, default: 0 },
      sections: [String],
      headerFields: {
        visitDate: { type: String, default: '' },
        referenceNumber: { type: String, default: '' },
        consultant: { type: String, default: '' },
      },
    },
  },
  {
    timestamps: true,
  }
);

// `errorCount` and `errorSummary` are derived fields — do NOT set them manually; they're recomputed
// from `this.errors` on every save. Profile-page analytics and the Reports-tab per-row renders both
// read these directly, so the rebuild here is load-bearing: any drift would show up as wrong totals
// in charts and tables. The `!== undefined` guard silently drops error types not in the enum,
// matching the same defensive pattern used in the Profile analytics aggregation.
reportSchema.pre('save', function (next) {
  if (this.errors) {
    this.errorCount = this.errors.length;
    
    this.errorSummary = {
      placeholder: 0,
      consistency: 0,
      compliance: 0,
      formatting: 0,
      missing_data: 0,
    };
    
    this.errors.forEach((error) => {
      if (this.errorSummary[error.type] !== undefined) {
        this.errorSummary[error.type]++;
      }
    });
  }
  next();
});

module.exports = mongoose.model('Report', reportSchema);
