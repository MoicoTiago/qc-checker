jest.mock('../../models/Report', () => ({
  find: jest.fn(),
}));

const Report = require('../../models/Report');
const {
  buildAnalyticsPayload,
  getAnalyticsScopeConfig,
  resolveAnalyticsScope,
} = require('../analyticsService');

describe('analyticsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getAnalyticsScopeConfig returns expected preset range metadata', () => {
    const allConfig = getAnalyticsScopeConfig('all');
    const monthConfig = getAnalyticsScopeConfig('30');

    expect(allConfig.range).toBe('all');
    expect(allConfig.startDate).toBeNull();
    expect(monthConfig.range).toBe('30');
    expect(monthConfig.startDate).toBeInstanceOf(Date);
    expect(monthConfig.bucketCount).toBe(30);
  });

  test('buildAnalyticsPayload applies postFetchFilter and summarises reports', async () => {
    const reports = [
      {
        _id: 'r-1',
        filename: 'report-1.pdf',
        status: 'analyzed',
        errorCount: 3,
        errorSummary: { placeholder: 1, consistency: 2, compliance: 0, formatting: 0, missing_data: 0 },
        timeSaved: 2,
        qualityAssessment: { label: 'good', goodScore: 0.92 },
        createdAt: '2026-04-10T00:00:00.000Z',
        analyzedBy: { _id: 'u-1', name: 'Alex', email: 'alex@example.com' },
        errors: [{ message: 'Missing signature' }],
      },
      {
        _id: 'r-2',
        filename: 'report-2.pdf',
        status: 'pending',
        errorCount: 1,
        errorSummary: { placeholder: 0, consistency: 0, compliance: 1, formatting: 0, missing_data: 0 },
        timeSaved: 0,
        qualityAssessment: {},
        createdAt: '2026-04-09T00:00:00.000Z',
        analyzedBy: { _id: 'u-2', name: 'Blake', email: 'blake@example.com' },
        errors: [],
      },
    ];

    const lean = jest.fn().mockResolvedValue(reports);
    const sort = jest.fn(() => ({ lean }));
    const populate = jest.fn(() => ({ sort }));
    const select = jest.fn(() => ({ populate }));
    Report.find.mockReturnValue({ select });

    const payload = await buildAnalyticsPayload({
      filter: { analyzedBy: { $in: ['u-1', 'u-2'] } },
      scopeLabel: 'Team: QA',
      scopeDetails: { teamName: 'QA' },
      range: 'all',
      postFetchFilter: (report) => report.status === 'analyzed',
    });

    expect(Report.find).toHaveBeenCalledWith({ analyzedBy: { $in: ['u-1', 'u-2'] } });
    expect(payload.scopeLabel).toBe('Team: QA');
    expect(payload.summary.totalReports).toBe(1);
    expect(payload.summary.analyzedReports).toBe(1);
    expect(payload.summary.pendingReports).toBe(0);
    expect(payload.summary.totalErrors).toBe(3);
    expect(payload.summary.passRate).toBe(100);
    expect(payload.qualityBreakdown.good).toBe(1);
    expect(payload.errorBreakdown.find((item) => item.name === 'Consistency')?.value).toBe(2);
    expect(payload.topErrors[0]).toEqual({ message: 'Missing signature', count: 1 });
    expect(payload.recentReports).toHaveLength(1);
    expect(payload.userLeaderboard[0]).toMatchObject({
      odId: 'u-1',
      userName: 'Alex',
      reportCount: 1,
      passRate: 100,
    });
  });

  test('buildAnalyticsPayload preserves a stricter existing start date and handles failed and bad reports', async () => {
    const reports = [
      {
        _id: 'r-3',
        filename: 'report-3.pdf',
        status: 'failed',
        errorCount: 4,
        errorSummary: { placeholder: 0, consistency: 0, compliance: 1, formatting: 1, missing_data: 2 },
        timeSaved: 1.6,
        qualityAssessment: { label: 'bad', goodScore: 0.15 },
        createdAt: '2026-04-11T00:00:00.000Z',
        analyzedBy: 'u-3',
        errors: [{}, { message: 'Wrong date' }],
      },
    ];

    const lean = jest.fn().mockResolvedValue(reports);
    const sort = jest.fn(() => ({ lean }));
    const populate = jest.fn(() => ({ sort }));
    const select = jest.fn(() => ({ populate }));
    Report.find.mockReturnValue({ select });

    const payload = await buildAnalyticsPayload({
      filter: {
        analyzedBy: 'u-3',
        createdAt: { $gte: '2099-01-01T00:00:00.000Z' },
      },
      scopeLabel: 'User: Casey',
      scopeDetails: { userName: 'Casey' },
      range: '7',
    });

    expect(Report.find).toHaveBeenCalledWith({
      analyzedBy: 'u-3',
      createdAt: { $gte: new Date('2099-01-01T00:00:00.000Z') },
    });
    expect(payload.summary.totalReports).toBe(1);
    expect(payload.summary.failedReports).toBe(1);
    expect(payload.summary.analyzedReports).toBe(0);
    expect(payload.summary.passRate).toBe(0);
    expect(payload.qualityBreakdown.bad).toBe(1);
    expect(payload.mostCommonErrorTypes.find((item) => item.type === 'missing_data')?.reportsAffected).toBe(1);
    expect(payload.topErrors).toEqual([{ message: 'Wrong date', count: 1 }]);
    expect(payload.recentReports[0]).toMatchObject({
      analyzedBy: 'Unknown',
      qualityLabel: 'bad',
    });
  });

  test('resolveAnalyticsScope returns team, user, and company scopes', async () => {
    const teamLean = jest.fn().mockResolvedValue({
      _id: 'team-1',
      name: 'QA Team',
      members: [{ _id: 'u-1' }, { _id: 'u-2' }],
    });
    const teamPopulate = jest.fn(() => ({ lean: teamLean }));
    const teamModel = { findById: jest.fn(() => ({ populate: teamPopulate })) };

    const userSelectLean = jest.fn().mockResolvedValue({
      _id: 'u-3',
      name: 'Jamie',
      email: 'jamie@example.com',
      role: 'user',
    });
    const userSelect = jest.fn(() => ({ lean: userSelectLean }));
    const userModel = { findById: jest.fn(() => ({ select: userSelect })) };

    const teamScope = await resolveAnalyticsScope({
      level: 'team',
      entityId: 'team-1',
      teamModel,
      userModel,
    });
    const userScope = await resolveAnalyticsScope({
      level: 'user',
      entityId: 'u-3',
      teamModel,
      userModel,
    });
    const companyScope = await resolveAnalyticsScope({
      level: 'company',
      entityId: null,
      teamModel,
      userModel,
    });

    expect(teamScope).toEqual({
      filter: { analyzedBy: { $in: ['u-1', 'u-2'] } },
      scopeLabel: 'Team: QA Team',
      scopeDetails: {
        teamId: 'team-1',
        teamName: 'QA Team',
        memberCount: 2,
      },
    });
    expect(userScope).toEqual({
      filter: { analyzedBy: 'u-3' },
      scopeLabel: 'User: Jamie',
      scopeDetails: {
        userId: 'u-3',
        userName: 'Jamie',
        userEmail: 'jamie@example.com',
        userRole: 'user',
      },
    });
    expect(companyScope).toEqual({
      filter: {},
      scopeLabel: 'Company-wide',
      scopeDetails: null,
    });
  });

  test('resolveAnalyticsScope returns null when a team or user is not found', async () => {
    const teamLean = jest.fn().mockResolvedValue(null);
    const teamPopulate = jest.fn(() => ({ lean: teamLean }));
    const teamModel = { findById: jest.fn(() => ({ populate: teamPopulate })) };

    const userSelectLean = jest.fn().mockResolvedValue(null);
    const userSelect = jest.fn(() => ({ lean: userSelectLean }));
    const userModel = { findById: jest.fn(() => ({ select: userSelect })) };

    await expect(resolveAnalyticsScope({
      level: 'team',
      entityId: 'missing-team',
      teamModel,
      userModel,
    })).resolves.toBeNull();

    await expect(resolveAnalyticsScope({
      level: 'user',
      entityId: 'missing-user',
      teamModel,
      userModel,
    })).resolves.toBeNull();
  });
});
