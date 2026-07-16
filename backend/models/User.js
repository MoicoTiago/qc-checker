const mongoose = require('mongoose');

const userPreferencesSchema = new mongoose.Schema(
  {
    theme: {
      type: String,
      enum: ['light', 'dark'],
      default: 'light',
    },
    highContrast: {
      type: Boolean,
      default: false,
    },
    fontSize: {
      type: Number,
      default: 100,
      min: 80,
      max: 150,
    },
    colorblindMode: {
      type: String,
      enum: ['none', 'protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'],
      default: 'none',
    },
    reducedMotion: {
      type: Boolean,
      default: false,
    },
    notifications: {
      teamAssignment: { type: Boolean, default: true },
      teamRemoval: { type: Boolean, default: true },
      reportComplete: { type: Boolean, default: true },
      weeklySummary: { type: Boolean, default: false },
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a name'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Please add an email'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Please add a password'],
      minlength: 6,
    },
    role: {
      type: String,
      enum: ['admin', 'team_leader', 'user'],
      default: 'user',
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    // Hinge of all team-leader scoping across the Manage tab: getUsers/updateUser/deleteUser and
    // resetUserPassword in userController.js compare `managedBy` against the requester to decide
    // authorisation. `null` means the row is unassigned and only admins can act on it.
    managedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Default `true` so direct DB inserts (seed scripts, migrations) still force a password change
    // on next login; the admin-driven create and reset paths also set this explicitly.
    mustChangePassword: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockoutUntil: {
      type: Date,
      default: null,
    },
    preferences: {
      type: userPreferencesSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  }
);

// Populated on demand via `.populate('reportsCount')` — notably by GET /api/admin/users, which
// feeds the admin dashboard's per-user drill-downs. Left as a virtual (not a persisted counter)
// so it can't drift from the Report collection; the trade-off is one extra count query per
// populate call, which is acceptable at admin-dashboard cardinality.
userSchema.virtual('reportsCount', {
  ref: 'Report',
  localField: '_id',
  foreignField: 'analyzedBy',
  count: true,
});

// Virtuals must be explicitly opted in to serialisation, otherwise `reportsCount` (and any
// future virtuals) would be stripped from API responses and `res.json(user)` callers.
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('User', userSchema);
