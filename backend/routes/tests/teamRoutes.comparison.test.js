jest.mock('../../models/Team', () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
}));

jest.mock('../../models/User', () => ({
  find: jest.fn(),
  findById: jest.fn(),
}));
jest.mock('../../models/Report', () => ({
  find: jest.fn(),
}));

jest.mock('../../middleware/authMiddleware', () => ({
  protect: (req, res, next) => next(),
  authorize: () => (req, res, next) => next(),
}));

jest.mock('../../services/emailService', () => ({
  sendTeamAssignmentEmail: jest.fn(),
  sendTeamRemovalEmail: jest.fn(),
}));

jest.mock('../../services/analyticsService', () => ({
  buildAnalyticsPayload: jest.fn(),
}));

const Team = require('../../models/Team');
const User = require('../../models/User');
const Report = require('../../models/Report');
const { buildAnalyticsPayload } = require('../../services/analyticsService');
const {
  sendTeamAssignmentEmail,
  sendTeamRemovalEmail,
} = require('../../services/emailService');
const router = require('../teamRoutes');

const getRouteHandler = (path, method) => {
  const layer = router.stack.find(
    (entry) => entry.route && entry.route.path === path && entry.route.methods[method]
  );

  if (!layer) {
    throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  }

  return layer.route.stack[layer.route.stack.length - 1].handle;
};

const createResponse = () => {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };

  return res;
};

const mockFindOneLean = (value) => {
  const lean = jest.fn().mockResolvedValue(value);
  const populate = jest.fn(() => ({ lean }));
  Team.findOne.mockReturnValue({ populate });
};

const mockFindOnePopulateLean = (value) => {
  const lean = jest.fn().mockResolvedValue(value);
  const populateSecond = jest.fn(() => ({ lean }));
  const populateFirst = jest.fn(() => ({ populate: populateSecond }));
  Team.findOne.mockReturnValue({ populate: populateFirst });

  return { populateFirst, populateSecond, lean };
};

const mockTeamFindByIdPopulateLean = (value) => {
  const lean = jest.fn().mockResolvedValue(value);
  const populateSecond = jest.fn(() => ({ lean }));
  const populateFirst = jest.fn(() => ({ populate: populateSecond }));
  Team.findById.mockReturnValue({ populate: populateFirst });

  return { populateFirst, populateSecond, lean };
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

const objectId = (value) => ({ toString: () => value });

describe('GET /api/teams/my-team/comparison', () => {
  const handler = getRouteHandler('/my-team/comparison', 'get');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 400 when one or both users are missing', async () => {
    const req = {
      query: { primaryUserId: 'u-1' },
      user: { _id: 'lead-1', role: 'team_leader' },
    };
    const res = createResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Two users are required for comparison' });
  });

  test('returns 400 when the same user is selected twice', async () => {
    const req = {
      query: { primaryUserId: 'u-1', secondaryUserId: 'u-1' },
      user: { _id: 'lead-1', role: 'team_leader' },
    };
    const res = createResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Comparison requires two different users' });
  });

  test('returns 403 when the current user does not lead a team', async () => {
    mockFindOneLean(null);

    const req = {
      query: { primaryUserId: 'u-1', secondaryUserId: 'u-2' },
      user: { _id: 'lead-1', role: 'team_leader' },
    };
    const res = createResponse();

    await handler(req, res);

    expect(Team.findOne).toHaveBeenCalledWith({ teamLead: 'lead-1' });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'You are not a team lead' });
  });

  test('returns 403 when either user is outside the team', async () => {
    mockFindOneLean({
      _id: 'team-1',
      name: 'QA Team',
      members: [
        { _id: 'u-1', name: 'Alex', email: 'alex@example.com', role: 'user' },
        { _id: 'u-2', name: 'Blake', email: 'blake@example.com', role: 'user' },
      ],
      memberJoinDates: {},
    });

    const req = {
      query: { primaryUserId: 'u-1', secondaryUserId: 'u-9' },
      user: { _id: 'lead-1', role: 'team_leader' },
    };
    const res = createResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'You can only compare members of your own team' });
  });

  test('builds both comparison scopes with join-date-aware filters and returns payload', async () => {
    mockFindOneLean({
      _id: 'team-1',
      name: 'QA Team',
      members: [
        { _id: 'u-1', name: 'Alex', email: 'alex@example.com', role: 'user' },
        { _id: 'u-2', name: 'Blake', email: 'blake@example.com', role: 'team_leader' },
      ],
      memberJoinDates: {
        'u-1': '2026-04-01T00:00:00.000Z',
      },
    });

    buildAnalyticsPayload
      .mockResolvedValueOnce({
        scopeLabel: 'User: Alex',
        scopeDetails: { userId: 'u-1', userName: 'Alex', userEmail: 'alex@example.com' },
        summary: { totalReports: 2, analyzedReports: 2 },
      })
      .mockResolvedValueOnce({
        scopeLabel: 'User: Blake',
        scopeDetails: { userId: 'u-2', userName: 'Blake', userEmail: 'blake@example.com' },
        summary: { totalReports: 1, analyzedReports: 1 },
      });

    const req = {
      query: { primaryUserId: 'u-1', secondaryUserId: 'u-2', range: '90' },
      user: { _id: 'lead-1', role: 'team_leader' },
    };
    const res = createResponse();

    await handler(req, res);

    expect(buildAnalyticsPayload).toHaveBeenCalledTimes(2);
    expect(buildAnalyticsPayload).toHaveBeenNthCalledWith(1, {
      filter: {
        analyzedBy: 'u-1',
        createdAt: { $gte: '2026-04-01T00:00:00.000Z' },
      },
      scopeLabel: 'User: Alex',
      scopeDetails: {
        userId: 'u-1',
        userName: 'Alex',
        userEmail: 'alex@example.com',
        userRole: 'user',
        teamId: 'team-1',
        teamName: 'QA Team',
      },
      range: '90',
    });
    expect(buildAnalyticsPayload).toHaveBeenNthCalledWith(2, {
      filter: {
        analyzedBy: 'u-2',
      },
      scopeLabel: 'User: Blake',
      scopeDetails: {
        userId: 'u-2',
        userName: 'Blake',
        userEmail: 'blake@example.com',
        userRole: 'team_leader',
        teamId: 'team-1',
        teamName: 'QA Team',
      },
      range: '90',
    });

    expect(res.json).toHaveBeenCalledWith({
      range: '90',
      comparisonMode: true,
      comparisonType: 'user',
      teamId: 'team-1',
      teamName: 'QA Team',
      primaryScope: {
        scopeLabel: 'User: Alex',
        scopeDetails: { userId: 'u-1', userName: 'Alex', userEmail: 'alex@example.com' },
        summary: { totalReports: 2, analyzedReports: 2 },
      },
      secondaryScope: {
        scopeLabel: 'User: Blake',
        scopeDetails: { userId: 'u-2', userName: 'Blake', userEmail: 'blake@example.com' },
        summary: { totalReports: 1, analyzedReports: 1 },
      },
    });
  });

  test('uses memberJoinDates.get when join dates are stored as a Map-like object', async () => {
    mockFindOneLean({
      _id: 'team-1',
      name: 'QA Team',
      members: [
        { _id: 'u-1', name: 'Alex', email: 'alex@example.com', role: 'user' },
        { _id: 'u-2', name: 'Blake', email: 'blake@example.com', role: 'user' },
      ],
      memberJoinDates: {
        get: jest.fn((id) => (id === 'u-2' ? '2026-03-15T00:00:00.000Z' : null)),
      },
    });

    buildAnalyticsPayload
      .mockResolvedValueOnce({ scopeLabel: 'User: Alex', scopeDetails: { userId: 'u-1' }, summary: {} })
      .mockResolvedValueOnce({ scopeLabel: 'User: Blake', scopeDetails: { userId: 'u-2' }, summary: {} });

    const req = {
      query: { primaryUserId: 'u-1', secondaryUserId: 'u-2', range: '30' },
      user: { _id: 'lead-1', role: 'team_leader' },
    };
    const res = createResponse();

    await handler(req, res);

    expect(buildAnalyticsPayload).toHaveBeenNthCalledWith(1, expect.objectContaining({
      filter: { analyzedBy: 'u-1' },
    }));
    expect(buildAnalyticsPayload).toHaveBeenNthCalledWith(2, expect.objectContaining({
      filter: {
        analyzedBy: 'u-2',
        createdAt: { $gte: '2026-03-15T00:00:00.000Z' },
      },
    }));
  });

  test('returns 500 when analytics payload generation fails', async () => {
    mockFindOneLean({
      _id: 'team-1',
      name: 'QA Team',
      members: [
        { _id: 'u-1', name: 'Alex', email: 'alex@example.com', role: 'user' },
        { _id: 'u-2', name: 'Blake', email: 'blake@example.com', role: 'user' },
      ],
      memberJoinDates: {},
    });

    buildAnalyticsPayload.mockRejectedValue(new Error('aggregation failed'));

    const req = {
      query: { primaryUserId: 'u-1', secondaryUserId: 'u-2', range: '30' },
      user: { _id: 'lead-1', role: 'team_leader' },
    };
    const res = createResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'aggregation failed' });
  });
});

describe('team route handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FRONTEND_URL = 'http://localhost:3000';
  });

  test('GET /my-team returns the logged-in user team', async () => {
    const handler = getRouteHandler('/my-team', 'get');
    const team = {
      _id: 'team-1',
      name: 'QA Team',
      members: [{ _id: 'user-1', name: 'Ada' }],
      teamLead: { _id: 'lead-1', name: 'Lead' },
    };
    const { populateFirst, populateSecond } = mockFindOnePopulateLean(team);
    const req = { user: { _id: 'user-1' } };
    const res = createResponse();

    await handler(req, res);

    expect(Team.findOne).toHaveBeenCalledWith({ members: 'user-1' });
    expect(populateFirst).toHaveBeenCalledWith('members', 'name email role');
    expect(populateSecond).toHaveBeenCalledWith('teamLead', 'name email');
    expect(res.json).toHaveBeenCalledWith(team);
  });

  test('GET /my-team returns 404 when the user has no team', async () => {
    const handler = getRouteHandler('/my-team', 'get');
    mockFindOnePopulateLean(null);
    const res = createResponse();

    await handler({ user: { _id: 'user-1' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'You are not part of any team' });
  });

  test('GET /available-users returns non-admin users', async () => {
    const handler = getRouteHandler('/available-users', 'get');
    const users = [{ _id: 'user-1', name: 'Ada', email: 'ada@example.com', role: 'user' }];
    const { select } = mockUserFindSelectLean(users);
    const res = createResponse();

    await handler({ user: { _id: 'lead-1' } }, res);

    expect(User.find).toHaveBeenCalledWith({ role: { $ne: 'admin' } });
    expect(select).toHaveBeenCalledWith('name email role');
    expect(res.json).toHaveBeenCalledWith(users);
  });

  test('PATCH /my-team/members validates memberIds', async () => {
    const handler = getRouteHandler('/my-team/members', 'patch');
    const res = createResponse();

    await handler({ body: { memberIds: 'user-1' }, user: { _id: 'lead-1' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'memberIds must be an array' });
  });

  test('PATCH /my-team/members adds new members, sends emails, and returns populated team', async () => {
    const handler = getRouteHandler('/my-team/members', 'patch');
    const team = {
      _id: 'team-1',
      name: 'QA Team',
      members: [objectId('user-1')],
      memberJoinDates: new Map(),
      save: jest.fn().mockResolvedValue(),
    };
    Team.findOne.mockResolvedValue(team);
    mockUserFindSelectLean([
      { email: 'new@example.com', role: 'user' },
      { email: 'lead@example.com', role: 'team_leader' },
    ]);
    const updated = { _id: 'team-1', name: 'QA Team', members: ['user-1', 'user-2', 'user-3'] };
    mockTeamFindByIdPopulateLean(updated);
    const req = {
      body: { memberIds: ['user-1', 'user-2', 'user-3'] },
      user: { _id: 'lead-1' },
    };
    const res = createResponse();

    await handler(req, res);

    expect(team.members.map((member) => member.toString?.() || member)).toEqual([
      'user-1',
      'user-2',
      'user-3',
    ]);
    expect(team.memberJoinDates.get('user-2')).toBeInstanceOf(Date);
    expect(team.save).toHaveBeenCalled();
    expect(User.find).toHaveBeenCalledWith({ _id: { $in: ['user-2', 'user-3'] } });
    expect(sendTeamAssignmentEmail).toHaveBeenCalledTimes(2);
    expect(sendTeamAssignmentEmail).toHaveBeenCalledWith({
      to: 'new@example.com',
      teamName: 'QA Team',
      role: 'user',
      loginUrl: 'http://localhost:3000/login',
    });
    expect(res.json).toHaveBeenCalledWith(updated);
  });

  test('PATCH /my-team/members returns 403 when no led team exists', async () => {
    const handler = getRouteHandler('/my-team/members', 'patch');
    Team.findOne.mockResolvedValue(null);
    const res = createResponse();

    await handler({ body: { memberIds: ['user-1'] }, user: { _id: 'lead-1' } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'You are not a team lead' });
  });

  test('DELETE /my-team/members/:userId removes a member and sends removal email', async () => {
    const handler = getRouteHandler('/my-team/members/:userId', 'delete');
    const team = {
      _id: 'team-1',
      name: 'QA Team',
      members: [objectId('lead-1'), objectId('user-2')],
      memberJoinDates: { delete: jest.fn() },
      save: jest.fn().mockResolvedValue(),
    };
    Team.findOne.mockResolvedValue(team);
    mockUserFindByIdSelectLean({ email: 'removed@example.com' });
    const updated = { _id: 'team-1', members: ['lead-1'] };
    mockTeamFindByIdPopulateLean(updated);
    const req = {
      params: { userId: 'user-2' },
      user: { _id: objectId('lead-1') },
    };
    const res = createResponse();

    await handler(req, res);

    expect(team.members.map((member) => member.toString())).toEqual(['lead-1']);
    expect(team.memberJoinDates.delete).toHaveBeenCalledWith('user-2');
    expect(sendTeamRemovalEmail).toHaveBeenCalledWith({
      to: 'removed@example.com',
      teamName: 'QA Team',
    });
    expect(res.json).toHaveBeenCalledWith(updated);
  });

  test('DELETE /my-team/members/:userId prevents team leads removing themselves', async () => {
    const handler = getRouteHandler('/my-team/members/:userId', 'delete');
    Team.findOne.mockResolvedValue({ _id: 'team-1', members: [], memberJoinDates: new Map() });
    const res = createResponse();

    await handler(
      { params: { userId: 'lead-1' }, user: { _id: objectId('lead-1') } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'You cannot remove yourself from the team' });
  });

  test('GET /my-team/stats returns team analytics payload', async () => {
    const handler = getRouteHandler('/my-team/stats', 'get');
    const team = {
      _id: 'team-1',
      name: 'QA Team',
      members: [objectId('u-1'), objectId('u-2')],
      memberJoinDates: new Map([['u-2', '2026-04-01T00:00:00.000Z']]),
    };
    Team.findOne.mockResolvedValue(team);
    buildAnalyticsPayload.mockResolvedValue({
      summary: {
        totalReports: 3,
        totalErrors: 5,
        totalTimeSaved: 7.6,
        manualTime: 20,
        aiTime: 12,
        timeSavedPercent: 40,
        pendingReports: 1,
      },
      errorBreakdown: [{ name: 'Placeholder', value: 1 }],
      qualityBreakdown: { good: 1, bad: 1, uncertain: 0 },
      scopeLabel: 'Team: QA Team',
      scopeDetails: { teamId: 'team-1' },
      trendData: [],
      passFailRateTrends: [],
      qualityScoreTrend: [],
      mostCommonErrorTypes: [],
      checklistFailureBreakdown: [],
      topErrors: [],
      recentReports: [{ _id: 'report-1', qualityLabel: 'good' }],
    });
    const req = { query: { range: '90' }, user: { _id: 'lead-1' } };
    const res = createResponse();

    await handler(req, res);

    expect(buildAnalyticsPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: { analyzedBy: { $in: ['u-1', 'u-2'] } },
        scopeLabel: 'Team: QA Team',
        range: '90',
        postFetchFilter: expect.any(Function),
      })
    );
    const postFetchFilter = buildAnalyticsPayload.mock.calls[0][0].postFetchFilter;
    expect(postFetchFilter({ analyzedBy: objectId('u-1'), createdAt: '2026-03-01' })).toBe(true);
    expect(postFetchFilter({ analyzedBy: objectId('u-2'), createdAt: '2026-03-01' })).toBe(false);
    expect(postFetchFilter({ analyzedBy: objectId('u-2'), createdAt: '2026-04-02' })).toBe(true);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        range: '90',
        totalMembers: 2,
        totalReports: 3,
        totalErrors: 5,
        timeSaved: 8,
        qualityBreakdown: { passed: 1, failed: 1, uncertain: 0, pending: 1 },
        recentReports: [{ _id: 'report-1', qualityLabel: 'good', result: 'good' }],
      })
    );
  });

  test('GET /my-team/announcements returns sorted announcements with read state', async () => {
    const handler = getRouteHandler('/my-team/announcements', 'get');
    mockFindOneLean({
      announcements: [
        {
          _id: 'old',
          title: 'Old',
          createdAt: '2026-01-01T00:00:00.000Z',
          readBy: [],
        },
        {
          _id: 'new',
          title: 'New',
          createdAt: '2026-02-01T00:00:00.000Z',
          readBy: [objectId('user-1')],
        },
      ],
    });
    const req = { user: { _id: objectId('user-1') } };
    const res = createResponse();

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({ _id: 'new', readByMe: true }),
      expect.objectContaining({ _id: 'old', readByMe: false }),
    ]);
  });

  test('POST /my-team/announcements validates and creates an announcement', async () => {
    const handler = getRouteHandler('/my-team/announcements', 'post');
    const invalidRes = createResponse();

    await handler(
      { body: { title: ' ', content: 'Body' }, user: { _id: 'lead-1', name: 'Lead' } },
      invalidRes
    );

    expect(invalidRes.status).toHaveBeenCalledWith(400);
    expect(invalidRes.json).toHaveBeenCalledWith({ message: 'Title and content are required' });

    const savedAnnouncement = {
      toObject: () => ({ _id: 'ann-1', title: 'Title', content: 'Body' }),
    };
    const team = {
      announcements: {
        items: [],
        push(item) {
          this.items.push(item);
        },
        get length() {
          return this.items.length;
        },
      },
      save: jest.fn().mockImplementation(() => {
        team.announcements.items[0] = savedAnnouncement;
        return Promise.resolve();
      }),
    };
    Object.defineProperty(team.announcements, '0', {
      get() {
        return this.items[0];
      },
    });
    Team.findOne.mockResolvedValue(team);
    const res = createResponse();

    await handler(
      {
        body: { title: ' Title ', content: ' Body ' },
        user: { _id: 'lead-1', name: 'Lead Name' },
      },
      res
    );

    expect(team.announcements.items[0]).toBe(savedAnnouncement);
    expect(team.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      _id: 'ann-1',
      title: 'Title',
      content: 'Body',
      createdBy: { _id: 'lead-1', name: 'Lead Name' },
    });
  });

  test('DELETE /my-team/announcements/:announcementId deletes an announcement', async () => {
    const handler = getRouteHandler('/my-team/announcements/:announcementId', 'delete');
    const announcement = { deleteOne: jest.fn() };
    const team = {
      announcements: { id: jest.fn(() => announcement) },
      save: jest.fn().mockResolvedValue(),
    };
    Team.findOne.mockResolvedValue(team);
    const res = createResponse();

    await handler({ params: { announcementId: 'ann-1' }, user: { _id: 'lead-1' } }, res);

    expect(team.announcements.id).toHaveBeenCalledWith('ann-1');
    expect(announcement.deleteOne).toHaveBeenCalled();
    expect(team.save).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ message: 'Announcement deleted' });
  });

  test('PATCH /my-team/announcements/:announcementId/read marks unread announcements', async () => {
    const handler = getRouteHandler('/my-team/announcements/:announcementId/read', 'patch');
    const announcement = { readBy: [], };
    const team = {
      announcements: { id: jest.fn(() => announcement) },
      save: jest.fn().mockResolvedValue(),
    };
    Team.findOne.mockResolvedValue(team);
    const req = {
      params: { announcementId: 'ann-1' },
      user: { _id: objectId('user-1') },
    };
    const res = createResponse();

    await handler(req, res);

    expect(announcement.readBy.map((id) => id.toString())).toEqual(['user-1']);
    expect(team.save).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ message: 'Marked as read' });
  });

  test('GET /my-team/goals calculates current progress from reports', async () => {
    const handler = getRouteHandler('/my-team/goals', 'get');
    const team = {
      members: [objectId('u-1'), objectId('u-2')],
      memberJoinDates: new Map([['u-2', '2026-04-01T00:00:00.000Z']]),
      goals: [{ title: 'Pass rate', type: 'pass_rate', target: 80 }],
    };
    Team.findOne.mockResolvedValue(team);
    Report.find.mockResolvedValue([
      {
        analyzedBy: objectId('u-1'),
        createdAt: '2026-03-01',
        status: 'analyzed',
        errorCount: 2,
        qualityAssessment: { label: 'good' },
      },
      {
        analyzedBy: objectId('u-2'),
        createdAt: '2026-03-01',
        status: 'analyzed',
        errorCount: 20,
        qualityAssessment: { label: 'bad' },
      },
      {
        analyzedBy: objectId('u-2'),
        createdAt: '2026-04-02',
        status: 'processing',
        errorCount: 0,
      },
    ]);
    const res = createResponse();

    await handler({ user: { _id: 'user-1' } }, res);

    expect(Report.find).toHaveBeenCalledWith({ analyzedBy: { $in: ['u-1', 'u-2'] } });
    expect(res.json).toHaveBeenCalledWith({
      goals: team.goals,
      current: {
        pass_rate: 100,
        reports_submitted: 2,
        avg_errors_below: 2,
      },
    });
  });

  test('POST /my-team/goals validates and creates a goal', async () => {
    const handler = getRouteHandler('/my-team/goals', 'post');
    const missingRes = createResponse();

    await handler({ body: { title: 'Goal', type: 'pass_rate' }, user: { _id: 'lead-1' } }, missingRes);

    expect(missingRes.status).toHaveBeenCalledWith(400);
    expect(missingRes.json).toHaveBeenCalledWith({ message: 'title, type and target are required' });

    const invalidRes = createResponse();

    await handler(
      { body: { title: 'Goal', type: 'unknown', target: 1 }, user: { _id: 'lead-1' } },
      invalidRes
    );

    expect(invalidRes.status).toHaveBeenCalledWith(400);
    expect(invalidRes.json).toHaveBeenCalledWith({ message: 'Invalid goal type' });

    const team = {
      goals: [],
      save: jest.fn().mockResolvedValue(),
    };
    Team.findOne.mockResolvedValue(team);
    const res = createResponse();

    await handler(
      {
        body: { title: 'Submit reports', type: 'reports_submitted', target: 5 },
        user: { _id: 'lead-1' },
      },
      res
    );

    expect(team.goals).toEqual([
      { title: 'Submit reports', type: 'reports_submitted', target: 5, deadline: null },
    ]);
    expect(team.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(team.goals[0]);
  });

  test('DELETE /my-team/goals/:goalId deletes a goal', async () => {
    const handler = getRouteHandler('/my-team/goals/:goalId', 'delete');
    const goal = { deleteOne: jest.fn() };
    const team = {
      goals: { id: jest.fn(() => goal) },
      save: jest.fn().mockResolvedValue(),
    };
    Team.findOne.mockResolvedValue(team);
    const res = createResponse();

    await handler({ params: { goalId: 'goal-1' }, user: { _id: 'lead-1' } }, res);

    expect(team.goals.id).toHaveBeenCalledWith('goal-1');
    expect(goal.deleteOne).toHaveBeenCalled();
    expect(team.save).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ message: 'Goal deleted' });
  });
});
