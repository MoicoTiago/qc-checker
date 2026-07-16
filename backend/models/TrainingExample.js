const mongoose = require('mongoose');

const trainingExampleSchema = new mongoose.Schema(
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
    type: {
      type: String,
      enum: ['good', 'bad', 'template'],
      required: [true, 'Example type is required'],
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'trained', 'failed'],
      default: 'pending',
    },
    extractedText: {
      type: String,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    sourceReport: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Report',
    },
    trainedAt: {
      type: Date,
    },
    metadata: {
      pageCount: Number,
      sections: [String],
      documentType: String,
    },
    embedding: {
      type: [Number],
      default: [],
    },
    manualOverride: {
      type: Boolean,
      default: false,
    },
    detectedErrorCount: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

trainingExampleSchema.index({ type: 1, status: 1 });
trainingExampleSchema.index({ sourceReport: 1 }, { unique: true, sparse: true });

trainingExampleSchema.statics.getTrainingStats = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalExamples: { $sum: 1 },
        trainedExamples: {
          $sum: { $cond: [{ $eq: ['$status', 'trained'] }, 1, 0] },
        },
        pendingExamples: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
        },
        goodExamples: {
          $sum: { $cond: [{ $eq: ['$type', 'good'] }, 1, 0] },
        },
        badExamples: {
          $sum: { $cond: [{ $eq: ['$type', 'bad'] }, 1, 0] },
        },
        templates: {
          $sum: { $cond: [{ $eq: ['$type', 'template'] }, 1, 0] },
        },
      },
    },
  ]);

  return stats[0] || {
    totalExamples: 0,
    trainedExamples: 0,
    pendingExamples: 0,
    goodExamples: 0,
    badExamples: 0,
    templates: 0,
  };
};

module.exports = mongoose.model('TrainingExample', trainingExampleSchema);
