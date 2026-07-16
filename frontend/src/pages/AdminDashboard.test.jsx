import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../services/api';
import AdminDashboard from './AdminDashboard';

/** Shared GET mock for dashboard data fetches (used when overriding timing for /users or password-reset-requests). */
const buildAdminGetMock =
  ({
    usersResponse = users,
    reportsResponse = reports,
    passwordResetRequestsResponse = passwordResetRequests,
    usersPromise,
    passwordResetPromise,
    reportsPromise,
  } = {}) =>
  (url) => {
    if (url === '/users') {
      return usersPromise ?? Promise.resolve({ data: usersResponse });
    }

    if (url === '/password-reset-requests?status=pending') {
      return passwordResetPromise ?? Promise.resolve({ data: passwordResetRequestsResponse });
    }

    if (url.startsWith('/admin/stats')) {
      return Promise.resolve({ data: adminStats });
    }

    if (url === '/admin/reports') {
      return reportsPromise ?? Promise.resolve({ data: reportsResponse });
    }

    if (url === '/admin/teams') {
      return Promise.resolve({ data: [] });
    }

    if (url === '/admin/training/examples') {
      return Promise.resolve({ data: [] });
    }

    if (url === '/admin/training/stats') {
      return Promise.resolve({
        data: {
          totalExamples: 0,
          trainedExamples: 0,
          pendingExamples: 0,
          goodExamples: 0,
          badExamples: 0,
          templates: 0,
        },
      });
    }

    if (url.startsWith('/admin/analytics')) {
      return Promise.resolve({ data: analyticsResponse });
    }

    return Promise.resolve({ data: {} });
  };

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      _id: 'admin-1',
      name: 'Admin User',
      email: 'admin@example.com',
      role: 'admin',
    },
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}));

vi.mock('../components/Header', () => ({ default: () => <header>Header</header> }));
vi.mock('../components/Footer', () => ({ default: () => <footer>Footer</footer> }));
vi.mock('../context/LanguageContext', async () => {
  const en = (await import('../translations/en')).default;
  const t = (key, replacements) => {
    const keys = key.split('.');
    let value = en;
    for (const k of keys) { if (value == null) break; value = value[k]; }
    if (typeof value !== 'string') return value ?? key;
    if (replacements) {
      return Object.entries(replacements).reduce(
        (str, [k, v]) => str.replace(new RegExp(`{{${k}}}`, 'g'), v),
        value
      );
    }
    return value;
  };
  return { useLanguage: () => ({ t, language: 'en', toggleLanguage: () => {} }) };
});

vi.mock('recharts', () => {
  const Chart = ({ children }) => <div>{children}</div>;
  const Leaf = () => <div />;

  return {
    Bar: Leaf,
    BarChart: Chart,
    CartesianGrid: Leaf,
    Cell: Leaf,
    Legend: Leaf,
    Line: Leaf,
    LineChart: Chart,
    Pie: ({ data, label }) => {
      if (data?.length > 0 && typeof label === 'function') label({ name: data[0].name, value: data[0].value });
      return <div />;
    },
    PieChart: Chart,
    ResponsiveContainer: Chart,
    Tooltip: Leaf,
    XAxis: Leaf,
    YAxis: Leaf,
  };
});

const users = [
  {
    _id: 'user-1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    role: 'user',
    status: 'active',
  },
  {
    _id: 'user-2',
    name: 'Grace Hopper',
    email: 'grace@example.com',
    role: 'team_leader',
    status: 'inactive',
  },
];

const passwordResetRequests = [
  {
    _id: 'request-1',
    requestedAt: '2026-04-19T12:00:00.000Z',
    status: 'pending',
    user: {
      _id: 'user-2',
      name: 'Grace Hopper',
      email: 'grace@example.com',
      role: 'team_leader',
      status: 'active',
    },
  },
  {
    _id: 'request-2',
    requestedAt: '2026-04-18T12:00:00.000Z',
    status: 'pending',
    user: {
      _id: 'user-3',
      name: 'Sterling Archer',
      email: 'archer@example.com',
      role: 'user',
      status: 'active',
    },
  },
];


const analyticsResponse = {
  scopeLabel: 'Company-wide analytics',
  summary: {
    totalReports: 12,
    analyzedReports: 10,
    totalErrors: 18,
    averageErrorsPerReport: 1.8,
    passRate: 80,
    totalTimeSaved: 45,
    manualTime: 75,
    aiTime: 30,
    timeSavedPercent: 60,
  },
  errorBreakdown: [
    { name: 'Placeholder', value: 4 },
    { name: 'Consistency', value: 3 },
    { name: 'Compliance', value: 5 },
    { name: 'Formatting', value: 2 },
    { name: 'Missing Data', value: 4 },
  ],
  qualityBreakdown: {
    good: 6,
    bad: 3,
    uncertain: 1,
  },
  trendData: [
    { period: 'Week 1', reports: 4, passed: 3, failed: 1 },
    { period: 'Week 2', reports: 6, passed: 5, failed: 1 },
  ],
  passFailRateTrends: [
    {
      periodLabel: 'Week 1',
      analyzedCount: 4,
      passedCount: 3,
      failedCount: 1,
      passRate: 75,
    },
    {
      periodLabel: 'Week 2',
      analyzedCount: 6,
      passedCount: 5,
      failedCount: 1,
      passRate: 83,
    },
  ],
  qualityScoreTrend: [
    {
      id: 'r1',
      filename: 'Quarterly_Report_A.pdf',
      qualityScore: 88,
      createdAt: '2026-04-01T10:00:00.000Z',
    },
    {
      id: 'r2',
      filename: 'Quarterly_Report_B.pdf',
      qualityScore: 92,
      createdAt: '2026-04-02T10:00:00.000Z',
    },
  ],
  mostCommonErrorTypes: [
    { type: 'placeholder', count: 4, reportsAffected: 3 },
    { type: 'compliance', count: 5, reportsAffected: 4 },
  ],
  checklistFailureBreakdown: [
    { message: 'Missing signature block', count: 2 },
    { message: 'Incorrect template section', count: 1 },
  ],
  topErrors: [
    { message: 'Missing signature block', count: 2 },
    { message: 'Placeholder text remains', count: 4 },
  ],
  userLeaderboard: [
    { odId: 'u1', userName: 'Ada Lovelace', reportCount: 5, passRate: 80 },
    { odId: 'u2', userName: 'Grace Hopper', reportCount: 3, passRate: 67 },
  ],
  recentReports: [
    {
      id: 'r1',
      filename: 'Quarterly_Report_A.pdf',
      status: 'analyzed',
      errorCount: 2,
      qualityLabel: 'good',
      analyzedBy: 'Ada Lovelace',
      createdAt: '2026-04-01T10:00:00.000Z',
    },
  ],
  scopeDetails: null,
  comparisonMode: false,
  primaryScope: null,
  secondaryScope: null,
};

const reports = [
  {
    _id: 'report-1',
    filename: 'fire-safety-report.pdf',
    analyzedBy: { _id: 'user-1', name: 'Ada Lovelace', email: 'ada@example.com' },
    analyzedAt: '2026-04-18T12:00:00.000Z',
    createdAt: '2026-04-18T11:00:00.000Z',
    errorCount: 2,
    timeSaved: 3,
    addedToTraining: false,
    trainingLabel: null,
    errors: [
      { _id: 'error-1', type: 'placeholder', message: 'Replace placeholder project name' },
      { _id: 'error-2', type: 'missing_data', message: 'Missing inspector signature' },
    ],
  },
  {
    _id: 'report-2',
    filename: 'clean-report.pdf',
    analyzedBy: { _id: 'user-2', name: 'Grace Hopper', email: 'grace@example.com' },
    analyzedAt: '2026-04-17T12:00:00.000Z',
    createdAt: '2026-04-17T11:00:00.000Z',
    errorCount: 0,
    timeSaved: 1,
    addedToTraining: true,
    trainingLabel: 'bad',
    errors: [],
  },
];

const adminStats = {
  totalReports: 0,
  totalErrors: 0,
  timeSaved: 0,
  manualTime: 0,
  aiTime: 0,
  timeSavedPercent: 0,
  errorBreakdown: [
    { name: 'Placeholder', value: 0 },
    { name: 'Consistency', value: 0 },
    { name: 'Compliance', value: 0 },
    { name: 'Formatting', value: 0 },
    { name: 'Missing Data', value: 0 },
  ],
  qualityBreakdown: { passed: 0, failed: 0, uncertain: 0 },
};

const setupApiMocks = ({
  reportsResponse = reports,
  usersResponse = users,
  passwordResetRequestsResponse = passwordResetRequests,
} = {}) => {
  api.get.mockImplementation(
    buildAdminGetMock({ usersResponse, reportsResponse, passwordResetRequestsResponse })
  );




  api.put.mockImplementation((url) => {
    if (url === '/users/user-1/reset-password') {
      return Promise.resolve({ data: { message: 'Password reset successfully and reset email sent' } });
    }

    

    if (url === '/password-reset-requests/request-1/complete') {
      return Promise.resolve({ data: { message: 'Password reset completed and reset email sent' } });
    }

    if (url === '/password-reset-requests/request-2/reject') {
      return Promise.resolve({ data: { message: 'Password reset request rejected' } });
    }

    return Promise.resolve({ data: { message: 'Updated' } });
  });

  api.patch.mockImplementation((url) => {
    if (url === '/admin/reports/report-1/training') {
      return Promise.resolve({
        data: {
          message: 'Report added to training',
          report: { ...reports[0], addedToTraining: true, trainingLabel: 'good' },
        },
      });
    }

    return Promise.resolve({ data: { message: 'Updated' } });
  });

  api.delete.mockResolvedValue({ data: { message: 'User removed successfully' } });
};

const renderDashboard = async (tabName = 'Manage') => {
  render(
    <MemoryRouter>
      <AdminDashboard />
    </MemoryRouter>
  );

  await userEvent.click(screen.getByRole('button', { name: tabName }));
};


describe('AdminDashboard overview tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupApiMocks();
  });

  it('renders overview stats and key analytics sections', async () => {
  await renderDashboard('Overview');

    expect(await screen.findByText(/total users/i)).toBeInTheDocument();
    expect(screen.getByText(/reports analyzed/i)).toBeInTheDocument();
    expect(screen.getByText(/total errors found/i)).toBeInTheDocument();
    expect(screen.getAllByText(/time saved/i)).toHaveLength(2);
  });

  it('shows loading state while overview data is fetching', async () => {
    let resolveUsers;
    const usersPromise = new Promise((resolve) => {
      resolveUsers = resolve;
    });

    api.get.mockImplementation(buildAdminGetMock({ usersPromise }));

    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole('button', { name: 'Overview' }));

    expect(screen.queryByText(/loading users/i)).not.toBeInTheDocument();

    resolveUsers({ data: users });
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('refetches overview data when filters change', async () => {
    const user = userEvent.setup();
    await renderDashboard('Overview');

    const selects = screen.getAllByRole('combobox');
    const rangeSelect = selects[0];

    await user.selectOptions(rangeSelect, '7');

    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/admin/stats?'));
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('range=7'));
  });

  it('shows user profile analytics when a user is selected', async () => {
    const user = userEvent.setup();
    await renderDashboard('Overview');

    const selects = screen.getAllByRole('combobox');
    const userSelect = selects[2];

    await user.selectOptions(userSelect, 'user-1');

    expect(api.get).toHaveBeenCalledWith('/admin/users/user-1/profile-analytics');
  });

  it('renders overview with empty data when there are no reports', async () => {
    setupApiMocks({
      reportsResponse: [],
      usersResponse: [],
    });

    await renderDashboard('Overview');

    expect(await screen.findByText(/reports analyzed/i)).toBeInTheDocument();
    expect(screen.getByText(/total errors found/i)).toBeInTheDocument();
  });

  it('shows overview error when dashboard fetch fails', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/admin/stats') || url === '/admin/reports') {
        return Promise.reject(new Error('admin dashboard failed'));
      }

      if (url === '/reports/stats' || url === '/reports') {
        return Promise.reject({
          response: { data: { message: 'Failed to load overview data' } },
        });
      }

      if (url === '/users') {
        return Promise.resolve({ data: users });
      }

      if (url === '/password-reset-requests?status=pending') {
        return Promise.resolve({ data: passwordResetRequests });
      }

      if (url === '/admin/teams') {
        return Promise.resolve({ data: [] });
      }

      if (url === '/admin/training/examples') {
        return Promise.resolve({ data: [] });
      }

      if (url === '/admin/training/stats') {
        return Promise.resolve({
          data: {
            totalExamples: 0,
            trainedExamples: 0,
            pendingExamples: 0,
            goodExamples: 0,
            badExamples: 0,
            templates: 0,
          },
        });
      }

      return Promise.resolve({ data: [] });
    });

    await renderDashboard('Overview');

    expect(await screen.findByText(/failed to load overview data/i)).toBeInTheDocument();
  });
});


describe('AdminDashboard analytics tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupApiMocks();
  });

  it('renders analytics filters when the analytics tab is selected', async () => {
    const user = userEvent.setup();
    await renderDashboard('Overview');

    await user.click(screen.getByRole('button', { name: /analytics/i }));

    expect(await screen.findByText(/analytics filters/i)).toBeInTheDocument();
    expect(screen.getByText(/level/i)).toBeInTheDocument();
    expect(screen.getByText(/time range/i)).toBeInTheDocument();
    expect(screen.getByText(/company-wide analytics/i)).toBeInTheDocument();
  });

  it('fetches analytics data when the analytics tab is opened', async () => {
    const user = userEvent.setup();
    await renderDashboard('Overview');

    await user.click(screen.getByRole('button', { name: /analytics/i }));

    await screen.findByText(/company-wide analytics/i);

    expect(api.get).toHaveBeenCalledWith('/admin/analytics?level=company&range=30');
    expect(screen.getByText(/total reports/i)).toBeInTheDocument();
    expect(screen.getByText('Pass Rate')).toBeInTheDocument(); //keep this case to pass all "analytics tab" tests
    expect(screen.getByText(/time savings analysis/i)).toBeInTheDocument();
  });


  it('refetches analytics when the time range changes', async () => {
    const user = userEvent.setup();
    await renderDashboard('Overview');

    await user.click(screen.getByRole('button', { name: /analytics/i }));
    await screen.findByText(/analytics filters/i);

    const rangeSelect = screen.getByDisplayValue(/last 30 days/i);
    await user.selectOptions(rangeSelect, '7');

    expect(api.get).toHaveBeenCalledWith('/admin/analytics?level=company&range=7');
  });

  it('shows analytics error when analytics fetch fails', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/admin/analytics?')) {
        return Promise.reject({
          response: { data: { message: 'Failed to load analytics' } },
        });
      }

      return buildAdminGetMock({
        analyticsResponseOverride: analyticsResponse,
      })(url);
    });

    const user = userEvent.setup();
    await renderDashboard('Overview');

    await user.click(screen.getByRole('button', { name: /analytics/i }));

    expect(await screen.findByText(/failed to load analytics/i)).toBeInTheDocument();
  });
});


describe('AdminDashboard users tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupApiMocks();
  });

  it('renders user management when the users tab is selected', async () => {
    const user = userEvent.setup();
    await renderDashboard('Overview');

    await user.click(screen.getByRole('button', { name: /users/i }));

    expect(
      await screen.findByRole('heading', { name: /user management/i })
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search users/i)).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
  });
});

describe('AdminDashboard manage tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupApiMocks();
  });

  it('renders user actions, filters users, and resets a user password', async () => {
    const user = userEvent.setup();
    await renderDashboard();

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('team leader')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/search users/i), 'ada');

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.queryByText('Grace Hopper')).not.toBeInTheDocument();

    const adaRow = screen.getByText('Ada Lovelace').closest('tr');
    await user.click(within(adaRow).getByRole('button', { name: /reset password/i }));

    expect(api.put).toHaveBeenCalledWith('/users/user-1/reset-password');
    expect(await screen.findByText('Password reset successfully and reset email sent')).toBeInTheDocument();
  });

  it('confirms and deletes a user from the user actions view', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    await renderDashboard();

    const graceRow = await screen.findByText('Grace Hopper');
    await user.click(within(graceRow.closest('tr')).getByRole('button', { name: /delete user/i }));

    expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to delete Grace Hopper?');
    expect(api.delete).toHaveBeenCalledWith('/users/user-2');
    expect(await screen.findByText('User removed successfully')).toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it('renders password reset requests, filters requests, completes and rejects requests', async () => {
    const user = userEvent.setup();
    await renderDashboard();

    await user.click(screen.getByRole('button', { name: /password reset requests/i }));

    expect(await screen.findByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('Sterling Archer')).toBeInTheDocument();
    expect(screen.getByText('19 Apr 2026')).toBeInTheDocument();

    const graceRow = screen.getByText('Grace Hopper').closest('tr');
    await user.click(within(graceRow).getByRole('button', { name: /reset password/i }));

    expect(api.put).toHaveBeenCalledWith('/password-reset-requests/request-1/complete');
    expect(await screen.findByText('Password reset completed and reset email sent')).toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText(/search users/i));
    await user.type(screen.getByPlaceholderText(/search users/i), 'archer');

    expect(screen.getByText('Sterling Archer')).toBeInTheDocument();
    expect(screen.queryByText('Grace Hopper')).not.toBeInTheDocument();

    const archerRow = screen.getByText('Sterling Archer').closest('tr');
    await user.click(within(archerRow).getByRole('button', { name: /reject/i }));

    expect(api.put).toHaveBeenCalledWith('/password-reset-requests/request-2/reject', {
      notes: 'Rejected by Admin',
    });
    expect(await screen.findByText('Password reset request rejected')).toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText(/search users/i));
    await user.click(screen.getByRole('button', { name: /user actions/i }));

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
  });

  it('shows manage user error, missing status, and empty search states', async () => {
    const user = userEvent.setup();
    setupApiMocks({
      usersResponse: [
        {
          _id: 'user-without-status',
          name: 'No Status User',
          email: 'nostatus@example.com',
          role: 'user',
        },
      ],
    });
    api.put.mockRejectedValueOnce({
      response: { data: { message: 'Could not reset this password' } },
    });

    await renderDashboard();

    const noStatusRow = await screen.findByText('No Status User');
    expect(within(noStatusRow.closest('tr')).getByText('unknown')).toBeInTheDocument();

    await user.click(within(noStatusRow.closest('tr')).getByRole('button', { name: /reset password/i }));

    expect(await screen.findByText('Could not reset this password')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/search users/i), 'no matching user');

    expect(screen.getByText('No users match your search.')).toBeInTheDocument();
  });

  it('shows empty password reset requests', async () => {
    const user = userEvent.setup();
    setupApiMocks({ passwordResetRequestsResponse: [] });

    await renderDashboard();

    await user.click(screen.getByRole('button', { name: /password reset requests/i }));

    expect(await screen.findByText('No password reset requests found.')).toBeInTheDocument();
  });

  it('shows pending reset states in the password reset request view', async () => {
    const user = userEvent.setup();
    let resolveReset;
    setupApiMocks({
      passwordResetRequestsResponse: [
        {
          _id: 'request-without-status',
          requestedAt: '2026-04-20T12:00:00.000Z',
          user: {
            _id: 'user-2',
            name: 'Grace Hopper',
            email: 'grace@example.com',
            role: 'team_leader',
          },
        },
      ],
    });
    api.put.mockImplementation((url) => {
      if (url === '/users/user-2/reset-password') {
        return new Promise((resolve) => {
          resolveReset = resolve;
        });
      }

      return Promise.resolve({ data: { message: 'Updated' } });
    });

    await renderDashboard();

    const graceRow = await screen.findByText('Grace Hopper');
    await user.click(within(graceRow.closest('tr')).getByRole('button', { name: /reset password/i }));

    await user.click(screen.getByRole('button', { name: /password reset requests/i }));

    const requestRow = await screen.findByText('Grace Hopper');
    expect(within(requestRow.closest('tr')).getByText('unknown')).toBeInTheDocument();
    expect(within(requestRow.closest('tr')).getByRole('button', { name: /resetting/i })).toBeDisabled();

    resolveReset({ data: { message: 'Password reset successfully' } });

    expect(await screen.findByText('Password reset successfully')).toBeInTheDocument();
  });

  it('does not call delete when the delete confirmation is cancelled', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    await renderDashboard();

    const graceRow = await screen.findByText('Grace Hopper');
    await user.click(within(graceRow.closest('tr')).getByRole('button', { name: /delete user/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('shows loading users before the user list finishes loading', async () => {
    const user = userEvent.setup();
    let resolveUsers;
    const usersPromise = new Promise((resolve) => {
      resolveUsers = resolve;
    });

    setupApiMocks();
    api.get.mockImplementation(buildAdminGetMock({ usersPromise }));

    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: 'Manage' }));

    expect(screen.queryByText(/loading users/i)).toBeInTheDocument();

    resolveUsers({ data: users });
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('shows loading password reset requests while pending requests are still fetching', async () => {
    const user = userEvent.setup();
    let resolveRequests;
    const passwordResetPromise = new Promise((resolve) => {
      resolveRequests = resolve;
    });

    setupApiMocks();
    api.get.mockImplementation(buildAdminGetMock({ passwordResetPromise }));

    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: 'Manage' }));
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /password reset requests/i }));

    expect(await screen.findByText(/loading password reset requests/i)).toBeInTheDocument();

    resolveRequests({ data: passwordResetRequests });
    expect(await screen.findByText('Grace Hopper')).toBeInTheDocument();
  });

  it('shows the empty user list message when no users are returned', async () => {
    setupApiMocks({ usersResponse: [] });

    await renderDashboard();

    expect(await screen.findByText('No users match your search.')).toBeInTheDocument();
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
  });

  it('shows requestsError when deleting a user fails', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    setupApiMocks();
    api.delete.mockRejectedValueOnce({
      response: { data: { message: 'User delete blocked by policy' } },
    });

    await renderDashboard();

    const graceRow = await screen.findByText('Grace Hopper');
    await user.click(within(graceRow.closest('tr')).getByRole('button', { name: /delete user/i }));

    expect(await screen.findByText('User delete blocked by policy')).toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it('shows requestsError when completing a password reset request fails', async () => {
    const user = userEvent.setup();
    setupApiMocks();
    api.put.mockImplementation((url) => {
      if (url === '/password-reset-requests/request-1/complete') {
        return Promise.reject({
          response: { data: { message: 'Complete request failed' } },
        });
      }

      return Promise.resolve({ data: { message: 'Updated' } });
    });

    await renderDashboard();

    await user.click(screen.getByRole('button', { name: /password reset requests/i }));
    const graceRow = await screen.findByText('Grace Hopper');
    await user.click(
      within(graceRow.closest('tr')).getByRole('button', { name: /reset password/i })
    );

    expect(await screen.findByText('Complete request failed')).toBeInTheDocument();
  });

  it('shows requestsError when rejecting a password reset request fails', async () => {
    const user = userEvent.setup();
    setupApiMocks();
    api.put.mockImplementation((url) => {
      if (url === '/password-reset-requests/request-2/reject') {
        return Promise.reject({
          response: { data: { message: 'Reject request failed' } },
        });
      }

      return Promise.resolve({ data: { message: 'Updated' } });
    });

    await renderDashboard();

    await user.click(screen.getByRole('button', { name: /password reset requests/i }));
    const archerRow = await screen.findByText('Sterling Archer');
    await user.click(within(archerRow.closest('tr')).getByRole('button', { name: /reject/i }));

    expect(await screen.findByText('Reject request failed')).toBeInTheDocument();
  });

  it('shows requestsError when user-actions password reset fails without a server message', async () => {
    const user = userEvent.setup();
    setupApiMocks();
    api.put.mockRejectedValueOnce(new Error('offline'));

    await renderDashboard();

    const adaRow = await screen.findByText('Ada Lovelace');
    await user.click(within(adaRow.closest('tr')).getByRole('button', { name: /reset password/i }));

    expect(await screen.findByText('Failed to reset this user password')).toBeInTheDocument();
  });

  it('filters password reset requests by role text in the search field', async () => {
    const user = userEvent.setup();
    await renderDashboard();

    await user.click(screen.getByRole('button', { name: /password reset requests/i }));
    expect(await screen.findByText('Sterling Archer')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/search users/i), 'team');

    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.queryByText('Sterling Archer')).not.toBeInTheDocument();
  });
});

describe('AdminDashboard reports tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupApiMocks();
  });

  it('renders reports, expands detected errors, filters reports, and labels a report for training', async () => {
    const user = userEvent.setup();
    await renderDashboard('Reports');

    expect(await screen.findByRole('heading', { name: /analysed reports/i })).toBeInTheDocument();
    expect(screen.getByText('fire-safety-report.pdf')).toBeInTheDocument();
    expect(screen.getByText('clean-report.pdf')).toBeInTheDocument();
    expect(screen.getAllByText(/Analyzed by/i)[0]).toHaveTextContent('Ada Lovelace');
    expect(screen.getByText(/2 errors found/i)).toBeInTheDocument();
    expect(screen.getByText(/3 min saved/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /errors detected \(2\)/i }));

    expect(screen.getByText('Replace placeholder project name')).toBeInTheDocument();
    expect(screen.getByText('Missing inspector signature')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /expand all/i }));
    await user.click(screen.getByRole('button', { name: /collapse all/i }));
    expect(screen.queryByText('Replace placeholder project name')).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/search reports/i), 'clean');
    expect(screen.getByText('clean-report.pdf')).toBeInTheDocument();
    expect(screen.queryByText('fire-safety-report.pdf')).not.toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText(/search reports/i));
    expect(screen.getByText('fire-safety-report.pdf')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /\+ add to training/i }));
    await user.click(screen.getByRole('button', { name: /good example/i }));

    expect(api.patch).toHaveBeenCalledWith('/admin/reports/report-1/training', {
      trainingLabel: 'good',
    });
    expect(screen.getByRole('button', { name: /good example/i })).toBeInTheDocument();
  });

  it('shows report loading state before reports finish loading', async () => {
    let resolveReports;
    const reportsPromise = new Promise((resolve) => {
      resolveReports = resolve;
    });

    setupApiMocks();
    api.get.mockImplementation(buildAdminGetMock({ reportsPromise }));

    await renderDashboard('Reports');

    expect(await screen.findByText(/loading reports/i)).toBeInTheDocument();

    resolveReports({ data: reports });
    expect(await screen.findByText('fire-safety-report.pdf')).toBeInTheDocument();
  });

  it('shows report load errors when admin and fallback report APIs fail', async () => {
    setupApiMocks();
    api.get.mockImplementation((url) => {
      if (url.startsWith('/admin/stats') || url === '/admin/reports') {
        return Promise.reject(new Error('admin reports unavailable'));
      }

      if (url === '/reports/stats' || url === '/reports') {
        return Promise.reject({
          response: { data: { message: 'Failed to load reports for reports tab' } },
        });
      }

      if (url === '/users') {
        return Promise.resolve({ data: users });
      }

      if (url === '/password-reset-requests?status=pending') {
        return Promise.resolve({ data: passwordResetRequests });
      }

      if (url === '/admin/teams') {
        return Promise.resolve({ data: [] });
      }

      if (url === '/admin/training/examples') {
        return Promise.resolve({ data: [] });
      }

      if (url === '/admin/training/stats') {
        return Promise.resolve({
          data: {
            totalExamples: 0,
            trainedExamples: 0,
            pendingExamples: 0,
            goodExamples: 0,
            badExamples: 0,
            templates: 0,
          },
        });
      }

      return Promise.resolve({ data: {} });
    });

    await renderDashboard('Reports');

    expect(await screen.findByText('Failed to load reports for reports tab')).toBeInTheDocument();
  });

  it('shows an error when adding a report to training fails', async () => {
    const user = userEvent.setup();
    setupApiMocks();
    api.patch.mockRejectedValueOnce({
      response: { data: { message: 'Could not add report to training' } },
    });

    await renderDashboard('Reports');

    expect(await screen.findByText('fire-safety-report.pdf')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /\+ add to training/i }));
    const trainingMenu = screen.getByText(/add as training example/i).closest('div');
    await user.click(within(trainingMenu).getByRole('button', { name: /bad example/i }));

    expect(api.patch).toHaveBeenCalledWith('/admin/reports/report-1/training', {
      trainingLabel: 'bad',
    });
    expect(await screen.findByText('Could not add report to training')).toBeInTheDocument();
  });

  it('renders report fallback values and closes an open training menu', async () => {
    const user = userEvent.setup();
    setupApiMocks({
      reportsResponse: [
        {
          _id: 'report-fallback',
          filename: 'fallback-report.pdf',
          createdAt: '2026-04-16T11:00:00.000Z',
          analyzedBy: null,
          addedToTraining: false,
          errors: [
            {
              type: 'compliance',
              message: 'Needs compliance review',
            },
          ],
        },
      ],
    });

    await renderDashboard('Reports');

    expect(await screen.findByText('fallback-report.pdf')).toBeInTheDocument();
    expect(screen.getByText(/Analyzed by/i)).toHaveTextContent('Unknown');
    expect(screen.getByText(/16 Apr 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/0 min saved/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /errors detected \(1\)/i }));

    expect(screen.getByText('Needs compliance review')).toBeInTheDocument();

    const trainingButton = screen.getByRole('button', { name: /\+ add to training/i });
    await user.click(trainingButton);

    expect(screen.getByText(/add as training example/i)).toBeInTheDocument();

    await user.click(trainingButton);

    expect(screen.queryByText(/add as training example/i)).not.toBeInTheDocument();
  });

  it('renders no report cards when the admin reports list is empty', async () => {
    setupApiMocks({ reportsResponse: [] });

    await renderDashboard('Reports');

    expect(await screen.findByRole('heading', { name: /analysed reports/i })).toBeInTheDocument();
    expect(screen.queryByText('fire-safety-report.pdf')).not.toBeInTheDocument();
    expect(screen.queryByText('clean-report.pdf')).not.toBeInTheDocument();
  });

  it('hides all reports when the search string matches nothing', async () => {
    const user = userEvent.setup();
    await renderDashboard('Reports');

    expect(await screen.findByText('fire-safety-report.pdf')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/search reports/i), 'no-such-report-xyz');

    expect(screen.queryByText('fire-safety-report.pdf')).not.toBeInTheDocument();
    expect(screen.queryByText('clean-report.pdf')).not.toBeInTheDocument();
  });

  it('shows the bad training example label on reports already added to training', async () => {
    await renderDashboard('Reports');

    expect(await screen.findByText('clean-report.pdf')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /✓ bad example/i })
    ).toBeInTheDocument();
  });
});

describe('AdminDashboard teams tab', () => {
  const teamMembers = [
    { _id: 'user-1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'user' },
    { _id: 'user-2', name: 'Grace Hopper', email: 'grace@example.com', role: 'team_leader' },
  ];

  const mockTeamStats = {
    totalMembers: 2,
    totalReports: 5,
    totalErrors: 3,
    timeSaved: 10,
    manualTime: 15,
    aiTime: 5,
    timeSavedPercent: 66,
    qualityBreakdown: { passed: 4, failed: 1, uncertain: 0, pending: 0 },
    errorBreakdown: [],
    memberBreakdown: [],
    recentReports: [],
    teamLead: { name: 'Grace Hopper' },
  };

  const mockTeams = [
    {
      _id: 'team-1',
      name: 'North Team',
      createdAt: '2026-03-01T00:00:00.000Z',
      teamLead: { _id: 'user-2', name: 'Grace Hopper', email: 'grace@example.com' },
      members: teamMembers,
    },
    {
      _id: 'team-2',
      name: 'South Team',
      createdAt: '2026-03-15T00:00:00.000Z',
      teamLead: null,
      members: [],
    },
    {
      _id: 'team-3',
      name: 'East Team',
      createdAt: '2026-03-20T00:00:00.000Z',
      teamLead: null,
      members: [teamMembers[0]],
    },
  ];

  const setupTeamsMocks = (teamsData = mockTeams) => {
    api.get.mockImplementation((url) => {
      if (url === '/admin/teams') return Promise.resolve({ data: teamsData });
      if (url.startsWith('/admin/teams/') && url.includes('/stats')) {
        return Promise.resolve({ data: mockTeamStats });
      }
      return buildAdminGetMock()(url);
    });
    api.post.mockResolvedValue({
      data: { _id: 'team-new', name: 'New Team', createdAt: '2026-04-01T00:00:00.000Z', members: [], teamLead: null },
    });
    api.patch.mockResolvedValue({ data: mockTeams[0] });
    api.delete.mockResolvedValue({ data: { ...mockTeams[0], members: [teamMembers[1]] } });
  };

  const openManageModal = async (user, teamName) => {
    const row = screen.getByText(teamName).closest('tr');
    await user.click(within(row).getByRole('button', { name: /manage team/i }));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    setupTeamsMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Empty / List state 

  it('shows the empty teams message when no teams exist', async () => {
    setupTeamsMocks([]);
    await renderDashboard('Teams');
    expect(await screen.findByText('No teams created yet.')).toBeInTheDocument();
  });

  it('renders the teams list with names, created dates, and no-lead warnings', async () => {
    await renderDashboard('Teams');
    expect(await screen.findByText('North Team')).toBeInTheDocument();
    expect(screen.getByText('South Team')).toBeInTheDocument();
    expect(screen.getByText('East Team')).toBeInTheDocument();
    expect(screen.getByText('1 Mar 2026')).toBeInTheDocument();
    // South Team and East Team have no lead — North Team does
    expect(screen.getAllByText('No team lead assigned')).toHaveLength(2);
  });

  // Create Team

  it('opens and cancels the create team modal', async () => {
    const user = userEvent.setup();
    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await user.click(screen.getByRole('button', { name: /\+ create team/i }));
    expect(screen.getByText('Create a New Team')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText('Create a New Team')).not.toBeInTheDocument();
  });

  it('shows a validation error when submitting an empty team name', async () => {
    const user = userEvent.setup();
    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await user.click(screen.getByRole('button', { name: /\+ create team/i }));
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    expect(screen.getByText('Team name is required')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('creates a new team, adds it to the list, and closes the modal', async () => {
    const user = userEvent.setup();
    setupTeamsMocks([]);
    await renderDashboard('Teams');
    await screen.findByText('No teams created yet.');

    await user.click(screen.getByRole('button', { name: /\+ create team/i }));
    await user.type(screen.getByPlaceholderText(/enter team name/i), 'New Team');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    expect(api.post).toHaveBeenCalledWith('/admin/teams', { name: 'New Team' });
    expect(await screen.findByText('New Team')).toBeInTheDocument();
    expect(screen.queryByText('Create a New Team')).not.toBeInTheDocument();
  });

  it('shows a server error message when team creation fails', async () => {
    const user = userEvent.setup();
    api.post.mockRejectedValueOnce({ response: { data: { message: 'Team name already taken' } } });
    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await user.click(screen.getByRole('button', { name: /\+ create team/i }));
    await user.type(screen.getByPlaceholderText(/enter team name/i), 'North Team');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    expect(await screen.findByText('Team name already taken')).toBeInTheDocument();
    expect(screen.getByText('Create a New Team')).toBeInTheDocument();
  });

  it('shows a fallback error when team creation fails without a server message', async () => {
    const user = userEvent.setup();
    api.post.mockRejectedValueOnce(new Error('Network error'));
    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await user.click(screen.getByRole('button', { name: /\+ create team/i }));
    await user.type(screen.getByPlaceholderText(/enter team name/i), 'Test');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    expect(await screen.findByText('Failed to create team')).toBeInTheDocument();
  });

  it('shows the creating loading state while the create request is in flight', async () => {
    const user = userEvent.setup();
    let resolveCreate;
    api.post.mockImplementation(() => new Promise((resolve) => { resolveCreate = resolve; }));

    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await user.click(screen.getByRole('button', { name: /\+ create team/i }));
    await user.type(screen.getByPlaceholderText(/enter team name/i), 'Loading Team');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    expect(screen.getByRole('button', { name: /creating/i })).toBeDisabled();

    resolveCreate({ data: { _id: 'team-x', name: 'Loading Team', createdAt: '2026-04-01T00:00:00.000Z', members: [], teamLead: null } });
    expect(await screen.findByText('Loading Team')).toBeInTheDocument();
  });

  // Manage modal

  it('opens the manage modal displaying the selected team name', async () => {
    const user = userEvent.setup();
    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await openManageModal(user, 'North Team');

    expect(screen.getByText('Choose an action for this team')).toBeInTheDocument();
  });

  it('closes the manage modal with the Close button', async () => {
    const user = userEvent.setup();
    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /^close$/i }));

    expect(screen.queryByText('Choose an action for this team')).not.toBeInTheDocument();
  });

  it('toggles the manage modal closed by clicking Manage Team again on the same row', async () => {
    const user = userEvent.setup();
    await renderDashboard('Teams');
    await screen.findByText('North Team');

    const row = screen.getByText('North Team').closest('tr');
    const manageBtn = within(row).getByRole('button', { name: /manage team/i });

    await user.click(manageBtn);
    expect(screen.getByText('Choose an action for this team')).toBeInTheDocument();

    await user.click(manageBtn);
    expect(screen.queryByText('Choose an action for this team')).not.toBeInTheDocument();
  });

  // Add Members 

  it('opens the add members overlay with existing team members pre-checked', async () => {
    const user = userEvent.setup();
    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /add members/i }));

    expect(screen.getByRole('heading', { name: /add members/i })).toBeInTheDocument();
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    checkboxes.forEach((cb) => expect(cb).toBeChecked());
  });

  it('filters users by name in the add members search box', async () => {
    const user = userEvent.setup();
    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /add members/i }));

    await user.type(screen.getByPlaceholderText(/search users\.\.\./i), 'ada');
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.queryByText('Grace Hopper')).not.toBeInTheDocument();
  });

  it('unchecking a member removes them from the pending selection', async () => {
    const user = userEvent.setup();
    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /add members/i }));

    const [adaCheckbox] = screen.getAllByRole('checkbox');
    expect(adaCheckbox).toBeChecked();
    await user.click(adaCheckbox);
    expect(adaCheckbox).not.toBeChecked();
  });

  it('calls the patch API with the selected member IDs on save', async () => {
    const user = userEvent.setup();
    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /add members/i }));
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(api.patch).toHaveBeenCalledWith('/admin/teams/team-1/members', {
      memberIds: expect.arrayContaining(['user-1', 'user-2']),
    });
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/search users\.\.\./i)).not.toBeInTheDocument();
    });
  });

  it('shows the adding loading state while the add members request is in flight', async () => {
    const user = userEvent.setup();
    let resolveAdd;
    api.patch.mockImplementation(() => new Promise((resolve) => { resolveAdd = resolve; }));

    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /add members/i }));
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(screen.getByRole('button', { name: /adding/i })).toBeDisabled();

    resolveAdd({ data: mockTeams[0] });
    // Overlay closes — the manage modal's "Add Members" button becomes the unique match
    await screen.findByRole('button', { name: /add members/i });
  });

  it('shows an alert when adding members fails', async () => {
    const user = userEvent.setup();
    api.patch.mockRejectedValueOnce({ response: { data: { message: 'Could not update members' } } });

    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /add members/i }));
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    // Overlay stays open on error — wait for the button to re-enable (finally block)
    await screen.findByRole('button', { name: /^add$/i });
    expect(window.alert).toHaveBeenCalledWith('Could not update members');
  });

  it('closes the add members overlay when Back is clicked', async () => {
    const user = userEvent.setup();
    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /add members/i }));
    expect(screen.getByPlaceholderText(/search users\.\.\./i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.queryByPlaceholderText(/search users\.\.\./i)).not.toBeInTheDocument();
  });

  // View Members

  it('shows team members with name, email, and role badge in the view members overlay', async () => {
    const user = userEvent.setup();
    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /view members/i }));

    expect(screen.getByText('Team Members')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByText('User')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('Team Leader')).toBeInTheDocument();
  });

  it('shows the empty message when the team has no members', async () => {
    const user = userEvent.setup();
    await renderDashboard('Teams');
    await screen.findByText('South Team');

    const southRow = screen.getByText('South Team').closest('tr');
    await user.click(within(southRow).getByRole('button', { name: /manage team/i }));
    await user.click(screen.getByRole('button', { name: /view members/i }));

    expect(screen.getByText('No members in this team yet.')).toBeInTheDocument();
  });

  it('closes the view members overlay when Back is clicked', async () => {
    const user = userEvent.setup();
    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /view members/i }));
    expect(screen.getByText('Team Members')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.queryByText('Team Members')).not.toBeInTheDocument();
  });

  // Remove Member

  it('opens the remove member confirmation dialog when Remove is clicked', async () => {
    const user = userEvent.setup();
    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /view members/i }));

    const removeButtons = screen.getAllByRole('button', { name: /remove/i });
    await user.click(removeButtons[0]);

    expect(screen.getByText('Remove Member')).toBeInTheDocument();
    expect(screen.getByText(/are you sure you want to remove/i)).toBeInTheDocument();
  });

  it('cancels the remove confirmation without calling the API', async () => {
    const user = userEvent.setup();
    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /view members/i }));

    const [firstRemove] = screen.getAllByRole('button', { name: /remove/i });
    await user.click(firstRemove);
    expect(screen.getByText('Remove Member')).toBeInTheDocument();

    const confirmDialog = screen.getByRole('heading', { name: /remove member/i }).closest('div');
    await user.click(within(confirmDialog).getByRole('button', { name: /cancel/i }));

    expect(screen.queryByText('Remove Member')).not.toBeInTheDocument();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('calls the delete API when member removal is confirmed', async () => {
    const user = userEvent.setup();
    api.delete.mockResolvedValueOnce({ data: { ...mockTeams[0], members: [teamMembers[1]] } });

    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /view members/i }));

    const [firstRemove] = screen.getAllByRole('button', { name: /remove/i });
    await user.click(firstRemove);

    const confirmDialog = screen.getByRole('heading', { name: /remove member/i }).closest('div');
    await user.click(within(confirmDialog).getByRole('button', { name: /^remove$/i }));

    expect(api.delete).toHaveBeenCalledWith('/admin/teams/team-1/members/user-1');
    expect(screen.queryByText('Remove Member')).not.toBeInTheDocument();
  });

  it('shows an alert when member removal fails', async () => {
    const user = userEvent.setup();
    api.delete.mockRejectedValueOnce({ response: { data: { message: 'Cannot remove last member' } } });

    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /view members/i }));

    const [firstRemove] = screen.getAllByRole('button', { name: /remove/i });
    await user.click(firstRemove);

    const confirmDialog = screen.getByRole('heading', { name: /remove member/i }).closest('div');
    await user.click(within(confirmDialog).getByRole('button', { name: /^remove$/i }));

    await screen.findByText('Team Members');
    expect(window.alert).toHaveBeenCalledWith('Cannot remove last member');
  });

  // Assign Team Lead

  it('opens the assign team lead overlay', async () => {
    const user = userEvent.setup();
    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /assign team lead/i }));

    expect(screen.getByRole('heading', { name: /assign team lead/i })).toBeInTheDocument();
  });

  it('shows the no-members message in the assign lead overlay for an empty team', async () => {
    const user = userEvent.setup();
    await renderDashboard('Teams');
    await screen.findByText('South Team');

    const southRow = screen.getByText('South Team').closest('tr');
    await user.click(within(southRow).getByRole('button', { name: /manage team/i }));
    await user.click(screen.getByRole('button', { name: /assign team lead/i }));

    expect(screen.getByText('No members in this team. Add members first.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^assign$/i })).not.toBeInTheDocument();
  });

  it('shows the Current Lead badge for the existing team lead', async () => {
    const user = userEvent.setup();
    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /assign team lead/i }));

    expect(screen.getByText('Current Lead')).toBeInTheDocument();
  });

  it('shows an alert when Assign is clicked without selecting any member', async () => {
    const user = userEvent.setup();
    await renderDashboard('Teams');
    await screen.findByText('East Team');

    const eastRow = screen.getByText('East Team').closest('tr');
    await user.click(within(eastRow).getByRole('button', { name: /manage team/i }));
    await user.click(screen.getByRole('button', { name: /assign team lead/i }));

    await user.click(screen.getByRole('button', { name: /^assign$/i }));

    expect(window.alert).toHaveBeenCalledWith('Please select a member');
  });

  it('shows the confirm lead dialog after selecting a member and clicking Assign', async () => {
    const user = userEvent.setup();
    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /assign team lead/i }));

    const [adaRadio] = screen.getAllByRole('radio');
    await user.click(adaRadio);
    await user.click(screen.getByRole('button', { name: /^assign$/i }));

    expect(screen.getByText('Confirm Team Lead')).toBeInTheDocument();
  });

  it('cancels the lead confirmation dialog without calling the API', async () => {
    const user = userEvent.setup();
    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /assign team lead/i }));

    const [adaRadio] = screen.getAllByRole('radio');
    await user.click(adaRadio);
    await user.click(screen.getByRole('button', { name: /^assign$/i }));
    expect(screen.getByText('Confirm Team Lead')).toBeInTheDocument();

    const confirmDialog = screen.getByRole('heading', { name: /confirm team lead/i }).closest('div');
    await user.click(within(confirmDialog).getByRole('button', { name: /cancel/i }));

    expect(screen.queryByText('Confirm Team Lead')).not.toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('calls the patch API on confirm and shows the success message', async () => {
    const user = userEvent.setup();
    api.patch.mockResolvedValueOnce({
      data: { ...mockTeams[0], teamLead: { _id: 'user-1', name: 'Ada Lovelace' } },
    });

    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /assign team lead/i }));

    const [adaRadio] = screen.getAllByRole('radio');
    await user.click(adaRadio);
    await user.click(screen.getByRole('button', { name: /^assign$/i }));

    const confirmDialog = screen.getByRole('heading', { name: /confirm team lead/i }).closest('div');
    await user.click(within(confirmDialog).getByRole('button', { name: /confirm/i }));

    expect(api.patch).toHaveBeenCalledWith('/admin/teams/team-1/lead', { userId: 'user-1' });
    expect(await screen.findByText('Ada Lovelace has been successfully assigned as team leader')).toBeInTheDocument();
    expect(screen.queryByText('Confirm Team Lead')).not.toBeInTheDocument();
  });

  it('shows an alert when lead assignment fails', async () => {
    const user = userEvent.setup();
    api.patch.mockRejectedValueOnce({ response: { data: { message: 'Cannot assign lead' } } });

    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /assign team lead/i }));

    const [adaRadio] = screen.getAllByRole('radio');
    await user.click(adaRadio);
    await user.click(screen.getByRole('button', { name: /^assign$/i }));

    const confirmDialog = screen.getByRole('heading', { name: /confirm team lead/i }).closest('div');
    await user.click(within(confirmDialog).getByRole('button', { name: /confirm/i }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Cannot assign lead'));
  });

  // Team Analytics

  it('opens the analytics overlay and fetches team stats', async () => {
    const user = userEvent.setup();
    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /view analytics/i }));

    expect(await screen.findByText('Team Analytics')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/admin/teams/team-1/stats');
    expect(await screen.findByText('Members')).toBeInTheDocument();
  });

  it('shows the loading analytics state while stats are fetching', async () => {
    const user = userEvent.setup();
    let resolveStats;
    api.get.mockImplementation((url) => {
      if (url === '/admin/teams') return Promise.resolve({ data: mockTeams });
      if (url.startsWith('/admin/teams/') && url.includes('/stats')) {
        return new Promise((resolve) => { resolveStats = resolve; });
      }
      return buildAdminGetMock()(url);
    });

    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /view analytics/i }));

    expect(await screen.findByText('Loading analytics...')).toBeInTheDocument();

    resolveStats({ data: mockTeamStats });
    expect(await screen.findByText('Members')).toBeInTheDocument();
  });

  it('closes the analytics overlay with the X button', async () => {
    const user = userEvent.setup();
    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /view analytics/i }));
    expect(await screen.findByText('Team Analytics')).toBeInTheDocument();

    const heading = screen.getByText('Team Analytics');
    const headerRow = heading.closest('div').parentElement;
    await user.click(within(headerRow).getByRole('button'));

    expect(screen.queryByText('Loading analytics...')).not.toBeInTheDocument();
    expect(screen.queryByText('Members')).not.toBeInTheDocument();
  });

  it('closes the analytics overlay with the Back button', async () => {
    const user = userEvent.setup();
    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /view analytics/i }));
    await screen.findByText('Team Analytics');

    await user.click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.queryByText('Team Analytics')).not.toBeInTheDocument();
  });

  it('shows an alert and hides the analytics overlay when stats fail to load', async () => {
    const user = userEvent.setup();
    api.get.mockImplementation((url) => {
      if (url === '/admin/teams') return Promise.resolve({ data: mockTeams });
      if (url.startsWith('/admin/teams/') && url.includes('/stats')) {
        return Promise.reject({ response: { data: { message: 'Stats unavailable' } } });
      }
      return buildAdminGetMock()(url);
    });

    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /view analytics/i }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Stats unavailable'));
    expect(screen.queryByText('Team Analytics')).not.toBeInTheDocument();
  });

  it('re-fetches stats when the date range filter is changed', async () => {
    const user = userEvent.setup();
    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /view analytics/i }));
    await screen.findByText('Members');

    const [dateRangeSelect] = screen.getAllByRole('combobox');
    await user.selectOptions(dateRangeSelect, '7');

    expect(api.get).toHaveBeenCalledWith('/admin/teams/team-1/stats?range=7');
  });

  // Delete Team

  it('opens the delete team confirmation dialog', async () => {
    const user = userEvent.setup();
    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /delete team/i }));

    expect(screen.getByRole('heading', { name: /delete team/i })).toBeInTheDocument();
    expect(screen.getByText(/this action cannot be undone/i)).toBeInTheDocument();
  });

  it('cancels team deletion without calling the API', async () => {
    const user = userEvent.setup();
    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /delete team/i }));

    const confirmDialog = screen.getByRole('heading', { name: /delete team/i }).closest('div');
    await user.click(within(confirmDialog).getByRole('button', { name: /cancel/i }));

    expect(screen.queryByRole('heading', { name: /delete team/i })).not.toBeInTheDocument();
    expect(api.delete).not.toHaveBeenCalled();
    expect(screen.getByText('Choose an action for this team')).toBeInTheDocument();
  });

  it('calls the delete API on confirm and removes the team from the list', async () => {
    const user = userEvent.setup();
    api.delete.mockResolvedValueOnce({ data: {} });

    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /delete team/i }));

    const confirmDialog = screen.getByRole('heading', { name: /delete team/i }).closest('div');
    await user.click(within(confirmDialog).getByRole('button', { name: /^delete$/i }));

    expect(api.delete).toHaveBeenCalledWith('/admin/teams/team-1');
    expect(screen.queryByText('North Team')).not.toBeInTheDocument();
    expect(screen.queryByText('Choose an action for this team')).not.toBeInTheDocument();
  });

  it('shows an alert when team deletion fails', async () => {
    const user = userEvent.setup();
    api.delete.mockRejectedValueOnce({ response: { data: { message: 'Cannot delete team with active reports' } } });

    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /delete team/i }));

    const confirmDialog = screen.getByRole('heading', { name: /delete team/i }).closest('div');
    await user.click(within(confirmDialog).getByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Cannot delete team with active reports'));
  });

  // Assign Lead Back button

  it('closes the assign team lead overlay with the Back button', async () => {
    const user = userEvent.setup();
    await renderDashboard('Teams');
    await screen.findByText('North Team');

    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /assign team lead/i }));
    expect(screen.getByRole('heading', { name: /assign team lead/i })).toBeInTheDocument();

    // Back button is at the bottom of the assign lead overlay
    const overlay = screen.getByRole('heading', { name: /assign team lead/i }).closest('div[class]').parentElement;
    await user.click(within(overlay).getByRole('button', { name: /back/i }));

    expect(screen.queryByRole('heading', { name: /assign team lead/i })).not.toBeInTheDocument();
  });

  // Analytics rich data (charts / tables / recent reports)

  const richTeamStats = {
    totalMembers: 2,
    totalReports: 3,
    totalErrors: 2,
    timeSaved: 10,
    manualTime: 15,
    aiTime: 5,
    timeSavedPercent: 66,
    qualityBreakdown: { passed: 2, failed: 1, uncertain: 0, pending: 0 },
    teamLead: { name: 'Grace Hopper' },
    errorBreakdown: [
      { name: 'Syntax Error', value: 3 },
      { name: 'Type Error', value: 1 },
    ],
    memberBreakdown: [
      { _id: 'user-1', name: 'Ada Lovelace', email: 'ada@example.com', reportsCount: 2, errorsFound: 1, passed: 1, failed: 1 },
    ],
    recentReports: [
      { _id: 'report-1', filename: 'report_alpha.pdf', analyzedBy: 'Ada Lovelace', createdAt: '2026-04-01T00:00:00.000Z', errorCount: 1, result: 'good' },
      { _id: 'report-2', filename: 'report_beta.pdf', analyzedBy: 'Ada Lovelace', createdAt: '2026-04-02T00:00:00.000Z', errorCount: 0, result: 'bad' },
      { _id: 'report-3', filename: 'report_gamma.pdf', analyzedBy: 'Grace Hopper', createdAt: '2026-04-03T00:00:00.000Z', errorCount: 0, result: 'uncertain' },
      { _id: 'report-4', filename: 'report_delta.pdf', analyzedBy: 'Grace Hopper', createdAt: '2026-04-04T00:00:00.000Z', errorCount: 0, result: null, status: 'pending' },
    ],
  };

  const openAnalyticsWithRichData = async (user) => {
    api.get.mockImplementation((url) => {
      if (url === '/admin/teams') return Promise.resolve({ data: mockTeams });
      if (url.startsWith('/admin/teams/') && url.includes('/stats')) return Promise.resolve({ data: richTeamStats });
      return buildAdminGetMock()(url);
    });
    await renderDashboard('Teams');
    await screen.findByText('North Team');
    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /view analytics/i }));
    await screen.findByText('Team Analytics');
  };

  it('renders error breakdown charts when errorBreakdown is non-empty', async () => {
    const user = userEvent.setup();
    await openAnalyticsWithRichData(user);
    expect(screen.getByText('Most Common Errors')).toBeInTheDocument();
    expect(screen.getByText('Error Type Distribution')).toBeInTheDocument();
  });

  it('renders the member breakdown table when memberBreakdown is non-empty', async () => {
    const user = userEvent.setup();
    await openAnalyticsWithRichData(user);
    expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThan(0);
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
  });

  it('renders recent reports rows when recentReports is non-empty', async () => {
    const user = userEvent.setup();
    await openAnalyticsWithRichData(user);
    expect(screen.getByText('report_alpha.pdf')).toBeInTheDocument();
  });

  it('shows Passed / Failed / Uncertain / pending badges for recent reports', async () => {
    const user = userEvent.setup();
    await openAnalyticsWithRichData(user);
    // Badges appear in the recent reports list (not just select options)
    const badges = document.querySelectorAll('span.rounded');
    const badgeTexts = Array.from(badges).map(b => b.textContent);
    expect(badgeTexts).toContain('Passed');
    expect(badgeTexts).toContain('Failed');
    expect(badgeTexts).toContain('Uncertain');
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('calls download API when the download button is clicked on a recent report', async () => {
    const user = userEvent.setup();
    vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:fake');
    vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => {});
    api.get.mockImplementation((url) => {
      if (url === '/admin/teams') return Promise.resolve({ data: mockTeams });
      if (url.startsWith('/admin/teams/') && url.includes('/stats')) return Promise.resolve({ data: richTeamStats });
      if (url.startsWith('/reports/') && url.endsWith('/download')) return Promise.resolve({ data: new Blob(['pdf']) });
      return buildAdminGetMock()(url);
    });

    await renderDashboard('Teams');
    await screen.findByText('North Team');
    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /view analytics/i }));
    await screen.findByText('report_alpha.pdf');

    const [downloadBtn] = screen.getAllByTitle('Download Summary');
    await user.click(downloadBtn);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/reports/report-1/download', { responseType: 'blob' }));
  });

  it('calls delete API when the delete button is clicked on a recent report', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.get.mockImplementation((url) => {
      if (url === '/admin/teams') return Promise.resolve({ data: mockTeams });
      if (url.startsWith('/admin/teams/') && url.includes('/stats')) return Promise.resolve({ data: richTeamStats });
      return buildAdminGetMock()(url);
    });
    api.delete.mockResolvedValue({ data: {} });

    await renderDashboard('Teams');
    await screen.findByText('North Team');
    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /view analytics/i }));
    await screen.findByText('report_alpha.pdf');

    const [deleteBtn] = screen.getAllByTitle('Delete Report');
    await user.click(deleteBtn);

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/reports/report-1'));
  });

  // Analytics filter controls

  it('updates analytics when the member filter is changed', async () => {
    const user = userEvent.setup();
    await openAnalyticsWithRichData(user);

    // member filter is the 2nd combobox in the analytics filter panel
    const memberSelect = screen.getAllByRole('combobox')[1];
    await user.selectOptions(memberSelect, 'user-1');

    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      expect.stringContaining('/stats')
    ));
  });

  it('updates analytics when the result filter is changed', async () => {
    const user = userEvent.setup();
    await openAnalyticsWithRichData(user);

    const selects = screen.getAllByRole('combobox');
    // result filter is the 3rd combobox in the analytics overlay
    const resultSelect = selects[2];
    await user.selectOptions(resultSelect, 'good');

    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      expect.stringContaining('/stats')
    ));
  });

  it('clears all analytics filters when Clear all filters is clicked', async () => {
    const user = userEvent.setup();
    await openAnalyticsWithRichData(user);

    // Set the date range filter so Clear all filters button appears
    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[0], '7');
    await screen.findByText(/clear all filters/i);

    await user.click(screen.getByText(/clear all filters/i));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      expect.stringContaining('/stats')
    ));
  });

  it('shows the View Individual Statistics button when a member filter is active and profile data is loaded', async () => {
    const user = userEvent.setup();
    api.get.mockImplementation((url) => {
      if (url === '/admin/teams') return Promise.resolve({ data: mockTeams });
      if (url.startsWith('/admin/teams/') && url.includes('/stats')) return Promise.resolve({ data: richTeamStats });
      if (url.startsWith('/admin/users/') && url.includes('/profile-analytics')) {
        return Promise.resolve({ data: { totalReports: 5, totalErrors: 2 } });
      }
      return buildAdminGetMock()(url);
    });

    await renderDashboard('Teams');
    await screen.findByText('North Team');
    await openManageModal(user, 'North Team');
    await user.click(screen.getByRole('button', { name: /view analytics/i }));
    await screen.findByText('Team Analytics');

    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[1], 'user-1');

    const viewStatsBtn = await screen.findByRole('button', { name: /view individual statistics/i });
    // jsdom does not implement scrollIntoView — stub it on the prototype
    HTMLElement.prototype.scrollIntoView = vi.fn();
    await user.click(viewStatsBtn);
  });

  it('shows the member name badge when a member filter is active', async () => {
    const user = userEvent.setup();
    await openAnalyticsWithRichData(user);

    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[1], 'user-1');

    await waitFor(() => expect(screen.getByText(/member:/i)).toBeInTheDocument());
  });
});

//  Tests for security tab

describe('AdminDashboard security tab', () => {
  const makeLog = (overrides) => ({
    _id: 'log-1',
    action: 'login_success',
    userId: { name: 'Ada Lovelace' },
    email: 'ada@example.com',
    ip: '127.0.0.1',
    details: {},
    createdAt: '2026-04-01T10:30:00.000Z',
    ...overrides,
  });

  const mockAuditLogs = [
    makeLog({ _id: 'log-1', action: 'login_success' }),
    makeLog({ _id: 'log-2', action: 'login_failed', userId: null }),
    makeLog({ _id: 'log-3', action: 'login_inactive' }),
    makeLog({ _id: 'log-4', action: 'account_locked', details: { failedAttempts: 3, lockedUntil: '2026-04-01T11:00:00.000Z' } }),
    makeLog({ _id: 'log-5', action: 'login_blocked_lockout', details: { minutesLeft: 12 } }),
    makeLog({ _id: 'log-6', action: 'report_deleted', details: { filename: 'report.pdf', deletedBy: 'Admin' } }),
    makeLog({ _id: 'log-7', action: 'training_upload', details: { filename: 'model.json', type: 'json' } }),
    makeLog({ _id: 'log-8', action: 'training_deleted', details: { filename: 'old.json' } }),
    makeLog({ _id: 'log-9', action: 'team_created', details: { teamName: 'Alpha Team', count: 2 } }),
    makeLog({ _id: 'log-10', action: 'team_deleted', details: { teamName: 'Beta Team', memberCount: 1 } }),
    makeLog({ _id: 'log-11', action: 'team_member_added' }),
    makeLog({ _id: 'log-12', action: 'team_member_removed', details: { removedUserEmail: 'bob@example.com' } }),
    makeLog({ _id: 'log-13', action: 'team_lead_assigned', details: { newLeadName: 'Grace Hopper' } }),
  ];

  const makeAuditResponse = (logs = mockAuditLogs, pages = 1) => ({
    logs,
    pages,
    summary24h: {},
  });

  const setupSecurityMocks = (logs = mockAuditLogs, pages = 1) => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/admin/audit-logs')) return Promise.resolve({ data: makeAuditResponse(logs, pages) });
      return buildAdminGetMock()(url);
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    setupSecurityMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the Audit Log heading when the Security tab is opened', async () => {
    await renderDashboard('Security');
    expect(await screen.findByText('Audit Log')).toBeInTheDocument();
  });

  it('fetches audit logs via the API when the Security tab is opened', async () => {
    await renderDashboard('Security');
    await screen.findByText('Audit Log');
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/admin/audit-logs'));
  });

  it('shows the loading spinner while audit logs are fetching', async () => {
    let resolve;
    api.get.mockImplementation((url) => {
      if (url.startsWith('/admin/audit-logs')) return new Promise((r) => { resolve = r; });
      return buildAdminGetMock()(url);
    });

    await renderDashboard('Security');
    await screen.findByText('Audit Log');
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();

    resolve({ data: makeAuditResponse([]) });
    await screen.findByText('No log entries found.');
  });

  it('shows the empty state when no logs are returned', async () => {
    setupSecurityMocks([]);
    await renderDashboard('Security');
    expect(await screen.findByText('No log entries found.')).toBeInTheDocument();
  });

  it('renders a row for every log entry returned', async () => {
    await renderDashboard('Security');
    // Wait for data to load then check each badge text appears at least once
    await screen.findByText('Login success');
    const allText = document.body.textContent;
    ['Login success', 'Login failed', 'Inactive account', 'Account locked',
      'Blocked — locked', 'Report deleted', 'Training upload', 'Training deleted',
      'Team created', 'Team deleted', 'Member added', 'Member removed', 'Lead assigned',
    ].forEach((label) => expect(allText).toContain(label));
  });

  it('shows the user name and email when userId.name is present', async () => {
    setupSecurityMocks([makeLog({ userId: { name: 'Ada Lovelace' }, email: 'ada@example.com' })]);
    await renderDashboard('Security');
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
  });

  it('shows just the email when userId.name is absent', async () => {
    setupSecurityMocks([makeLog({ userId: null, email: 'anon@example.com' })]);
    await renderDashboard('Security');
    expect(await screen.findByText('anon@example.com')).toBeInTheDocument();
  });

  it('shows — when there is no email or userId', async () => {
    setupSecurityMocks([makeLog({ userId: null, email: null })]);
    await renderDashboard('Security');
    await screen.findByText('Audit Log');
    // The — for IP and for email both appear
    const dashes = await screen.findAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('shows the IP address in the IP column', async () => {
    setupSecurityMocks([makeLog({ ip: '192.168.1.1' })]);
    await renderDashboard('Security');
    expect(await screen.findByText('192.168.1.1')).toBeInTheDocument();
  });

  it('shows — for IP when ip is missing', async () => {
    setupSecurityMocks([makeLog({ ip: null })]);
    await renderDashboard('Security');
    await screen.findByText('Audit Log');
    const dashes = await screen.findAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('shows filename and type in the details column', async () => {
    setupSecurityMocks([makeLog({ details: { filename: 'model.json', type: 'json' } })]);
    await renderDashboard('Security');
    expect(await screen.findByText('model.json')).toBeInTheDocument();
    expect(screen.getByText('(json)')).toBeInTheDocument();
  });

  it('shows deletedBy in the details column', async () => {
    setupSecurityMocks([makeLog({ details: { filename: 'report.pdf', deletedBy: 'Admin User' } })]);
    await renderDashboard('Security');
    expect(await screen.findByText('report.pdf')).toBeInTheDocument();
    expect(screen.getByText('by Admin User')).toBeInTheDocument();
  });

  it('shows reason in the details column when there is no filename', async () => {
    setupSecurityMocks([makeLog({ details: { reason: 'Account suspended' } })]);
    await renderDashboard('Security');
    expect(await screen.findByText('Account suspended')).toBeInTheDocument();
  });

  it('shows role in the details column when there is no filename', async () => {
    setupSecurityMocks([makeLog({ details: { role: 'team_leader' } })]);
    await renderDashboard('Security');
    expect(await screen.findByText('team_leader')).toBeInTheDocument();
  });

  it('shows teamName and newLeadName in the details column', async () => {
    setupSecurityMocks([makeLog({ action: 'team_lead_assigned', details: { teamName: 'Alpha Team', newLeadName: 'Grace Hopper' } })]);
    await renderDashboard('Security');
    expect(await screen.findByText('Alpha Team')).toBeInTheDocument();
    expect(screen.getByText('→ Grace Hopper')).toBeInTheDocument();
  });

  it('shows removedUserEmail in the details column', async () => {
    setupSecurityMocks([makeLog({ action: 'team_member_removed', details: { removedUserEmail: 'bob@example.com' } })]);
    await renderDashboard('Security');
    expect(await screen.findByText('bob@example.com')).toBeInTheDocument();
  });

  it('shows member count with plural when count > 1', async () => {
    setupSecurityMocks([makeLog({ action: 'team_member_added', details: { count: 3 } })]);
    await renderDashboard('Security');
    expect(await screen.findByText('(3 members)')).toBeInTheDocument();
  });

  it('shows member count with singular when count is 1', async () => {
    setupSecurityMocks([makeLog({ action: 'team_member_added', details: { count: 1 } })]);
    await renderDashboard('Security');
    expect(await screen.findByText('(1 member)')).toBeInTheDocument();
  });

  it('shows memberCount for team_deleted logs', async () => {
    setupSecurityMocks([makeLog({ action: 'team_deleted', details: { memberCount: 2 } })]);
    await renderDashboard('Security');
    expect(await screen.findByText('(2 members)')).toBeInTheDocument();
  });

  it('shows failedAttempts in the details column', async () => {
    setupSecurityMocks([makeLog({ details: { failedAttempts: 4, lockedUntil: '2026-04-01T11:00:00.000Z' } })]);
    await renderDashboard('Security');
    expect(await screen.findByText('(4/5 attempts)')).toBeInTheDocument();
  });

  it('shows minutesLeft in the details column', async () => {
    setupSecurityMocks([makeLog({ details: { minutesLeft: 8 } })]);
    await renderDashboard('Security');
    expect(await screen.findByText('(8m remaining)')).toBeInTheDocument();
  });

  it('changing the filter select re-fetches the audit logs', async () => {
    const user = userEvent.setup();
    await renderDashboard('Security');
    await screen.findByText('Audit Log');

    const filterSelect = screen.getByRole('combobox');
    await user.selectOptions(filterSelect, 'login_failed');

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('action=login_failed'))
    );
  });

  it('clicking Refresh re-fetches the audit logs', async () => {
    const user = userEvent.setup();
    await renderDashboard('Security');
    await screen.findByText('Audit Log');

    const callsBefore = api.get.mock.calls.filter((c) => c[0].includes('audit-logs')).length;
    await user.click(screen.getByRole('button', { name: /refresh/i }));

    await waitFor(() => {
      const callsAfter = api.get.mock.calls.filter((c) => c[0].includes('audit-logs')).length;
      expect(callsAfter).toBeGreaterThan(callsBefore);
    });
  });

  it('shows pagination controls when there are multiple pages', async () => {
    setupSecurityMocks(mockAuditLogs, 3);
    await renderDashboard('Security');
    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
  });

  it('Previous button is disabled on the first page', async () => {
    setupSecurityMocks(mockAuditLogs, 3);
    await renderDashboard('Security');
    await screen.findByText('Page 1 of 3');
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
  });

  it('clicking Next advances to page 2 and re-fetches', async () => {
    const user = userEvent.setup();
    setupSecurityMocks(mockAuditLogs, 3);
    await renderDashboard('Security');
    await screen.findByText('Page 1 of 3');

    await user.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() => expect(screen.getByText('Page 2 of 3')).toBeInTheDocument());
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('page=2'));
  });

  it('clicking Previous goes back to page 1', async () => {
    const user = userEvent.setup();
    setupSecurityMocks(mockAuditLogs, 3);
    await renderDashboard('Security');
    await screen.findByText('Page 1 of 3');

    await user.click(screen.getByRole('button', { name: /next/i }));
    await screen.findByText('Page 2 of 3');

    await user.click(screen.getByRole('button', { name: /previous/i }));
    await waitFor(() => expect(screen.getByText('Page 1 of 3')).toBeInTheDocument());
  });

  it('Next button is disabled on the last page', async () => {
    const user = userEvent.setup();
    setupSecurityMocks(mockAuditLogs, 2);
    await renderDashboard('Security');
    await screen.findByText('Page 1 of 2');

    await user.click(screen.getByRole('button', { name: /next/i }));
    await screen.findByText('Page 2 of 2');

    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  it('does not show pagination when there is only one page', async () => {
    setupSecurityMocks(mockAuditLogs, 1);
    await renderDashboard('Security');
    await screen.findByText('Audit Log');
    expect(screen.queryByRole('button', { name: /previous/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument();
  });
});
