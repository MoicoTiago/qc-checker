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
  find: jest.fn(),
  findById: jest.fn(),
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
const adminRoutes = require('../../routes/adminRoutes');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

describe('GET /api/admin/users', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the user list', async () => {
    const users = [
        {
        _id: 'u1',
        name: 'Jane Doe',
        email: 'jane@example.com',
        role: 'user',
        active: true,
        },
        {
        _id: 'u2',
        name: 'John Smith',
        email: 'john@example.com',
        role: 'admin',
        active: false,
        },
    ];

    const query = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(users),
    };

    User.find.mockReturnValue(query);

    const res = await request(app).get('/api/admin/users');

    expect(res.status).toBe(200);
    expect(User.find).toHaveBeenCalled();
    expect(res.body).toEqual(users);
    });
  it('returns 500 when user list query fails', async () => {
    User.find.mockImplementation(() => {
      throw new Error('users exploded');
    });

    const res = await request(app).get('/api/admin/users');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('users exploded');
  });
});

describe('PATCH /api/admin/users/:id/status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates user status successfully', async () => {
    const userDoc = {
        _id: 'u1',
        name: 'Jane Doe',
        email: 'jane@example.com',
        active: true,
        isActive: true,
        save: jest.fn().mockResolvedValue(true),
    };

    User.findById.mockResolvedValue(userDoc);

    const res = await request(app)
        .patch('/api/admin/users/u1/status')
        .send({ active: false });

    expect(res.status).toBe(200);
    expect(User.findById).toHaveBeenCalledWith('u1');
    expect(userDoc.save).toHaveBeenCalled();
    expect(res.body).toBeTruthy();
    });

  it('returns 404 when user to update is missing', async () => {
    User.findById.mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/admin/users/missing/status')
      .send({ active: false });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('User not found');
  });

  it('returns 500 when status update fails', async () => {
    User.findById.mockRejectedValue(new Error('status exploded'));

    const res = await request(app)
      .patch('/api/admin/users/u1/status')
      .send({ active: false });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('status exploded');
  });
});

describe('DELETE /api/admin/users/:id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes a user successfully', async () => {
    const userDoc = {
      _id: 'u1',
      name: 'Jane Doe',
      email: 'jane@example.com',
      deleteOne: jest.fn().mockResolvedValue(true),
    };

    User.findById.mockResolvedValue(userDoc);

    const res = await request(app).delete('/api/admin/users/u1');

    expect(res.status).toBe(200);
    expect(User.findById).toHaveBeenCalledWith('u1');
    expect(userDoc.deleteOne).toHaveBeenCalled();
    expect(res.body.message).toMatch(/deleted/i);
  });

  it('returns 404 when user to delete is missing', async () => {
    User.findById.mockResolvedValue(null);

    const res = await request(app).delete('/api/admin/users/missing');

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('User not found');
  });

  it('returns 500 when delete fails', async () => {
    User.findById.mockRejectedValue(new Error('delete exploded'));

    const res = await request(app).delete('/api/admin/users/u1');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('delete exploded');
  });
});