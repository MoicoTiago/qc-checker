const mongoose = require('mongoose');

const errorPatternSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Pattern name is required'],
    },
    type: {
      type: String,
      enum: ['placeholder', 'consistency', 'compliance', 'formatting', 'missing_data'],
      required: [true, 'Error type is required'],
    },
    pattern: {
      type: String,
      required: [true, 'Pattern is required'],
    },
    isRegex: {
      type: Boolean,
      default: true,
    },
    severity: {
      type: String,
      enum: ['high', 'medium', 'low'],
      default: 'medium',
    },
    suggestion: {
      type: String,
    },
    description: {
      type: String,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isBuiltIn: {
      type: Boolean,
      default: false,
    },
    matchCount: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

errorPatternSchema.index({ type: 1, isActive: 1 });

errorPatternSchema.statics.getActivePatterns = function (type = null) {
  const query = { isActive: true };
  if (type) {
    query.type = type;
  }
  return this.find(query).sort({ type: 1, severity: -1 });
};

errorPatternSchema.statics.incrementMatchCount = async function (patternId) {
  return this.findByIdAndUpdate(
    patternId,
    { $inc: { matchCount: 1 } },
    { new: true }
  );
};

module.exports = mongoose.model('ErrorPattern', errorPatternSchema);
