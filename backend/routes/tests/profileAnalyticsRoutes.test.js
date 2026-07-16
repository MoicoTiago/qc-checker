const mockGetProfileAnalytics = jest.fn();
const mockProtect = jest.fn((req, res, next) => next());

jest.mock('../../controllers/reportController', () => ({
  uploadReport: jest.fn(),
  analyzeReport: jest.fn(),
  getReports: jest.fn(),
  getReportById: jest.fn(),
  deleteReport: jest.fn(),
  getReportStats: jest.fn(),
  getProfileAnalytics: mockGetProfileAnalytics,
  getReportText: jest.fn(),
  downloadReport: jest.fn(),
  downloadAnnotatedPdf: jest.fn(),
}));

jest.mock('../../middleware/authMiddleware', () => ({
  protect: mockProtect,
}));

jest.mock('../../middleware/uploadMiddleware', () => ({
  upload: {
    single: jest.fn(() => (req, res, next) => next()),
  },
  handleUploadError: jest.fn((req, res, next) => next()),
}));

const reportRouter = require('../reportRoutes');

const createResponse = () => {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };

  return res;
};

const getRouteHandler = (path, method) => {
  const layer = reportRouter.stack.find(
    (entry) => entry.route && entry.route.path === path && entry.route.methods[method]
  );

  if (!layer) {
    throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  }

  return layer.route.stack[layer.route.stack.length - 1].handle;
};

describe('Profile analytics report route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET /api/reports/profile-analytics is wired to the profile analytics controller', async () => {
    mockGetProfileAnalytics.mockImplementation((req, res) => {
      res.json({ scope: req.query.scope, summary: { totalReports: 0 } });
    });

    const handler = getRouteHandler('/profile-analytics', 'get');
    const req = {
      user: { _id: 'user-1' },
      query: { scope: 'month' },
    };
    const res = createResponse();
    const next = jest.fn();

    await handler(req, res, next);

    expect(mockGetProfileAnalytics).toHaveBeenCalledWith(req, res, next);
    expect(res.json).toHaveBeenCalledWith({
      scope: 'month',
      summary: { totalReports: 0 },
    });
  });
});
