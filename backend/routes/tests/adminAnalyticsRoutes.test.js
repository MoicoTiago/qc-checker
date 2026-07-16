const request = require('supertest');
const express = require('express');

jest.mock('../../middleware/authMiddleware', () => ({
  protect: (req, res, next) => {
    req.user = { _id: 'admin-1', email: 'admin@example.com', role: 'admin' };
    next();
  },
  authorize: () => (req, res, next) => next(),
}));

jest.mock('../../services/analyticsService', () => ({
  buildAnalyticsPayload: jest.fn(),
  resolveAnalyticsScope: jest.fn(),
}));

jest.mock('../../models/User', () => ({}));
jest.mock('../../models/Report', () => ({}));
jest.mock('../../models/Team', () => ({}));
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

const {
  buildAnalyticsPayload,
  resolveAnalyticsScope,
} = require('../../services/analyticsService');

const adminRoutes = require('../../routes/adminRoutes');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

describe('GET /api/admin/analytics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns company analytics when no comparison is requested', async () => {
    resolveAnalyticsScope.mockResolvedValue({
      filter: {},
      scopeLabel: 'Company-wide analytics',
      scopeDetails: null,
    });

    buildAnalyticsPayload.mockResolvedValue({
      scopeLabel: 'Company-wide analytics',
      scopeDetails: null,
      summary: { totalReports: 12 },
      errorBreakdown: [],
      qualityBreakdown: { good: 8, bad: 3, uncertain: 1 },
      trendData: [],
      topErrors: [],
      recentReports: [],
    });

    const res = await request(app).get('/api/admin/analytics?level=company&range=30');

    expect(res.status).toBe(200);
    expect(res.body.level).toBe('company');
    expect(res.body.range).toBe('30');
    expect(res.body.scopeLabel).toBe('Company-wide analytics');
  });

  it('returns 400 when comparison uses the same team id', async () => {
    const res = await request(app).get(
      '/api/admin/analytics?level=team&teamId=team-1&compareTeamId=team-1&range=30'
    );

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Comparison requires two different selections');
  });

  it('returns 404 when primary team scope is missing', async () => {
    resolveAnalyticsScope.mockResolvedValue(null);

    const res = await request(app).get(
      '/api/admin/analytics?level=team&teamId=missing-team&range=30'
    );

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Team not found');
  });

  it('returns 404 when primary user scope is missing', async () => {
    resolveAnalyticsScope.mockResolvedValue(null);

    const res = await request(app).get(
      '/api/admin/analytics?level=user&userId=missing-user&range=30'
    );

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('User not found');
  });

  it('returns 404 when secondary comparison scope is missing', async () => {
    resolveAnalyticsScope
      .mockResolvedValueOnce({
        filter: { analyzedBy: { $in: ['u1'] } },
        scopeLabel: 'Team Alpha',
        scopeDetails: { teamName: 'Team Alpha', memberCount: 4 },
      })
      .mockResolvedValueOnce(null);

    const res = await request(app).get(
      '/api/admin/analytics?level=team&teamId=team-1&compareTeamId=missing-team&range=30'
    );

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Team not found');
  });

  it('returns comparison analytics for team comparison', async () => {
    resolveAnalyticsScope
      .mockResolvedValueOnce({
        filter: { analyzedBy: { $in: ['u1'] } },
        scopeLabel: 'Team Alpha',
        scopeDetails: { teamName: 'Team Alpha', memberCount: 4 },
      })
      .mockResolvedValueOnce({
        filter: { analyzedBy: { $in: ['u2'] } },
        scopeLabel: 'Team Beta',
        scopeDetails: { teamName: 'Team Beta', memberCount: 3 },
      });

    buildAnalyticsPayload
      .mockResolvedValueOnce({
        scopeLabel: 'Team Alpha',
        scopeDetails: { teamName: 'Team Alpha', memberCount: 4 },
        summary: { totalReports: 8 },
        topErrors: [],
        recentReports: [],
      })
      .mockResolvedValueOnce({
        scopeLabel: 'Team Beta',
        scopeDetails: { teamName: 'Team Beta', memberCount: 3 },
        summary: { totalReports: 5 },
        topErrors: [],
        recentReports: [],
      });

    const res = await request(app).get(
      '/api/admin/analytics?level=team&teamId=team-1&compareTeamId=team-2&range=30'
    );

    expect(res.status).toBe(200);
    expect(res.body.comparisonMode).toBe(true);
    expect(res.body.comparisonType).toBe('team');
    expect(res.body.primaryScope.scopeLabel).toBe('Team Alpha');
    expect(res.body.secondaryScope.scopeLabel).toBe('Team Beta');
  });

  it('returns comparison analytics for user comparison', async () => {
    resolveAnalyticsScope
      .mockResolvedValueOnce({
        filter: { analyzedBy: 'user-1' },
        scopeLabel: 'Jane Doe',
        scopeDetails: { userEmail: 'jane@example.com' },
      })
      .mockResolvedValueOnce({
        filter: { analyzedBy: 'user-2' },
        scopeLabel: 'John Doe',
        scopeDetails: { userEmail: 'john@example.com' },
      });

    buildAnalyticsPayload
      .mockResolvedValueOnce({
        scopeLabel: 'Jane Doe',
        scopeDetails: { userEmail: 'jane@example.com' },
        summary: { totalReports: 6 },
        topErrors: [],
        recentReports: [],
      })
      .mockResolvedValueOnce({
        scopeLabel: 'John Doe',
        scopeDetails: { userEmail: 'john@example.com' },
        summary: { totalReports: 7 },
        topErrors: [],
        recentReports: [],
      });

    const res = await request(app).get(
      '/api/admin/analytics?level=user&userId=user-1&compareUserId=user-2&range=90'
    );

    expect(res.status).toBe(200);
    expect(res.body.comparisonMode).toBe(true);
    expect(res.body.comparisonType).toBe('user');
    expect(res.body.primaryScope.scopeLabel).toBe('Jane Doe');
    expect(res.body.secondaryScope.scopeLabel).toBe('John Doe');
  });

  it('returns 500 when buildAnalyticsPayload throws', async () => {
    resolveAnalyticsScope.mockResolvedValue({
      filter: {},
      scopeLabel: 'Company-wide analytics',
      scopeDetails: null,
    });

    buildAnalyticsPayload.mockRejectedValue(new Error('analytics exploded'));

    const res = await request(app).get('/api/admin/analytics?level=company&range=30');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('analytics exploded');
  });
});