jest.mock('../../models/Report', () => ({
  find: jest.fn(),
}));

jest.mock('../../models/User', () => ({}));
jest.mock('../../models/Team', () => ({}));

jest.mock('../../services/pdfService', () => ({
  processDocument: jest.fn(),
}));

jest.mock('../../services/errorDetection', () => ({
  analyzeDocument: jest.fn(),
}));

jest.mock('../../services/trainingService', () => ({
  predictQualityFromTraining: jest.fn(),
}));

jest.mock('../../services/reportPdfService', () => ({
  generateReportPdf: jest.fn(),
}));

jest.mock('../../services/annotatedPdfService', () => ({
  generateAnnotatedPdf: jest.fn(),
}));

jest.mock('../../services/auditService', () => ({
  log: jest.fn(),
}));

const Report = require('../../models/Report');
const { getProfileAnalytics } = require('../reportController');

const createResponse = () => {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };

  return res;
};

const createFindChain = (reports) => {
  const lean = jest.fn().mockResolvedValue(reports);
  const sort = jest.fn(() => ({ lean }));
  const select = jest.fn(() => ({ sort }));

  Report.find.mockReturnValue({ select });

  return { select, sort, lean };
};

const reports = [
  {
    _id: 'report-1',
    filename: 'current-good-report.pdf',
    status: 'analyzed',
    errorCount: 2,
    timeSaved: 4,
    estimatedManualReviewMinutes: 10,
    estimatedAiReviewMinutes: 6,
    estimatedTimeSavedMinutes: 4,
    timeSavedPercent: 40,
    createdAt: '2026-04-18T10:00:00.000Z',
    qualityAssessment: { label: 'good', goodScore: 0.92 },
    errorSummary: {
      placeholder: 2,
      consistency: 0,
      compliance: 0,
      formatting: 0,
      missing_data: 0,
    },
    errors: [
      { message: 'Replace placeholder project name' },
      { message: 'Replace placeholder project name' },
      { message: '' },
      null,
    ],
  },
  {
    _id: 'report-2',
    filename: 'current-bad-report.pdf',
    status: 'analyzed',
    errorCount: 3,
    timeSaved: 5,
    estimatedManualReviewMinutes: 14,
    estimatedAiReviewMinutes: 9,
    estimatedTimeSavedMinutes: 5,
    timeSavedPercent: 36,
    createdAt: '2026-04-17T10:00:00.000Z',
    qualityAssessment: { label: 'bad', goodScore: 0.31 },
    errorSummary: {
      placeholder: 0,
      consistency: 1,
      compliance: 1,
      formatting: 1,
      missing_data: 0,
    },
    errors: [{ message: 'Missing inspector signature' }],
  },
  {
    _id: 'report-3',
    filename: 'processing-report.pdf',
    status: 'processing',
    errorCount: 0,
    timeSaved: 1,
    createdAt: '2026-04-16T10:00:00.000Z',
    qualityAssessment: { label: 'uncertain', goodScore: 0.5 },
    errorSummary: {},
    errors: [],
  },
  {
    _id: 'report-4',
    filename: 'failed-report.pdf',
    status: 'failed',
    errorCount: 0,
    timeSaved: 0,
    createdAt: '2026-01-12T10:00:00.000Z',
    errorSummary: null,
  },
];

describe('Profile analytics controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-04-20T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('returns aggregated all-time profile analytics for the authenticated user', async () => {
    const { select, sort, lean } = createFindChain(reports);
    const req = {
      user: { _id: 'user-1' },
      query: { scope: 'all' },
    };
    const res = createResponse();

    await getProfileAnalytics(req, res);

    expect(Report.find).toHaveBeenCalledWith({ analyzedBy: 'user-1' });
    expect(select).toHaveBeenCalledWith(
      'filename status errorCount errorSummary timeSaved estimatedManualReviewMinutes estimatedAiReviewMinutes estimatedTimeSavedMinutes timeSavedPercent qualityAssessment createdAt errors metadata'
    );
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(lean).toHaveBeenCalled();

    const payload = res.json.mock.calls[0][0];
    expect(payload.scope).toBe('all');
    expect(payload.summary).toEqual({
      totalReports: 4,
      analyzedReports: 2,
      pendingReports: 1,
      failedReports: 1,
      totalErrors: 5,
      averageErrorsPerReport: 2.5,
      totalTimeSaved: 10,
      totalManualReviewMinutes: 24,
      totalAiReviewMinutes: 15,
      totalTimeSavedMinutes: 10,
      timeSavedPercent: 42,
    });
    expect(payload.errorBreakdown).toEqual({
      placeholder: 2,
      consistency: 1,
      compliance: 1,
      formatting: 1,
      missing_data: 0,
    });
    expect(payload.qualityBreakdown).toEqual({
      good: 1,
      bad: 1,
      uncertain: 1,
    });
    expect(payload.mostCommonErrorTypes[0]).toEqual({
      type: 'placeholder',
      count: 2,
      reportsAffected: 1,
    });
    expect(payload.checklistFailureBreakdown).toEqual([
      { message: 'Replace placeholder project name', count: 2 },
      { message: 'Missing inspector signature', count: 1 },
    ]);
    expect(payload.trends.map((bucket) => bucket.periodLabel)).toEqual([
      'Jan 2026',
      'Feb 2026',
      'Mar 2026',
      'Apr 2026',
    ]);
    expect(payload.passFailRateTrends[payload.passFailRateTrends.length - 1]).toEqual({
      periodLabel: 'Apr 2026',
      analyzedCount: 2,
      passedCount: 1,
      failedCount: 1,
      passRate: 50,
    });
    expect(payload.qualityScoreTrend).toEqual([
      {
        _id: 'report-2',
        filename: 'current-bad-report.pdf',
        createdAt: '2026-04-17T10:00:00.000Z',
        qualityLabel: 'bad',
        qualityScore: 31,
      },
      {
        _id: 'report-1',
        filename: 'current-good-report.pdf',
        createdAt: '2026-04-18T10:00:00.000Z',
        qualityLabel: 'good',
        qualityScore: 92,
      },
    ]);
    expect(payload.recentReports[0]).toEqual({
      _id: 'report-1',
      filename: 'current-good-report.pdf',
      createdAt: '2026-04-18T10:00:00.000Z',
      status: 'analyzed',
      errorCount: 2,
      timeSaved: 4,
      estimatedManualReviewMinutes: 10,
      estimatedAiReviewMinutes: 6,
      estimatedTimeSavedMinutes: 4,
      timeSavedPercent: 40,
      qualityLabel: 'good',
      errorSummary: {
        placeholder: 2,
        consistency: 0,
        compliance: 0,
        formatting: 0,
        missing_data: 0,
      },
    });
  });

  test('uses a seven-day date filter and daily buckets for week scope', async () => {
    createFindChain(reports.slice(0, 3));
    const req = {
      user: { _id: 'user-1' },
      query: { scope: 'week' },
    };
    const res = createResponse();

    await getProfileAnalytics(req, res);

    const query = Report.find.mock.calls[0][0];
    expect(query.analyzedBy).toBe('user-1');
    expect(query.createdAt.$gte).toEqual(new Date('2026-04-14T00:00:00.000Z'));

    const payload = res.json.mock.calls[0][0];
    expect(payload.scope).toBe('week');
    expect(payload.trends).toHaveLength(7);
    expect(payload.trends[0].periodLabel).toBe('14 Apr');
    expect(payload.trends[6].periodLabel).toBe('20 Apr');
  });

  test('uses a thirty-day date filter and defaults invalid scopes to all time', async () => {
    createFindChain([]);
    const monthReq = {
      user: { _id: 'user-1' },
      query: { scope: 'month' },
    };
    const monthRes = createResponse();

    await getProfileAnalytics(monthReq, monthRes);

    expect(Report.find.mock.calls[0][0].createdAt.$gte).toEqual(
      new Date('2026-03-22T00:00:00.000Z')
    );
    expect(monthRes.json.mock.calls[0][0].scope).toBe('month');
    expect(monthRes.json.mock.calls[0][0].trends).toHaveLength(30);

    createFindChain([]);
    const invalidReq = {
      user: { _id: 'user-1' },
      query: { scope: 'future' },
    };
    const invalidRes = createResponse();

    await getProfileAnalytics(invalidReq, invalidRes);

    expect(Report.find.mock.calls[1][0]).toEqual({ analyzedBy: 'user-1' });
    expect(invalidRes.json.mock.calls[0][0].scope).toBe('all');
    expect(invalidRes.json.mock.calls[0][0].summary.totalReports).toBe(0);
    expect(invalidRes.json.mock.calls[0][0].passFailRateTrends[0]).toEqual({
      periodLabel: 'Apr 2026',
      analyzedCount: 0,
      passedCount: 0,
      failedCount: 0,
      passRate: 0,
    });
  });

  test('returns a 500 response when profile analytics cannot be loaded', async () => {
    Report.find.mockImplementation(() => {
      throw new Error('profile analytics failed');
    });
    const req = {
      user: { _id: 'user-1' },
      query: { scope: 'all' },
    };
    const res = createResponse();

    await getProfileAnalytics(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'profile analytics failed' });
  });

  test('counts pending reports, skips trend buckets when createdAt is missing, and ignores unknown quality labels', async () => {
    const edgeReports = [
      {
        _id: 'pending-1',
        filename: 'waiting.pdf',
        status: 'pending',
        errorCount: 0,
        timeSaved: 0,
        createdAt: '2026-04-19T10:00:00.000Z',
        qualityAssessment: null,
        errorSummary: {},
        errors: [],
      },
      {
        _id: 'no-date',
        filename: 'nodate.pdf',
        status: 'analyzed',
        errorCount: 0,
        timeSaved: 0,
        createdAt: null,
        qualityAssessment: { label: 'manual-review', goodScore: 0.4 },
        errorSummary: {},
        errors: [],
      },
    ];
    createFindChain(edgeReports);
    const req = { user: { _id: 'user-1' }, query: { scope: 'week' } };
    const res = createResponse();

    await getProfileAnalytics(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.summary.pendingReports).toBe(1);
    expect(payload.summary.analyzedReports).toBe(1);
    expect(payload.summary.totalReports).toBe(2);
    expect(payload.qualityBreakdown).toEqual({
      good: 0,
      bad: 0,
      uncertain: 0,
    });
    expect(payload.qualityScoreTrend).toHaveLength(1);
    expect(payload.qualityScoreTrend[0].qualityLabel).toBe('manual-review');
  });
});
