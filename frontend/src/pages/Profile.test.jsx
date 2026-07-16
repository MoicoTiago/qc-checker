import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../services/api';
import Profile from './Profile';

const profileAuth = vi.hoisted(() => {
  const defaultUser = {
    _id: 'user-1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    role: 'user',
    team: 'team-1',
  };

  let user = { ...defaultUser };

  return {
    resetUser: () => {
      user = { ...defaultUser };
    },
    setUser: (partial) => {
      user = { ...user, ...partial };
    },
    useAuth: () => ({
      user,
      isAuthenticated: true,
      logout: vi.fn(),
    }),
  };
});

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => profileAuth.useAuth(),
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
  const Tooltip = ({ formatter, labelFormatter }) => {
    if (formatter) {
      formatter(42, 'Pass Rate', {});
      formatter(7, 'Other', {});
      formatter(88);
    }

    if (labelFormatter) {
      labelFormatter('Apr 2026', [
        {
          payload: {
            analyzedCount: 2,
            passedCount: 1,
            date: '18 Apr 2026',
            fullLabel: 'fire-safety-report.pdf',
          },
        },
      ]);
      labelFormatter('Fallback label', []);
      labelFormatter('Quality row', [
        {
          payload: {
            fullLabel: 'quality-report.pdf',
            date: '18 Apr 2026',
          },
        },
      ]);
      labelFormatter('Axis only', [{ payload: { shortLabel: 'truncated' } }]);
    }

    return <div />;
  };

  return {
    Bar: Chart,
    BarChart: Chart,
    CartesianGrid: Leaf,
    Cell: Leaf,
    Legend: Leaf,
    Line: Leaf,
    LineChart: Chart,
    ResponsiveContainer: Chart,
    Tooltip,
    XAxis: Leaf,
    YAxis: Leaf,
  };
});

const populatedAnalytics = {
  scope: 'all',
  summary: {
    totalReports: 4,
    analyzedReports: 3,
    pendingReports: 1,
    failedReports: 1,
    totalErrors: 5,
    averageErrorsPerReport: 1.67,
    totalTimeSaved: 8,
  },
  errorBreakdown: {
    placeholder: 2,
    consistency: 1,
    compliance: 1,
    formatting: 1,
    missing_data: 0,
  },
  qualityBreakdown: {
    good: 1,
    bad: 1,
    uncertain: 1,
  },
  trends: [
    {
      periodLabel: 'Apr 2026',
      reportCount: 4,
      errorCount: 5,
      analyzedCount: 3,
      passedCount: 1,
      failedCount: 1,
    },
  ],
  passFailRateTrends: [
    {
      periodLabel: 'Apr 2026',
      analyzedCount: 3,
      passedCount: 1,
      failedCount: 1,
      passRate: 33.3,
    },
  ],
  mostCommonErrorTypes: [
    { type: 'placeholder', count: 2, reportsAffected: 1 },
    { type: 'consistency', count: 1, reportsAffected: 1 },
    { type: 'custom_type', count: 1, reportsAffected: 1 },
  ],
  checklistFailureBreakdown: [
    { message: 'Replace placeholder project name', count: 2 },
    { message: 'Missing inspector signature', count: 1 },
  ],
  qualityScoreTrend: [
    {
      _id: 'report-1',
      filename: 'fire-safety-report.pdf',
      createdAt: '2026-04-18T12:00:00.000Z',
      qualityLabel: 'good',
      qualityScore: 91.2,
    },
    {
      _id: 'report-2',
      filename: 'uncertain-fire-safety-check.pdf',
      createdAt: '2026-04-19T12:00:00.000Z',
      qualityLabel: 'uncertain',
      qualityScore: 44,
    },
  ],
  recentReports: [
    {
      _id: 'report-1',
      filename: 'fire-safety-report.pdf',
      createdAt: '2026-04-18T12:00:00.000Z',
      status: 'analyzed',
      errorCount: 2,
      timeSaved: 4,
      qualityLabel: 'good',
      errorSummary: {
        placeholder: 2,
        consistency: 0,
        compliance: 0,
        formatting: 0,
        missing_data: 0,
      },
    },
    {
      _id: 'report-2',
      filename: 'failed-checklist.pdf',
      createdAt: '2026-04-17T12:00:00.000Z',
      status: 'analyzed',
      errorCount: 1,
      timeSaved: 2,
      qualityLabel: 'bad',
      errorSummary: {
        placeholder: 0,
        consistency: 1,
        compliance: 0,
        formatting: 0,
        missing_data: 0,
      },
    },
    {
      _id: 'report-3',
      filename: 'pending-review.pdf',
      createdAt: '2026-04-16T12:00:00.000Z',
      status: 'processing',
      errorCount: 0,
      timeSaved: 0,
      qualityLabel: null,
      errorSummary: {},
    },
    {
      _id: 'report-4',
      filename: 'unknown-quality.pdf',
      createdAt: '2026-04-15T12:00:00.000Z',
      status: 'analyzed',
      errorCount: 0,
      timeSaved: 2,
      qualityLabel: 'manual-review',
      errorSummary: {
        placeholder: 0,
        consistency: 0,
        compliance: 0,
        formatting: 0,
        missing_data: 0,
      },
    },
  ],
};

const emptyAnalytics = {
  ...populatedAnalytics,
  summary: {
    totalReports: 0,
    analyzedReports: 0,
    pendingReports: 0,
    failedReports: 0,
    totalErrors: 0,
    averageErrorsPerReport: 0,
    totalTimeSaved: 0,
  },
  errorBreakdown: {},
  qualityBreakdown: {},
  trends: [],
  passFailRateTrends: [],
  mostCommonErrorTypes: [],
  checklistFailureBreakdown: [],
  qualityScoreTrend: [],
  recentReports: [],
};

const analyticsWithoutOptionalRows = {
  ...populatedAnalytics,
  summary: {
    ...populatedAnalytics.summary,
    totalReports: 1,
    analyzedReports: 0,
  },
  checklistFailureBreakdown: [],
  qualityScoreTrend: [],
  recentReports: [],
};

/** Exercises optional chaining / nullish branches in summary cards, badges, charts, and expanded rows. */
const edgeCaseAnalytics = {
  scope: 'all',
  summary: {
    totalReports: null,
    analyzedReports: null,
    pendingReports: null,
    failedReports: null,
    totalErrors: null,
    averageErrorsPerReport: null,
    totalTimeSaved: null,
  },
  errorBreakdown: {
    placeholder: 1,
    consistency: 0,
    compliance: 0,
    formatting: 0,
    missing_data: 0,
  },
  trends: [],
  passFailRateTrends: [
    {
      periodLabel: 'Apr 2026',
      analyzedCount: 1,
      passedCount: 1,
      failedCount: 0,
      passRate: 100,
    },
  ],
  mostCommonErrorTypes: [{ type: 'rare_issue', count: 1, reportsAffected: 1 }],
  checklistFailureBreakdown: [{ message: `${'A'.repeat(30)} checklist`, count: 1 }],
  qualityScoreTrend: [
    {
      _id: 'qs-1',
      filename: 'very-long-quality-report-filename.pdf',
      createdAt: '2026-04-18T12:00:00.000Z',
      qualityLabel: 'good',
      qualityScore: null,
    },
    {
      _id: 'qs-2',
      filename: 'short.pdf',
      createdAt: '2026-04-19T12:00:00.000Z',
      qualityLabel: 'bad',
      qualityScore: 0,
    },
  ],
  recentReports: [
    {
      _id: 'edge-1',
      filename: 'pending-wait.pdf',
      createdAt: '2026-04-18T12:00:00.000Z',
      status: 'pending',
      errorCount: 0,
      qualityLabel: null,
      errorSummary: {},
    },
    {
      _id: 'edge-2',
      filename: 'failed-run.pdf',
      createdAt: '2026-04-17T12:00:00.000Z',
      status: 'failed',
      errorCount: 0,
      qualityLabel: null,
      errorSummary: {},
    },
    {
      _id: 'edge-3',
      filename: 'custom-status.pdf',
      createdAt: '2026-04-16T12:00:00.000Z',
      status: 'archived',
      errorCount: 2,
      qualityLabel: 'good',
      errorSummary: { placeholder: 1, consistency: 0, compliance: 0, formatting: 0, missing_data: 0 },
    },
    {
      _id: 'edge-4',
      filename: 'missing-status.pdf',
      createdAt: '2026-04-15T12:00:00.000Z',
      status: null,
      errorCount: 0,
      qualityLabel: null,
      errorSummary: null,
    },
  ],
};

const setupProfileAnalytics = (analytics = populatedAnalytics) => {
  api.get.mockImplementation((url, config) => {
    if (url === '/reports/profile-analytics') {
      return Promise.resolve({
        data: {
          ...analytics,
          scope: config?.params?.scope || analytics.scope,
        },
      });
    }

    return Promise.resolve({ data: {} });
  });
};

const renderProfile = () => {
  render(
    <MemoryRouter>
      <Profile />
    </MemoryRouter>
  );
};

describe('Profile page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    profileAuth.resetUser();
    setupProfileAnalytics();
  });

  it('renders account details and populated profile analytics', async () => {
    renderProfile();

    expect(screen.getByText(/loading analytics/i)).toBeInTheDocument();
    expect(await screen.findByText('fire-safety-report.pdf')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByText('Name:').closest('p')).toHaveTextContent('Ada Lovelace');
    expect(screen.getByText('Email:').closest('p')).toHaveTextContent('ada@example.com');
    expect(screen.getByText('Role:').closest('p')).toHaveTextContent('user');
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('8 min')).toBeInTheDocument();
    expect(screen.getByText('Failed Reports')).toBeInTheDocument();
    expect(screen.getByText('Passed Reviews')).toBeInTheDocument();
    expect(screen.getByText('2 errors')).toBeInTheDocument();
    expect(screen.getByText('1 error')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Uncertain')).toBeInTheDocument();
    expect(screen.getByText('18 Apr 2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view all/i })).toHaveAttribute('href', '/dashboard');
  });

  it('changes the analytics scope and fetches data for the new range', async () => {
    const user = userEvent.setup();
    renderProfile();

    expect(await screen.findByText('fire-safety-report.pdf')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/time range/i), 'month');

    await waitFor(() => {
      expect(api.get).toHaveBeenLastCalledWith('/reports/profile-analytics', {
        params: { scope: 'month' },
      });
    });
  });

  it('requests analytics for the week scope', async () => {
    const user = userEvent.setup();
    renderProfile();

    expect(await screen.findByText('fire-safety-report.pdf')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/time range/i), 'week');

    await waitFor(() => {
      expect(api.get).toHaveBeenLastCalledWith('/reports/profile-analytics', {
        params: { scope: 'week' },
      });
    });
  });

  it('submits a password reset request and shows the success state', async () => {
    const user = userEvent.setup();
    let resolveRequest;
    api.post.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );

    renderProfile();
    expect(await screen.findByText('fire-safety-report.pdf')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /request password reset/i }));

    expect(screen.getByRole('button', { name: /submitting/i })).toBeDisabled();

    resolveRequest({
      data: { message: 'Password reset request submitted for admin review' },
    });

    expect(
      await screen.findByText('Password reset request submitted for admin review')
    ).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/password-reset-requests');
  });

  it('shows a backend password reset error', async () => {
    const user = userEvent.setup();
    api.post.mockRejectedValue({
      response: { data: { message: 'Reset request already pending' } },
    });

    renderProfile();
    expect(await screen.findByText('fire-safety-report.pdf')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /request password reset/i }));

    expect(await screen.findByText('Reset request already pending')).toBeInTheDocument();
  });

  it('shows the fallback password reset error when no backend message is provided', async () => {
    const user = userEvent.setup();
    api.post.mockRejectedValue(new Error('network unavailable'));

    renderProfile();
    expect(await screen.findByText('fire-safety-report.pdf')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /request password reset/i }));

    expect(await screen.findByText('Failed to submit password reset request')).toBeInTheDocument();
  });

  it('shows the fallback password reset error when the response omits a message', async () => {
    const user = userEvent.setup();
    api.post.mockRejectedValue({ response: { data: {} } });

    renderProfile();
    expect(await screen.findByText('fire-safety-report.pdf')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /request password reset/i }));

    expect(await screen.findByText('Failed to submit password reset request')).toBeInTheDocument();
  });

  it('shows analytics API errors', async () => {
    api.get.mockRejectedValue({
      response: { data: { message: 'Profile analytics unavailable' } },
    });

    renderProfile();

    expect(await screen.findByText('Profile analytics unavailable')).toBeInTheDocument();
  });

  it('shows the fallback analytics error when no server message is returned', async () => {
    api.get.mockRejectedValue({ response: { data: {} } });

    renderProfile();

    expect(await screen.findByText('Failed to load profile analytics')).toBeInTheDocument();
  });

  it('shows the fallback analytics error when the request fails without a response', async () => {
    api.get.mockRejectedValue(new Error('network down'));

    renderProfile();

    expect(await screen.findByText('Failed to load profile analytics')).toBeInTheDocument();
  });

  it('shows the empty analytics state with a dashboard link', async () => {
    setupProfileAnalytics(emptyAnalytics);

    renderProfile();

    expect(await screen.findByText('No analytics yet')).toBeInTheDocument();
    expect(screen.getByText(/Upload your first report/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to dashboard/i })).toHaveAttribute(
      'href',
      '/dashboard'
    );
  });

  it('shows fallback panels when optional analytics collections are empty', async () => {
    setupProfileAnalytics(analyticsWithoutOptionalRows);

    renderProfile();

    expect(
      await screen.findByText('No analysed reports with quality scores yet.')
    ).toBeInTheDocument();
    expect(screen.getByText('No recurring checklist failures found yet.')).toBeInTheDocument();
    expect(screen.getByText('No recent reports to display.')).toBeInTheDocument();
    expect(screen.getAllByText('0')[0]).toBeInTheDocument();
  });

  it('expands and collapses recent report error summaries', async () => {
    const user = userEvent.setup();
    renderProfile();

    const reportButton = await screen.findByRole('button', { name: /fire-safety-report.pdf/i });

    await user.click(reportButton);

    const expandedRow = screen.getByRole('heading', { name: /error summary/i }).closest('tr');
    expect(within(expandedRow).getByText('Placeholder')).toBeInTheDocument();
    expect(within(expandedRow).getByText('Missing Data')).toBeInTheDocument();

    await user.click(reportButton);

    expect(screen.queryByRole('heading', { name: /error summary/i })).not.toBeInTheDocument();
  });

  it('renders sparse analytics, varied status badges, report links, and null error summaries', async () => {
    const user = userEvent.setup();
    setupProfileAnalytics(edgeCaseAnalytics);

    renderProfile();

    expect(await screen.findByText('pending-wait.pdf')).toBeInTheDocument();
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();

    const failedReportsCard = screen.getByText('Failed Reports').closest('div.rounded-xl');
    expect(within(failedReportsCard).getByText('0')).toBeInTheDocument();

    const passedReviewsCard = screen.getByText('Passed Reviews').closest('div.rounded-xl');
    expect(within(passedReviewsCard).getByText('0')).toBeInTheDocument();

    const viewLinks = screen.getAllByRole('link', { name: /^view$/i });
    expect(viewLinks.some((link) => link.getAttribute('href') === '/report/edge-1')).toBe(true);

    const missingStatusButton = screen.getByRole('button', { name: /missing-status.pdf/i });
    await user.click(missingStatusButton);

    const expandedRow = screen.getByRole('heading', { name: /error summary/i }).closest('tr');
    expect(within(expandedRow).getAllByText('0').length).toBeGreaterThan(0);
  });

  it('renders the name row without a value when the auth user has no name', async () => {
    profileAuth.setUser({ name: undefined });

    renderProfile();

    expect(await screen.findByText('fire-safety-report.pdf')).toBeInTheDocument();
    expect(screen.getByText('Name:').closest('p')).toHaveTextContent(/^Name:\s*$/);
  });
});
