jest.mock('../../models/User', () => ({
  findById: jest.fn(),
  findByIdAndDelete: jest.fn(),
  countDocuments: jest.fn(),
  find: jest.fn(),
}));

jest.mock('../../models/Report', () => ({
  deleteMany: jest.fn(),
  find: jest.fn(),
}));

jest.mock('../../models/Team', () => ({
  findById: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
}));

jest.mock('../../models/TrainingExample', () => ({
  getTrainingStats: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
}));

jest.mock('../../models/AuditLog', () => ({
  find: jest.fn(),
  countDocuments: jest.fn(),
}));

jest.mock('../../middleware/authMiddleware', () => ({
  protect: (req, res, next) => next(),
  authorize: () => (req, res, next) => next(),
}));

jest.mock('../../middleware/uploadMiddleware', () => ({
  trainingUpload: {
    single: jest.fn(() => (req, res, next) => next()),
  },
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
  sendNewUserWelcomeEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  sendTeamAssignmentEmail: jest.fn(),
  sendTeamLeadAssignmentEmail: jest.fn(),
  sendTeamRemovalEmail: jest.fn(),
}));

jest.mock('../../services/auditService', () => ({
  log: jest.fn(),
}));

const User = require('../../models/User');
const Report = require('../../models/Report');
const { deleteUser } = require('../../controllers/userController');
const adminRouter = require('../adminRoutes');

const createResponse = () => {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };

  return res;
};

const createObjectId = (value) => ({
  toString: () => value,
});

const getRouteHandler = (router, path, method) => {
  const layer = router.stack.find(
    (entry) => entry.route && entry.route.path === path && entry.route.methods[method]
  );

  if (!layer) {
    throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  }

  return layer.route.stack[layer.route.stack.length - 1].handle;
};

describe('Manage tab delete route behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('/api/users/:id deletes only the user, while /api/admin/users/:id also deletes reports', async () => {
    User.findById.mockResolvedValueOnce({
      _id: createObjectId('user-1'),
      role: 'user',
    });
    User.findByIdAndDelete.mockResolvedValueOnce({});

    const manageRouteRes = createResponse();

    await deleteUser(
      {
        params: { id: 'user-1' },
        user: { _id: createObjectId('admin-1'), role: 'admin' },
      },
      manageRouteRes
    );

    expect(User.findByIdAndDelete).toHaveBeenCalledWith('user-1');
    expect(Report.deleteMany).not.toHaveBeenCalled();
    expect(manageRouteRes.json).toHaveBeenCalledWith({ message: 'User removed successfully' });

    const adminDeleteOne = jest.fn().mockResolvedValue();
    User.findById.mockResolvedValueOnce({
      _id: createObjectId('user-1'),
      role: 'user',
      deleteOne: adminDeleteOne,
    });
    Report.deleteMany.mockResolvedValueOnce({ deletedCount: 3 });

    const adminRouteRes = createResponse();
    const adminDeleteHandler = getRouteHandler(adminRouter, '/users/:id', 'delete');

    await adminDeleteHandler({ params: { id: 'user-1' } }, adminRouteRes);

    expect(Report.deleteMany).toHaveBeenCalledWith({ analyzedBy: 'user-1' });
    expect(adminDeleteOne).toHaveBeenCalled();
    expect(adminRouteRes.json).toHaveBeenCalledWith({
      message: 'User and their reports deleted successfully',
    });
  });
});
