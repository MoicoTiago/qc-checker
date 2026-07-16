const request = require('supertest');
const express = require('express');

jest.mock('../../middleware/authMiddleware', () => ({
  protect: (req, res, next) => {
    req.user = { _id: 'admin-1', email: 'admin@example.com', role: 'admin' };
    next();
  },
  authorize: () => (req, res, next) => next(),
}));

jest.mock('../../models/User', () => ({
  countDocuments: jest.fn(),
}));

jest.mock('../../models/Report', () => ({
  find: jest.fn(),
  deleteMany: jest.fn(),
}));

jest.mock('../../models/Team', () => ({
  findById: jest.fn(),
}));

jest.mock('../../models/TrainingExample', () => ({
  getTrainingStats: jest.fn(),
  create: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  updateMany: jest.fn(),
}));

jest.mock('../../models/AuditLog', () => ({
  find: jest.fn(),
  countDocuments: jest.fn(),
}));

jest.mock('../../middleware/uploadMiddleware', () => ({
  trainingUpload: { single: () => (req, res, next) => next() },
  handleUploadError: (req, res, next) => next(),
}));

jest.mock('../../services/analyticsService', () => ({
  buildAnalyticsPayload: jest.fn(),
  resolveAnalyticsScope: jest.fn(),
}));

jest.mock('../../services/trainingService', () => ({
  buildTrainingExamplesFromLabeledReports: jest.fn(),
  processTrainingExample: jest.fn(),
}));

jest.mock('../../services/emailService', () => ({
  sendTeamAssignmentEmail: jest.fn(),
  sendTeamLeadAssignmentEmail: jest.fn(),
  sendTeamRemovalEmail: jest.fn(),
}));

jest.mock('../../services/auditService', () => ({
  log: jest.fn(),
}));

const User = require('../../models/User');
const Report = require('../../models/Report');
const Team = require('../../models/Team');

const adminRoutes = require('../../routes/adminRoutes');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

describe('GET /api/admin/stats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns overview stats with no filters', async () => {
    User.countDocuments.mockResolvedValue(14);

    Report.find.mockResolvedValue([
      {
        errorCount: 3,
        timeSaved: 8,
        estimatedManualReviewMinutes: 12,
        estimatedAiReviewMinutes: 4,
        estimatedTimeSavedMinutes: 8,
        errorSummary: {
          placeholder: 1,
          consistency: 0,
          compliance: 2,
          formatting: 0,
          missing_data: 0,
        },
        qualityAssessment: { label: 'good' },
      },
      {
        errorCount: 2,
        timeSaved: 4,
        estimatedManualReviewMinutes: 7,
        estimatedAiReviewMinutes: 3,
        estimatedTimeSavedMinutes: 4,
        errorSummary: {
          placeholder: 0,
          consistency: 1,
          compliance: 0,
          formatting: 1,
          missing_data: 0,
        },
        qualityAssessment: { label: 'bad' },
      },
      {
        errorCount: 1,
        timeSaved: 2,
        estimatedManualReviewMinutes: 5,
        estimatedAiReviewMinutes: 3,
        estimatedTimeSavedMinutes: 2,
        errorSummary: {
          placeholder: 0,
          consistency: 0,
          compliance: 0,
          formatting: 0,
          missing_data: 1,
        },
        qualityAssessment: { label: 'uncertain' },
      },
    ]);

    const res = await request(app).get('/api/admin/stats');

    expect(res.status).toBe(200);
    expect(res.body.totalUsers).toBe(14);
    expect(res.body.totalReports).toBe(3);
    expect(res.body.totalErrors).toBe(6);
    expect(res.body.timeSaved).toBe(14);
    expect(res.body.manualTime).toBe(24);
    expect(res.body.errorBreakdown).toHaveLength(5);
    expect(res.body.qualityBreakdown).toEqual({
      passed: 1,
      failed: 1,
      uncertain: 1,
    });
  });

  it('applies range filter', async () => {
    User.countDocuments.mockResolvedValue(10);
    Report.find.mockResolvedValue([]);

    await request(app).get('/api/admin/stats?range=7');

    expect(Report.find).toHaveBeenCalledWith(
      expect.objectContaining({
        createdAt: expect.any(Object),
      })
    );
  });

  it('applies team filter when team exists', async () => {
    User.countDocuments.mockResolvedValue(10);
    Team.findById.mockResolvedValue({
      members: [{ toString: () => 'u1' }, { toString: () => 'u2' }],
    });
    Report.find.mockResolvedValue([]);

    await request(app).get('/api/admin/stats?team=team-1');

    expect(Report.find).toHaveBeenCalledWith(
      expect.objectContaining({
        analyzedBy: { $in: ['u1', 'u2'] },
      })
    );
  });

  it('applies user filter', async () => {
    User.countDocuments.mockResolvedValue(10);
    Report.find.mockResolvedValue([]);

    await request(app).get('/api/admin/stats?user=user-1');

    expect(Report.find).toHaveBeenCalledWith(
      expect.objectContaining({
        analyzedBy: 'user-1',
      })
    );
  });

  it('applies result filter', async () => {
    User.countDocuments.mockResolvedValue(10);
    Report.find.mockResolvedValue([]);

    await request(app).get('/api/admin/stats?result=good');

    expect(Report.find).toHaveBeenCalledWith(
      expect.objectContaining({
        'qualityAssessment.label': 'good',
      })
    );
  });

  it('returns 500 when query fails', async () => {
    User.countDocuments.mockRejectedValue(new Error('db exploded'));

    const res = await request(app).get('/api/admin/stats');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('db exploded');
  });
});
