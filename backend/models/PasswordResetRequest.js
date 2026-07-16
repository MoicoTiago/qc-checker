const mongoose = require('mongoose');

const passwordResetRequestSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: 'true',
        },
        status: {
            type: String,
            enum: ['pending', 'completed', 'rejected'],
            default: 'pending',
        },
        // Kept as an explicit field alongside mongoose `timestamps: true` because the Manage tab
        // sorts the queue on `requestedAt` specifically, and future flows (e.g. re-opening a
        // rejected request) may want to preserve the original submission time while `createdAt`
        // stays immutable on the document.
        requestedAt: {
            type: Date,
            default: Date.now,
        },
        resolvedAt: {
            type: Date,
            default: null,
        },
        resolvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        // Free-text audit field — currently populated only on reject with the admin's reason; kept
        // as an empty string (not null) so downstream code can safely call string methods on it.
        notes: {
            type: String,
            trim: true,
            default: '',
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model('PasswordResetRequest', passwordResetRequestSchema)