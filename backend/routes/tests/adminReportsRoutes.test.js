jest.mock('fs', () => ({
  existsSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

jest.mock('../../models/User', () => ({
  countDocuments: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  find: jest.fn(),
  updateMany: jest.fn(),
}));

jest.mock('../../models/Report', () => ({
  find: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  deleteMany: jest.fn(),
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
  updateMany: jest.fn(),
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
  sendTeamAssignmentEmail: jest.fn(),
  sendTeamLeadAssignmentEmail: jest.fn(),
  sendTeamRemovalEmail: jest.fn(),
}));

jest.mock('../../services/auditService', () => ({
  log: jest.fn(),
}));

const Report = require('../../models/Report');
const User = require('../../models/User');
const Team = require('../../models/Team');
const AuditLog = require('../../models/AuditLog');
const TrainingExample = require('../../models/TrainingExample');
const fs = require('fs');
const audit = require('../../services/auditService');
const {
  sendTeamAssignmentEmail,
  sendTeamLeadAssignmentEmail,
  sendTeamRemovalEmail,
} = require('../../services/emailService');
const {
  buildTrainingExamplesFromLabeledReports,
  processTrainingExample,
} = require('../../services/trainingService');
const adminRouter = require('../adminRoutes');

const createResponse = () => {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };

  return res;
};

const getRouteHandler = (path, method) => {
  const layer = adminRouter.stack.find(
    (entry) => entry.route && entry.route.path === path && entry.route.methods[method]
  );

  if (!layer) {
    throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  }

  return layer.route.stack[layer.route.stack.length - 1].handle;
};

const objectId = (value) => ({ toString: () => value });

const mockTeamFindPopulateLean = (teams) => {
  const lean = jest.fn().mockResolvedValue(teams);
  const sort = jest.fn(() => ({ lean }));
  const populateTeamLead = jest.fn(() => ({ sort }));
  const populateMembers = jest.fn(() => ({ populate: populateTeamLead }));
  const populateCreatedBy = jest.fn(() => ({ populate: populateMembers }));
  Team.find.mockReturnValue({ populate: populateCreatedBy });
  return { populateCreatedBy, populateMembers, populateTeamLead, sort, lean };
};

const mockTeamFindByIdPopulateLean = (team) => {
  const lean = jest.fn().mockResolvedValue(team);
  const populateTeamLead = jest.fn(() => ({ lean }));
  const populateMembers = jest.fn(() => ({ populate: populateTeamLead }));
  const populateCreatedBy = jest.fn(() => ({ populate: populateMembers }));
  Team.findById.mockReturnValue({ populate: populateCreatedBy });
  return { populateCreatedBy, populateMembers, populateTeamLead, lean };
};

const mockUserFindSelectLean = (users) => {
  const lean = jest.fn().mockResolvedValue(users);
  const select = jest.fn(() => ({ lean }));
  User.find.mockReturnValue({ select });
  return { select, lean };
};

const mockUserFindByIdSelectLean = (user) => {
  const lean = jest.fn().mockResolvedValue(user);
  const select = jest.fn(() => ({ lean }));
  User.findById.mockReturnValue({ select });
  return { select, lean };
};

describe('Admin reports routes used by the Reports tab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET /api/admin/reports returns reports with analyzer details sorted by analysis date', async () => {
    const reports = [
      {
        _id: 'report-1',
        filename: 'fire-safety-report.pdf',
        analyzedBy: { name: 'Ada Lovelace', email: 'ada@example.com' },
      },
    ];
    const lean = jest.fn().mockResolvedValue(reports);
    const sort = jest.fn(() => ({ lean }));
    const populate = jest.fn(() => ({ sort }));
    Report.find.mockReturnValue({ populate });

    const handler = getRouteHandler('/reports', 'get');
    const res = createResponse();

    await handler({}, res);

    expect(Report.find).toHaveBeenCalledWith();
    expect(populate).toHaveBeenCalledWith('analyzedBy', 'name email');
    expect(sort).toHaveBeenCalledWith({ analyzedAt: -1 });
    expect(lean).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(reports);
  });

  test('GET /api/admin/reports returns 500 when report listing fails', async () => {
    Report.find.mockImplementation(() => {
      throw new Error('report listing failed');
    });

    const handler = getRouteHandler('/reports', 'get');
    const res = createResponse();

    await handler({}, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'report listing failed' });
  });

  test('PATCH /api/admin/reports/:id/training labels a report as a good training example', async () => {
    const updatedReport = {
      _id: 'report-1',
      addedToTraining: true,
      trainingLabel: 'good',
    };
    Report.findByIdAndUpdate.mockResolvedValue(updatedReport);

    const handler = getRouteHandler('/reports/:id/training', 'patch');
    const res = createResponse();

    await handler(
      {
        params: { id: 'report-1' },
        body: { trainingLabel: 'good' },
      },
      res
    );

    expect(Report.findByIdAndUpdate).toHaveBeenCalledWith(
      'report-1',
      { addedToTraining: true, trainingLabel: 'good' },
      { new: true }
    );
    expect(res.json).toHaveBeenCalledWith({
      message: 'Report added to training',
      report: updatedReport,
    });
  });

  test('PATCH /api/admin/reports/:id/training rejects invalid labels and missing reports', async () => {
    const handler = getRouteHandler('/reports/:id/training', 'patch');
    const invalidRes = createResponse();

    await handler(
      {
        params: { id: 'report-1' },
        body: { trainingLabel: 'template' },
      },
      invalidRes
    );

    expect(invalidRes.status).toHaveBeenCalledWith(400);
    expect(invalidRes.json).toHaveBeenCalledWith({
      message: 'trainingLabel must be "good" or "bad"',
    });
    expect(Report.findByIdAndUpdate).not.toHaveBeenCalled();

    Report.findByIdAndUpdate.mockResolvedValue(null);
    const missingRes = createResponse();

    await handler(
      {
        params: { id: 'missing-report' },
        body: { trainingLabel: 'bad' },
      },
      missingRes
    );

    expect(Report.findByIdAndUpdate).toHaveBeenCalledWith(
      'missing-report',
      { addedToTraining: true, trainingLabel: 'bad' },
      { new: true }
    );
    expect(missingRes.status).toHaveBeenCalledWith(404);
    expect(missingRes.json).toHaveBeenCalledWith({ message: 'Report not found' });
  });

  test('PATCH /api/admin/reports/:id/training returns 500 when the update fails', async () => {
    Report.findByIdAndUpdate.mockRejectedValue(new Error('training update failed'));

    const handler = getRouteHandler('/reports/:id/training', 'patch');
    const res = createResponse();

    await handler(
      {
        params: { id: 'report-1' },
        body: { trainingLabel: 'bad' },
      },
      res
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'training update failed' });
  });
});

describe('Admin training routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(true);
    audit.log.mockResolvedValue();
    processTrainingExample.mockResolvedValue();
  });

  test('POST /api/admin/training/sync syncs labeled reports and returns stats', async () => {
    buildTrainingExamplesFromLabeledReports.mockResolvedValue({
      created: 2,
      skipped: 1,
    });
    TrainingExample.getTrainingStats.mockResolvedValue({
      total: 3,
      good: 2,
      bad: 1,
    });
    const handler = getRouteHandler('/training/sync', 'post');
    const res = createResponse();

    await handler({ user: { _id: 'admin-1' } }, res);

    expect(buildTrainingExamplesFromLabeledReports).toHaveBeenCalled();
    expect(TrainingExample.getTrainingStats).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      message: 'Training examples synced from labeled reports',
      result: { created: 2, skipped: 1 },
      stats: { total: 3, good: 2, bad: 1 },
    });
  });

  test('POST /api/admin/training/sync returns 500 when syncing fails', async () => {
    buildTrainingExamplesFromLabeledReports.mockRejectedValue(new Error('sync failed'));
    const handler = getRouteHandler('/training/sync', 'post');
    const res = createResponse();

    await handler({ user: { _id: 'admin-1' } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'sync failed' });
  });

  test('GET /api/admin/training/stats returns training stats', async () => {
    const stats = { total: 5, good: 3, bad: 2, template: 0 };
    TrainingExample.getTrainingStats.mockResolvedValue(stats);
    const handler = getRouteHandler('/training/stats', 'get');
    const res = createResponse();

    await handler({}, res);

    expect(res.json).toHaveBeenCalledWith(stats);
  });

  test('GET /api/admin/training/stats returns 500 when stats lookup fails', async () => {
    TrainingExample.getTrainingStats.mockRejectedValue(new Error('stats failed'));
    const handler = getRouteHandler('/training/stats', 'get');
    const res = createResponse();

    await handler({}, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'stats failed' });
  });

  test('GET /api/admin/training/examples returns populated examples', async () => {
    const examples = [{ _id: 'example-1', filename: 'good.pdf' }];
    const lean = jest.fn().mockResolvedValue(examples);
    const sort = jest.fn(() => ({ lean }));
    const populate = jest.fn(() => ({ sort }));
    TrainingExample.find.mockReturnValue({ populate });
    const handler = getRouteHandler('/training/examples', 'get');
    const res = createResponse();

    await handler({}, res);

    expect(TrainingExample.find).toHaveBeenCalled();
    expect(populate).toHaveBeenCalledWith('uploadedBy', 'name email');
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(res.json).toHaveBeenCalledWith(examples);
  });

  test('DELETE /api/admin/training/examples/:id deletes an example and its file', async () => {
    const example = {
      _id: 'example-1',
      filename: 'template.pdf',
      filePath: '/uploads/template.pdf',
      type: 'template',
      deleteOne: jest.fn().mockResolvedValue(),
    };
    TrainingExample.findById.mockResolvedValue(example);
    const handler = getRouteHandler('/training/examples/:id', 'delete');
    const req = {
      params: { id: 'example-1' },
      user: { _id: 'admin-1', email: 'admin@example.com' },
    };
    const res = createResponse();

    await handler(req, res);

    expect(fs.existsSync).toHaveBeenCalledWith('/uploads/template.pdf');
    expect(fs.unlinkSync).toHaveBeenCalledWith('/uploads/template.pdf');
    expect(example.deleteOne).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      'training_deleted',
      expect.objectContaining({
        req,
        userId: 'admin-1',
        email: 'admin@example.com',
        details: {
          exampleId: 'example-1',
          filename: 'template.pdf',
          type: 'template',
        },
      })
    );
    expect(res.json).toHaveBeenCalledWith({
      message: 'Training example deleted successfully',
    });
  });

  test('DELETE /api/admin/training/examples/:id returns 404 for missing examples', async () => {
    TrainingExample.findById.mockResolvedValue(null);
    const handler = getRouteHandler('/training/examples/:id', 'delete');
    const res = createResponse();

    await handler({ params: { id: 'missing-example' }, user: { _id: 'admin-1' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Training example not found' });
  });

  test('PATCH /api/admin/training/examples/:id/activate activates a trained template', async () => {
    const example = {
      _id: 'example-1',
      type: 'template',
      status: 'trained',
      isActive: false,
      save: jest.fn().mockResolvedValue(),
    };
    TrainingExample.findById.mockResolvedValue(example);
    TrainingExample.updateMany.mockResolvedValue({ modifiedCount: 1 });
    const handler = getRouteHandler('/training/examples/:id/activate', 'patch');
    const res = createResponse();

    await handler({ params: { id: 'example-1' } }, res);

    expect(TrainingExample.updateMany).toHaveBeenCalledWith(
      { type: 'template', isActive: true },
      { isActive: false }
    );
    expect(example.isActive).toBe(true);
    expect(example.save).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      message: 'Template activated',
      example,
    });
  });

  test('PATCH /api/admin/training/examples/:id/activate validates template state', async () => {
    const handler = getRouteHandler('/training/examples/:id/activate', 'patch');

    TrainingExample.findById.mockResolvedValueOnce(null);
    const missingRes = createResponse();
    await handler({ params: { id: 'missing-example' } }, missingRes);
    expect(missingRes.status).toHaveBeenCalledWith(404);
    expect(missingRes.json).toHaveBeenCalledWith({ message: 'Training example not found' });

    TrainingExample.findById.mockResolvedValueOnce({ type: 'good', status: 'trained' });
    const wrongTypeRes = createResponse();
    await handler({ params: { id: 'good-example' } }, wrongTypeRes);
    expect(wrongTypeRes.status).toHaveBeenCalledWith(400);
    expect(wrongTypeRes.json).toHaveBeenCalledWith({
      message: 'Only template examples can be activated',
    });

    TrainingExample.findById.mockResolvedValueOnce({ type: 'template', status: 'pending' });
    const pendingRes = createResponse();
    await handler({ params: { id: 'pending-template' } }, pendingRes);
    expect(pendingRes.status).toHaveBeenCalledWith(400);
    expect(pendingRes.json).toHaveBeenCalledWith({
      message: 'Template must be trained before activating',
    });
  });
});

describe('Admin team and audit routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FRONTEND_URL = 'http://localhost:3000';
    audit.log.mockResolvedValue();
  });

  test('GET /api/admin/teams returns populated teams', async () => {
    const teams = [{ _id: 'team-1', name: 'QA Team' }];
    const { populateCreatedBy, populateMembers, populateTeamLead, sort } =
      mockTeamFindPopulateLean(teams);
    const handler = getRouteHandler('/teams', 'get');
    const res = createResponse();

    await handler({}, res);

    expect(Team.find).toHaveBeenCalled();
    expect(populateCreatedBy).toHaveBeenCalledWith('createdBy', 'name email');
    expect(populateMembers).toHaveBeenCalledWith('members', 'name email role');
    expect(populateTeamLead).toHaveBeenCalledWith('teamLead', 'name email');
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(res.json).toHaveBeenCalledWith(teams);
  });

  test('POST /api/admin/teams validates, rejects duplicates, and creates teams', async () => {
    const handler = getRouteHandler('/teams', 'post');
    const invalidRes = createResponse();

    await handler({ body: { name: ' ' }, user: { _id: 'admin-1' } }, invalidRes);

    expect(invalidRes.status).toHaveBeenCalledWith(400);
    expect(invalidRes.json).toHaveBeenCalledWith({ message: 'Team name is required' });

    Team.findOne.mockResolvedValueOnce({ _id: 'existing-team' });
    const duplicateRes = createResponse();
    await handler({ body: { name: ' QA Team ' }, user: { _id: 'admin-1' } }, duplicateRes);
    expect(Team.findOne).toHaveBeenCalledWith({ name: 'QA Team' });
    expect(duplicateRes.status).toHaveBeenCalledWith(409);
    expect(duplicateRes.json).toHaveBeenCalledWith({
      message: 'A team with that name already exists',
    });

    const team = { _id: 'team-1', name: 'QA Team' };
    Team.findOne.mockResolvedValueOnce(null);
    Team.create.mockResolvedValue(team);
    const res = createResponse();
    const req = {
      body: { name: ' QA Team ' },
      user: { _id: 'admin-1', email: 'admin@example.com' },
    };

    await handler(req, res);

    expect(Team.create).toHaveBeenCalledWith({ name: 'QA Team', createdBy: 'admin-1' });
    expect(audit.log).toHaveBeenCalledWith(
      'team_created',
      expect.objectContaining({
        req,
        userId: 'admin-1',
        email: 'admin@example.com',
        details: { teamId: 'team-1', teamName: 'QA Team' },
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(team);
  });

  test('PATCH /api/admin/teams/:id/members adds members, reverts extra leads, emails and audits', async () => {
    const handler = getRouteHandler('/teams/:id/members', 'patch');
    const team = {
      _id: 'team-1',
      name: 'QA Team',
      members: [objectId('u-1')],
      teamLead: objectId('lead-1'),
      memberJoinDates: new Map(),
      save: jest.fn().mockResolvedValue(),
    };
    Team.findById.mockResolvedValueOnce(team);
    mockUserFindSelectLean([{ _id: 'u-2' }]);
    User.updateMany.mockResolvedValue({ modifiedCount: 1 });
    const updated = { _id: 'team-1', members: ['u-1', 'u-2'] };
    mockTeamFindByIdPopulateLean(updated);
    mockUserFindSelectLean([
      { email: 'u2@example.com', role: 'team_leader' },
    ]);
    mockUserFindSelectLean([
      { _id: 'u-2', name: 'User Two', email: 'u2@example.com' },
    ]);
    User.find
      .mockReturnValueOnce({
        select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([{ _id: 'u-2' }]) })),
      })
      .mockReturnValueOnce({
        select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([{ email: 'u2@example.com', role: 'team_leader' }]) })),
      })
      .mockReturnValueOnce({
        select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([{ _id: 'u-2', name: 'User Two', email: 'u2@example.com' }]) })),
      });
    const req = {
      params: { id: 'team-1' },
      body: { memberIds: ['u-1', 'u-2'] },
      user: { _id: 'admin-1', email: 'admin@example.com' },
    };
    const res = createResponse();

    await handler(req, res);

    expect(team.members.map((member) => member.toString?.() || member)).toEqual(['u-1', 'u-2']);
    expect(team.memberJoinDates.get('u-2')).toBeInstanceOf(Date);
    expect(User.updateMany).toHaveBeenCalledWith(
      { _id: { $in: ['u-2'] } },
      { $set: { role: 'user' } }
    );
    expect(sendTeamAssignmentEmail).toHaveBeenCalledWith({
      to: 'u2@example.com',
      teamName: 'QA Team',
      role: 'team_leader',
      loginUrl: 'http://localhost:3000/login',
    });
    expect(audit.log).toHaveBeenCalledWith(
      'team_member_added',
      expect.objectContaining({
        details: expect.objectContaining({ teamId: 'team-1', count: 1 }),
      })
    );
    expect(res.json).toHaveBeenCalledWith(updated);
  });

  test('DELETE /api/admin/teams/:id/members/:userId removes a lead member and audits', async () => {
    const handler = getRouteHandler('/teams/:id/members/:userId', 'delete');
    const team = {
      _id: 'team-1',
      name: 'QA Team',
      members: [objectId('lead-1'), objectId('u-2')],
      teamLead: objectId('u-2'),
      memberJoinDates: { delete: jest.fn() },
      save: jest.fn().mockResolvedValue(),
    };
    Team.findById.mockResolvedValueOnce(team);
    mockUserFindByIdSelectLean({ email: 'removed@example.com' });
    User.findByIdAndUpdate.mockResolvedValue({});
    const updated = { _id: 'team-1', members: ['lead-1'], teamLead: null };
    mockTeamFindByIdPopulateLean(updated);
    const req = {
      params: { id: 'team-1', userId: 'u-2' },
      user: { _id: 'admin-1', email: 'admin@example.com' },
    };
    const res = createResponse();

    await handler(req, res);

    expect(team.members.map((member) => member.toString())).toEqual(['lead-1']);
    expect(team.memberJoinDates.delete).toHaveBeenCalledWith('u-2');
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith('u-2', { role: 'user' });
    expect(sendTeamRemovalEmail).toHaveBeenCalledWith({
      to: 'removed@example.com',
      teamName: 'QA Team',
    });
    expect(audit.log).toHaveBeenCalledWith(
      'team_member_removed',
      expect.objectContaining({
        details: expect.objectContaining({
          removedUserId: 'u-2',
          removedUserEmail: 'removed@example.com',
        }),
      })
    );
    expect(res.json).toHaveBeenCalledWith(updated);
  });

  test('PATCH /api/admin/teams/:id/lead assigns a new lead and audits', async () => {
    const handler = getRouteHandler('/teams/:id/lead', 'patch');
    const team = {
      _id: 'team-1',
      name: 'QA Team',
      members: [objectId('old-lead'), objectId('new-lead')],
      teamLead: objectId('old-lead'),
      save: jest.fn().mockResolvedValue(),
    };
    Team.findById.mockResolvedValueOnce(team);
    User.findByIdAndUpdate.mockResolvedValue({});
    User.findById
      .mockReturnValueOnce({
        select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue({ email: 'new@example.com' }) })),
      })
      .mockReturnValueOnce({
        select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue({ name: 'New Lead', email: 'new@example.com' }) })),
      });
    const updated = { _id: 'team-1', teamLead: { name: 'New Lead' } };
    mockTeamFindByIdPopulateLean(updated);
    const req = {
      params: { id: 'team-1' },
      body: { userId: 'new-lead' },
      user: { _id: 'admin-1', email: 'admin@example.com' },
    };
    const res = createResponse();

    await handler(req, res);

    expect(User.findByIdAndUpdate.mock.calls[0][0].toString()).toBe('old-lead');
    expect(User.findByIdAndUpdate.mock.calls[0][1]).toEqual({ role: 'user' });
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith('new-lead', { role: 'team_leader' });
    expect(team.teamLead).toBe('new-lead');
    expect(sendTeamLeadAssignmentEmail).toHaveBeenCalledWith({
      to: 'new@example.com',
      teamName: 'QA Team',
      loginUrl: 'http://localhost:3000/login',
    });
    expect(audit.log).toHaveBeenCalledWith(
      'team_lead_assigned',
      expect.objectContaining({
        details: expect.objectContaining({
          newLeadId: 'new-lead',
          newLeadName: 'New Lead',
          newLeadEmail: 'new@example.com',
        }),
      })
    );
    expect(res.json).toHaveBeenCalledWith(updated);
  });

  test('DELETE /api/admin/teams/:id deletes a team and reverts the lead role', async () => {
    const handler = getRouteHandler('/teams/:id', 'delete');
    const team = {
      _id: 'team-1',
      name: 'QA Team',
      members: ['u-1', 'u-2'],
      teamLead: 'lead-1',
      deleteOne: jest.fn().mockResolvedValue(),
    };
    Team.findById.mockResolvedValue(team);
    User.findByIdAndUpdate.mockResolvedValue({});
    const req = {
      params: { id: 'team-1' },
      user: { _id: 'admin-1', email: 'admin@example.com' },
    };
    const res = createResponse();

    await handler(req, res);

    expect(User.findByIdAndUpdate).toHaveBeenCalledWith('lead-1', { role: 'user' });
    expect(audit.log).toHaveBeenCalledWith(
      'team_deleted',
      expect.objectContaining({
        details: { teamId: 'team-1', teamName: 'QA Team', memberCount: 2 },
      })
    );
    expect(team.deleteOne).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ message: 'Team deleted successfully' });
  });

  test('GET /api/admin/audit-logs returns paginated logs and 24h summary counts', async () => {
    const logs = [{ _id: 'log-1', action: 'login_failed' }];
    const lean = jest.fn().mockResolvedValue(logs);
    const limit = jest.fn(() => ({ lean }));
    const skip = jest.fn(() => ({ limit }));
    const sort = jest.fn(() => ({ skip }));
    const populate = jest.fn(() => ({ sort }));
    AuditLog.find.mockReturnValue({ populate });
    AuditLog.countDocuments
      .mockResolvedValueOnce(75)
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1);
    const handler = getRouteHandler('/audit-logs', 'get');
    const res = createResponse();

    await handler({ query: { action: 'login_failed', page: '2', limit: '25' } }, res);

    expect(AuditLog.find).toHaveBeenCalledWith({ action: 'login_failed' });
    expect(populate).toHaveBeenCalledWith('userId', 'name email role');
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(skip).toHaveBeenCalledWith(25);
    expect(limit).toHaveBeenCalledWith(25);
    expect(res.json).toHaveBeenCalledWith({
      logs,
      total: 75,
      page: 2,
      pages: 3,
      summary24h: { successCount: 10, failedCount: 3, inactiveCount: 1 },
    });
  });
});
