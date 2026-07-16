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
  findById: jest.fn(),
  countDocuments: jest.fn(),
}));

jest.mock('../../models/Team', () => ({
  findById: jest.fn(),
}));

jest.mock('../../models/Report', () => ({
  find: jest.fn(),
  deleteMany: jest.fn(),
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
const adminRoutes = require('../../routes/adminRoutes');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

const makeReportsQueryMock = (result) => {
  const chain = {
    populate: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
    select: jest.fn().mockReturnThis(),
  };
  return chain;
};

describe('GET /api/admin/reports', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns populated reports sorted by analyzedAt descending', async () => {
    const reports = [
      {
        _id: 'r1',
        filename: 'report-1.pdf',
        analyzedBy: { name: 'Jane', email: 'jane@example.com' },
        analyzedAt: '2026-04-01T12:00:00.000Z',
      },
      {
        _id: 'r2',
        filename: 'report-2.pdf',
        analyzedBy: { name: 'John', email: 'john@example.com' },
        analyzedAt: '2026-03-30T12:00:00.000Z',
      },
    ];

    const query = makeReportsQueryMock(reports);
    Report.find.mockReturnValue(query);

    const res = await request(app).get('/api/admin/reports');

    expect(res.status).toBe(200);
    expect(Report.find).toHaveBeenCalledWith();
    expect(query.populate).toHaveBeenCalledWith('analyzedBy', 'name email');
    expect(query.sort).toHaveBeenCalledWith({ analyzedAt: -1 });
    expect(query.lean).toHaveBeenCalled();
    expect(res.body).toEqual(reports);
  });

  it('returns 500 when reports query fails', async () => {
    Report.find.mockImplementation(() => {
      throw new Error('reports exploded');
    });

    const res = await request(app).get('/api/admin/reports');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('reports exploded');
  });
});

describe('GET /api/admin/users/:id/profile-analytics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns profile analytics for all scope', async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: 'user-1',
        name: 'Jane Doe',
        email: 'jane@example.com',
      }),
    });

    const reports = [
      {
        _id: 'r1',
        filename: 'alpha.pdf',
        status: 'analyzed',
        errorCount: 3,
        timeSaved: 8,
        createdAt: '2026-04-20T10:00:00.000Z',
        errorSummary: {
          placeholder: 1,
          consistency: 1,
          compliance: 1,
          formatting: 0,
          missing_data: 0,
        },
        qualityAssessment: {
          label: 'good',
          goodScore: 0.92,
        },
        errors: [{ message: 'Missing signature' }, { message: 'Missing signature' }],
      },
      {
        _id: 'r2',
        filename: 'beta.pdf',
        status: 'failed',
        errorCount: 2,
        timeSaved: 0,
        createdAt: '2026-04-19T10:00:00.000Z',
        errorSummary: {
          placeholder: 0,
          consistency: 1,
          compliance: 0,
          formatting: 1,
          missing_data: 0,
        },
        qualityAssessment: {
          label: 'bad',
          goodScore: 0.35,
        },
        errors: [{ message: 'Wrong format' }],
      },
      {
        _id: 'r3',
        filename: 'gamma.pdf',
        status: 'processing',
        errorCount: 0,
        timeSaved: 1,
        createdAt: '2026-04-18T10:00:00.000Z',
        errorSummary: {
          placeholder: 0,
          consistency: 0,
          compliance: 0,
          formatting: 0,
          missing_data: 1,
        },
        qualityAssessment: {
          label: 'uncertain',
          goodScore: 0.61,
        },
        errors: [{ message: 'Missing signature' }],
      },
    ];

    const reportQuery = makeReportsQueryMock(reports);
    Report.find.mockReturnValue(reportQuery);

    const res = await request(app).get('/api/admin/users/user-1/profile-analytics');

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({
      name: 'Jane Doe',
      email: 'jane@example.com',
    });
    expect(res.body.scope).toBe('all');
    expect(res.body.summary.totalReports).toBe(3);
    expect(res.body.summary.analyzedReports).toBe(1);
    expect(res.body.summary.failedReports).toBe(1);
    expect(res.body.summary.pendingReports).toBe(1);
    expect(res.body.summary.totalErrors).toBe(5);
    expect(res.body.qualityBreakdown).toEqual({
      good: 1,
      bad: 1,
      uncertain: 1,
    });
    expect(res.body.mostCommonErrorTypes.length).toBeGreaterThan(0);
    expect(res.body.checklistFailureBreakdown.length).toBeGreaterThan(0);
    expect(res.body.recentReports.length).toBeGreaterThan(0);
  });

  it('uses week scope date filter', async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: 'user-1',
        name: 'Jane Doe',
        email: 'jane@example.com',
      }),
    });

    const reportQuery = makeReportsQueryMock([]);
    Report.find.mockReturnValue(reportQuery);

    const res = await request(app).get('/api/admin/users/user-1/profile-analytics?scope=week');

    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('week');
    expect(Report.find).toHaveBeenCalledWith(
      expect.objectContaining({
        analyzedBy: 'user-1',
        createdAt: expect.any(Object),
      })
    );
  });

  it('uses month scope date filter', async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: 'user-1',
        name: 'Jane Doe',
        email: 'jane@example.com',
      }),
    });

    const reportQuery = makeReportsQueryMock([]);
    Report.find.mockReturnValue(reportQuery);

    const res = await request(app).get('/api/admin/users/user-1/profile-analytics?scope=month');

    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('month');
    expect(Report.find).toHaveBeenCalledWith(
      expect.objectContaining({
        analyzedBy: 'user-1',
        createdAt: expect.any(Object),
      })
    );
  });

  it('falls back to all when scope is invalid', async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: 'user-1',
        name: 'Jane Doe',
        email: 'jane@example.com',
      }),
    });

    const reportQuery = makeReportsQueryMock([]);
    Report.find.mockReturnValue(reportQuery);

    const res = await request(app).get('/api/admin/users/user-1/profile-analytics?scope=nope');

    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('all');
    expect(Report.find).toHaveBeenCalledWith({ analyzedBy: 'user-1' });
  });

  it('returns 404 when target user is missing', async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });

    const res = await request(app).get('/api/admin/users/missing-user/profile-analytics');

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('User not found');
  });

  it('returns 500 when profile analytics query fails', async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: 'user-1',
        name: 'Jane Doe',
        email: 'jane@example.com',
      }),
    });

    Report.find.mockImplementation(() => {
      throw new Error('profile exploded');
    });

    const res = await request(app).get('/api/admin/users/user-1/profile-analytics');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('profile exploded');
  });
});