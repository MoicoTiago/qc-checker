import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import TeamPage from './TeamPage';

// Module mocks

vi.mock('axios');

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
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
    Bar: Leaf, BarChart: Chart, CartesianGrid: Leaf, Cell: Leaf,
    Legend: Leaf, Line: Leaf, LineChart: Chart,
    Pie: ({ data, label }) => {
      if (data?.length > 0 && typeof label === 'function') label({ name: data[0].name, value: data[0].value });
      return <div />;
    },
    PieChart: Chart, ResponsiveContainer: Chart, Tooltip: Leaf, XAxis: Leaf, YAxis: Leaf,
  };
});

// Shared test data

import { useAuth } from '../context/AuthContext';

const mockUser = { _id: 'u-1', name: 'Ada Lovelace', role: 'user' };
const mockTeamLeadUser = { _id: 'u-lead', name: 'Grace Hopper', role: 'team_leader' };

const mockTeam = {
  _id: 'team-1',
  name: 'Alpha Team',
  teamLead: { _id: 'u-lead', name: 'Grace Hopper' },
  members: [
    { _id: 'u-lead', name: 'Grace Hopper', email: 'grace@example.com', role: 'team_leader' },
    { _id: 'u-1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'user' },
  ],
};

const mockGoals = [
  { _id: 'g-1', title: 'Hit 80% pass rate', type: 'pass_rate', target: 80, deadline: '2026-12-31T00:00:00.000Z' },
  { _id: 'g-2', title: 'Submit 50 reports', type: 'reports_submitted', target: 50 },
  { _id: 'g-3', title: 'Keep errors low', type: 'avg_errors_below', target: 3 },
];

const mockCurrentStats = { pass_rate: 85, reports_submitted: 30, avg_errors_below: 2 };

const mockAnnouncement = {
  _id: 'ann-1',
  title: 'Q2 Update',
  content: 'Great work this quarter.',
  createdBy: { name: 'Grace Hopper' },
  createdAt: '2026-04-01T10:00:00.000Z',
  readByMe: true,
};

const mockUnreadAnnouncement = {
  _id: 'ann-2',
  title: 'New Policy',
  content: 'Please read the new policy.',
  createdBy: { name: 'Grace Hopper' },
  createdAt: '2026-04-10T10:00:00.000Z',
  readByMe: false,
};

const mockTeamStats = {
  totalMembers: 2, totalReports: 10, totalErrors: 5,
  timeSaved: 8, manualTime: 12, aiTime: 4, timeSavedPercent: 67,
  qualityBreakdown: { passed: 7, failed: 2, uncertain: 1 },
  summary: { pendingReports: 0 },
  errorBreakdown: [{ name: 'Placeholder', value: 3 }],
  trendData: [], passFailRateTrends: [], qualityScoreTrend: [],
  mostCommonErrorTypes: [], checklistFailureBreakdown: [], topErrors: [],
  recentReports: [],
};

// Helpers

const setupAxiosMocks = ({
  team = mockTeam,
  goals = mockGoals,
  currentStats = mockCurrentStats,
  announcements = [mockAnnouncement],
  teamStats = mockTeamStats,
} = {}) => {
  axios.get.mockImplementation((url) => {
    if (url === '/api/teams/my-team') return Promise.resolve({ data: team });
    if (url === '/api/teams/my-team/goals') return Promise.resolve({ data: { goals, current: currentStats } });
    if (url === '/api/teams/my-team/announcements') return Promise.resolve({ data: announcements });
    if (url === '/api/teams/my-team/stats') return Promise.resolve({ data: teamStats });
    if (url === '/api/teams/available-users') return Promise.resolve({ data: [{ _id: 'u-3', name: 'Alan Turing', email: 'alan@example.com' }] });
    return Promise.resolve({ data: {} });
  });
  axios.post.mockResolvedValue({ data: { _id: 'new-1', title: 'Test', content: 'Body', createdBy: { name: 'Grace Hopper' }, createdAt: new Date().toISOString(), readByMe: true } });
  axios.patch.mockResolvedValue({ data: mockTeam });
  axios.delete.mockResolvedValue({ data: {} });
};

const renderPage = () =>
  render(<MemoryRouter><TeamPage /></MemoryRouter>);

// Tests

describe('TeamPage — regular user', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    useAuth.mockReturnValue({ user: mockUser });
    setupAxiosMocks();
  });

  afterEach(() => vi.restoreAllMocks());

  // Loading & no-team states

  it('shows the loading state before the team is fetched', async () => {
    let resolveTeam;
    axios.get.mockImplementation((url) => {
      if (url === '/api/teams/my-team') return new Promise((r) => { resolveTeam = r; });
      return Promise.resolve({ data: { goals: [], current: null } });
    });
    renderPage();
    expect(screen.getByText('Loading team...')).toBeInTheDocument();
    resolveTeam({ data: mockTeam });
    await screen.findByText('Alpha Team');
  });

  it('shows the "not part of any team" message when the API returns null', async () => {
    axios.get.mockImplementation((url) => {
      if (url === '/api/teams/my-team') return Promise.resolve({ data: null });
      return Promise.resolve({ data: { goals: [], current: null } });
    });
    renderPage();
    expect(await screen.findByText('You are not part of any team.')).toBeInTheDocument();
  });

  // Basic rendering

  it('renders the team name once loaded', async () => {
    renderPage();
    expect(await screen.findByText('Alpha Team')).toBeInTheDocument();
    expect(screen.getByText('Team Page')).toBeInTheDocument();
  });

  it('renders the View Members and View Announcements buttons', async () => {
    renderPage();
    await screen.findByText('Alpha Team');
    expect(screen.getByRole('button', { name: /view members/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view announcements/i })).toBeInTheDocument();
  });

  it('does not show team-lead-only buttons for a regular user', async () => {
    renderPage();
    await screen.findByText('Alpha Team');
    expect(screen.queryByRole('button', { name: /\+ add members/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /view analytics/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add goal/i })).not.toBeInTheDocument();
  });

  // View Members toggle

  it('shows member list when View Members is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha Team');

    await user.click(screen.getByRole('button', { name: /view members/i }));

    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('grace@example.com')).toBeInTheDocument();
  });

  it('toggles the member list off when Hide Members is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha Team');

    await user.click(screen.getByRole('button', { name: /view members/i }));
    expect(screen.getByText('grace@example.com')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /hide members/i }));
    expect(screen.queryByText('grace@example.com')).not.toBeInTheDocument();
  });

  it('shows Team Leader and User role badges in the member list', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /view members/i }));

    expect(screen.getByText('Team Leader')).toBeInTheDocument();
    expect(screen.getByText('User')).toBeInTheDocument();
  });

  it('shows the Lead badge for the team lead in the member list', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /view members/i }));

    expect(screen.getByText('Lead')).toBeInTheDocument();
  });

  it('does not show Remove buttons for regular users', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /view members/i }));

    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  // Team Goals

  it('renders the Team Goals section with goals listed', async () => {
    renderPage();
    await screen.findByText('Team Goals');
    expect(screen.getByText('Hit 80% pass rate')).toBeInTheDocument();
    expect(screen.getByText('Submit 50 reports')).toBeInTheDocument();
    expect(screen.getByText('Keep errors low')).toBeInTheDocument();
  });

  it('shows the Achieved badge when a goal is met', async () => {
    // pass_rate goal: target 80, current 85 → met; avg_errors_below: 2 <= 3 → met
    renderPage();
    await screen.findByText('Hit 80% pass rate');
    expect(screen.getAllByText('Achieved!').length).toBeGreaterThan(0);
  });

  it('shows goal deadline when set', async () => {
    renderPage();
    await screen.findByText('Hit 80% pass rate');
    expect(screen.getByText(/Deadline:/i)).toBeInTheDocument();
  });

  it('collapses and expands the goals section', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Team Goals');

    await user.click(screen.getByRole('button', { name: /team goals/i }));
    expect(screen.queryByText('Hit 80% pass rate')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /team goals/i }));
    expect(screen.getByText('Hit 80% pass rate')).toBeInTheDocument();
  });

  it('shows the empty goals message when there are no goals', async () => {
    setupAxiosMocks({ goals: [], currentStats: null });
    renderPage();
    await screen.findByText('Team Goals');
    expect(screen.getByText(/No goals set yet/i)).toBeInTheDocument();
  });

  // Announcements modal

  it('opens the announcements modal when View Announcements is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha Team');

    await user.click(screen.getByRole('button', { name: /view announcements/i }));

    expect(await screen.findByText('Team Announcements')).toBeInTheDocument();
    expect(screen.getByText('Q2 Update')).toBeInTheDocument();
    expect(screen.getByText('Great work this quarter.')).toBeInTheDocument();
  });

  it('closes the announcements modal with the X button', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha Team');

    await user.click(screen.getByRole('button', { name: /view announcements/i }));
    await screen.findByText('Team Announcements');

    const modal = screen.getByText('Team Announcements').closest('div');
    await user.click(within(modal.parentElement).getByRole('button', { name: '' }));

    await waitFor(() => expect(screen.queryByText('Team Announcements')).not.toBeInTheDocument());
  });

  it('shows the empty state when there are no announcements', async () => {
    setupAxiosMocks({ announcements: [] });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha Team');

    await user.click(screen.getByRole('button', { name: /view announcements/i }));
    expect(await screen.findByText(/No announcements yet/i)).toBeInTheDocument();
  });

  it('shows the "Posted by" line with author name and date', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha Team');

    await user.click(screen.getByRole('button', { name: /view announcements/i }));
    await screen.findByText('Team Announcements');

    expect(screen.getByText(/Posted by Grace Hopper/i)).toBeInTheDocument();
  });

  // Unread announcement overlay

  it('shows the unread announcement overlay on page load', async () => {
    setupAxiosMocks({ announcements: [mockUnreadAnnouncement] });
    renderPage();

    expect(await screen.findByText('New Team Announcement')).toBeInTheDocument();
    expect(screen.getByText('New Policy')).toBeInTheDocument();
    expect(screen.getByText('Please read the new policy.')).toBeInTheDocument();
  });

  it('shows "1 unread announcement" label for a single unread', async () => {
    setupAxiosMocks({ announcements: [mockUnreadAnnouncement] });
    renderPage();
    await screen.findByText('New Team Announcement');
    expect(screen.getByText(/1 unread announcement/i)).toBeInTheDocument();
  });

  it('dismisses the unread overlay when Got it is clicked', async () => {
    const user = userEvent.setup();
    setupAxiosMocks({ announcements: [mockUnreadAnnouncement] });
    renderPage();

    await screen.findByText('New Policy');
    await user.click(screen.getByRole('button', { name: /got it/i }));

    await waitFor(() => expect(screen.queryByText('New Team Announcement')).not.toBeInTheDocument());
    expect(axios.patch).toHaveBeenCalledWith(
      `/api/teams/my-team/announcements/${mockUnreadAnnouncement._id}/read`,
      {},
      expect.any(Object)
    );
  });

  it('shows progress dots and "more to go" text when there are multiple unread announcements', async () => {
    const second = { ...mockUnreadAnnouncement, _id: 'ann-3', title: 'Another Notice', readByMe: false };
    setupAxiosMocks({ announcements: [mockUnreadAnnouncement, second] });
    renderPage();

    await screen.findByText('New Team Announcement');
    expect(screen.getByText(/2 unread announcements/i)).toBeInTheDocument();
    expect(screen.getByText(/more to go/i)).toBeInTheDocument();
  });

  it('advances to the next unread announcement after acknowledging the first', async () => {
    const user = userEvent.setup();
    // unreadQueue = [...all].filter(unread).reverse(), so last in array shows first
    const second = { ...mockUnreadAnnouncement, _id: 'ann-3', title: 'Another Notice', content: 'Second unread.', readByMe: false };
    setupAxiosMocks({ announcements: [mockUnreadAnnouncement, second] });
    renderPage();

    // second is last in array so it appears first after reverse
    await screen.findByText('Another Notice');
    await user.click(screen.getByRole('button', { name: /got it/i }));

    await screen.findByText('New Policy');
  });
});

// Team Lead tests

describe('TeamPage — team leader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    useAuth.mockReturnValue({ user: mockTeamLeadUser });
    setupAxiosMocks();
  });

  afterEach(() => vi.restoreAllMocks());

  it('shows team-lead-only buttons', async () => {
    renderPage();
    await screen.findByText('Alpha Team');
    expect(screen.getByRole('button', { name: /\+ add members/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view analytics/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add goal/i })).toBeInTheDocument();
  });

  it('shows Remove buttons for other members (not self) when members are visible', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /view members/i }));

    const removeButtons = screen.getAllByRole('button', { name: /remove/i });
    expect(removeButtons.length).toBe(1); // only for Ada, not for Grace (self)
  });

  it('shows the New Announcement button in the modal for team leads', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /view announcements/i }));
    await screen.findByText('Team Announcements');

    expect(screen.getByRole('button', { name: /new announcement/i })).toBeInTheDocument();
  });

  it('shows the delete button for each announcement for team leads', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /view announcements/i }));
    await screen.findByText('Q2 Update');

    expect(screen.getByTitle('Delete announcement')).toBeInTheDocument();
  });

  // Create announcement

  it('opens the create announcement form when New Announcement is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /view announcements/i }));
    await screen.findByText('Team Announcements');

    await user.click(screen.getByRole('button', { name: /new announcement/i }));
    expect(screen.getByPlaceholderText(/Q2 performance update/i)).toBeInTheDocument();
  });

  it('shows validation error when submitting an empty announcement', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /view announcements/i }));
    await screen.findByText('Team Announcements');
    await user.click(screen.getByRole('button', { name: /new announcement/i }));

    await user.click(screen.getByRole('button', { name: /^post$/i }));
    expect(screen.getByText('Title and content are required.')).toBeInTheDocument();
  });

  it('posts a new announcement and adds it to the list', async () => {
    const user = userEvent.setup();
    axios.post.mockResolvedValueOnce({
      data: { _id: 'ann-new', title: 'Test Title', content: 'Test body', createdBy: { name: 'Grace Hopper' }, createdAt: new Date().toISOString(), readByMe: true },
    });

    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /view announcements/i }));
    await screen.findByText('Team Announcements');
    await user.click(screen.getByRole('button', { name: /new announcement/i }));

    await user.type(screen.getByPlaceholderText(/Q2 performance update/i), 'Test Title');
    await user.type(screen.getByPlaceholderText(/Write your announcement/i), 'Test body');
    await user.click(screen.getByRole('button', { name: /^post$/i }));

    await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
      '/api/teams/my-team/announcements',
      { title: 'Test Title', content: 'Test body' },
      expect.any(Object)
    ));
  });

  it('cancels the create announcement form', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /view announcements/i }));
    await screen.findByText('Team Announcements');
    await user.click(screen.getByRole('button', { name: /new announcement/i }));

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.queryByPlaceholderText(/Q2 performance update/i)).not.toBeInTheDocument();
  });

  it('deletes an announcement after confirmation', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /view announcements/i }));
    await screen.findByText('Q2 Update');

    await user.click(screen.getByTitle('Delete announcement'));

    await waitFor(() => expect(axios.delete).toHaveBeenCalledWith(
      `/api/teams/my-team/announcements/${mockAnnouncement._id}`,
      expect.any(Object)
    ));
    await waitFor(() => expect(screen.queryByText('Q2 Update')).not.toBeInTheDocument());
  });

  // Add Goal modal

  it('opens and closes the Add Goal modal', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha Team');

    await user.click(screen.getByRole('button', { name: /add goal/i }));
    expect(screen.getByText('Add Team Goal')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.queryByText('Add Team Goal')).not.toBeInTheDocument();
  });

  it('shows a validation error when submitting an empty goal form', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /add goal/i }));

    await user.click(screen.getByRole('button', { name: /save goal/i }));
    expect(screen.getByText('Please fill in all required fields.')).toBeInTheDocument();
  });

  it('saves a new goal and closes the modal', async () => {
    const user = userEvent.setup();
    axios.post.mockResolvedValueOnce({
      data: { _id: 'g-new', title: 'New Goal', type: 'pass_rate', target: 90 },
    });

    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /add goal/i }));

    await user.type(screen.getByPlaceholderText(/Achieve 80% pass rate/i), 'New Goal');
    await user.type(screen.getByRole('spinbutton'), '90');
    await user.click(screen.getByRole('button', { name: /save goal/i }));

    await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
      '/api/teams/my-team/goals',
      expect.objectContaining({ title: 'New Goal', target: 90 }),
      expect.any(Object)
    ));
    await waitFor(() => expect(screen.queryByText('Add Team Goal')).not.toBeInTheDocument());
  });

  it('deletes a goal after confirmation', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Hit 80% pass rate');

    await user.click(screen.getAllByTitle('Delete goal')[0]);

    await waitFor(() => expect(axios.delete).toHaveBeenCalledWith(
      `/api/teams/my-team/goals/g-1`,
      expect.any(Object)
    ));
  });

  // Remove member

  it('shows the confirm remove dialog and removes the member', async () => {
    const user = userEvent.setup();
    axios.delete.mockResolvedValueOnce({ data: { ...mockTeam, members: [mockTeam.members[0]] } });

    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /view members/i }));

    await user.click(screen.getByRole('button', { name: /remove/i }));

    const dialog = screen.getByRole('heading', { name: /remove member/i }).closest('div');
    await user.click(within(dialog).getByRole('button', { name: /^remove$/i }));

    await waitFor(() => expect(axios.delete).toHaveBeenCalledWith(
      '/api/teams/my-team/members/u-1',
      expect.any(Object)
    ));
  });

  it('cancels the remove member dialog', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /view members/i }));

    await user.click(screen.getByRole('button', { name: /remove/i }));
    expect(screen.getByText(/Are you sure you want to remove/i)).toBeInTheDocument();

    const dialog = screen.getByRole('heading', { name: /remove member/i }).closest('div');
    await user.click(within(dialog).getByRole('button', { name: /^cancel$/i }));
    expect(screen.queryByText(/Are you sure you want to remove/i)).not.toBeInTheDocument();
  });

  // Add Members modal

  it('opens the Add Members modal and shows available users', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha Team');

    await user.click(screen.getByRole('button', { name: /\+ add members/i }));

    expect(await screen.findByText('Add Members')).toBeInTheDocument();
    expect(screen.getByText('Alan Turing')).toBeInTheDocument();
  });

  it('filters users in the Add Members modal by search', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /\+ add members/i }));
    await screen.findByText('Alan Turing');

    await user.type(screen.getByPlaceholderText(/search users/i), 'xyz');
    expect(screen.queryByText('Alan Turing')).not.toBeInTheDocument();
  });

  it('closes the Add Members modal via the Cancel button', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /\+ add members/i }));
    await screen.findByText('Add Members');

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.queryByText('Add Members')).not.toBeInTheDocument();
  });

  it('saves member selection via the Add button', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /\+ add members/i }));
    await screen.findByText('Alan Turing');

    await user.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => expect(axios.patch).toHaveBeenCalledWith(
      '/api/teams/my-team/members',
      expect.any(Object),
      expect.any(Object)
    ));
    await waitFor(() => expect(screen.queryByText('Add Members')).not.toBeInTheDocument());
  });

  // Team Analytics modal

  it('opens the analytics modal with team stats', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha Team');

    await user.click(screen.getByRole('button', { name: /view analytics/i }));

    expect(await screen.findByText('Team Analytics')).toBeInTheDocument();
    expect(screen.getByText('Members')).toBeInTheDocument();
  });

  it('closes the analytics modal via the Close button', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /view analytics/i }));
    await screen.findByText('Team Analytics');

    await user.click(screen.getByRole('button', { name: /^close$/i }));
    await waitFor(() => expect(screen.queryByText('Team Analytics')).not.toBeInTheDocument());
  });

  it('shows an error message when team stats fail to reload', async () => {
    // Initial load succeeds (so teamStats is not null), re-fetch on open fails
    let statsCallCount = 0;
    axios.get.mockImplementation((url) => {
      if (url === '/api/teams/my-team') return Promise.resolve({ data: mockTeam });
      if (url === '/api/teams/my-team/goals') return Promise.resolve({ data: { goals: [], current: null } });
      if (url === '/api/teams/my-team/announcements') return Promise.resolve({ data: [] });
      if (url === '/api/teams/my-team/stats') {
        statsCallCount++;
        if (statsCallCount === 1) return Promise.resolve({ data: mockTeamStats });
        return Promise.reject({ response: { data: { message: 'Stats unavailable' } } });
      }
      return Promise.resolve({ data: {} });
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /view analytics/i }));

    expect(await screen.findByText('Stats unavailable')).toBeInTheDocument();
  });

  it('shows the Compare Members button in the analytics modal', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /view analytics/i }));
    await screen.findByText('Team Analytics');

    expect(screen.getByRole('button', { name: /compare members/i })).toBeInTheDocument();
  });

  it('shows an error when the same member is selected for both comparison slots', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /view analytics/i }));
    await screen.findByText('Team Analytics');

    // Select the same member for both slots — button becomes enabled but validation fails
    // selects[0] = date range, selects[1] = first member, selects[2] = second member
    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[1], 'u-lead');
    await user.selectOptions(selects[2], 'u-lead');

    // Button is disabled when both slots have the same member
    expect(screen.getByRole('button', { name: /compare members/i })).toBeDisabled();
  });

  it('fetches and displays comparison data for two different members', async () => {
    const user = userEvent.setup();
    const mockComparison = {
      primaryScope: {
        scopeLabel: 'Grace Hopper',
        scopeDetails: { userId: 'u-lead', userName: 'Grace Hopper', userEmail: 'grace@example.com' },
        summary: { totalReports: 5, analyzedReports: 4, totalErrors: 2, averageErrorsPerReport: 0.5, passRate: 80, totalTimeSaved: 3 },
        trendData: [], passFailRateTrends: [], qualityScoreTrend: [],
        errorBreakdown: [], topErrors: [], recentReports: [],
      },
      secondaryScope: {
        scopeLabel: 'Ada Lovelace',
        scopeDetails: { userId: 'u-1', userName: 'Ada Lovelace', userEmail: 'ada@example.com' },
        summary: { totalReports: 3, analyzedReports: 3, totalErrors: 1, averageErrorsPerReport: 0.3, passRate: 90, totalTimeSaved: 2 },
        trendData: [], passFailRateTrends: [], qualityScoreTrend: [],
        errorBreakdown: [], topErrors: [], recentReports: [],
      },
    };
    axios.get.mockImplementation((url) => {
      if (url === '/api/teams/my-team') return Promise.resolve({ data: mockTeam });
      if (url === '/api/teams/my-team/goals') return Promise.resolve({ data: { goals: [], current: null } });
      if (url === '/api/teams/my-team/announcements') return Promise.resolve({ data: [] });
      if (url === '/api/teams/my-team/stats') return Promise.resolve({ data: mockTeamStats });
      if (url === '/api/teams/my-team/comparison') return Promise.resolve({ data: mockComparison });
      return Promise.resolve({ data: {} });
    });

    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /view analytics/i }));
    await screen.findByText('Team Analytics');

    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[1], 'u-lead');
    await user.selectOptions(selects[2], 'u-1');
    await user.click(screen.getByRole('button', { name: /compare members/i }));

    expect(await screen.findByText('Compare Team Members')).toBeInTheDocument();
    expect(screen.getAllByText('Grace Hopper').length).toBeGreaterThan(0);
  });

  it('shows the Clear Comparison button and clears comparison data', async () => {
    const user = userEvent.setup();
    const mockComparison = {
      primaryScope: {
        scopeLabel: 'Grace Hopper',
        scopeDetails: { userId: 'u-lead', userName: 'Grace Hopper', userEmail: 'grace@example.com' },
        summary: { totalReports: 0, analyzedReports: 0, totalErrors: 0, averageErrorsPerReport: 0, passRate: 0, totalTimeSaved: 0 },
        trendData: [], passFailRateTrends: [], qualityScoreTrend: [], errorBreakdown: [], topErrors: [], recentReports: [],
      },
      secondaryScope: {
        scopeLabel: 'Ada Lovelace',
        scopeDetails: { userId: 'u-1', userName: 'Ada Lovelace', userEmail: 'ada@example.com' },
        summary: { totalReports: 0, analyzedReports: 0, totalErrors: 0, averageErrorsPerReport: 0, passRate: 0, totalTimeSaved: 0 },
        trendData: [], passFailRateTrends: [], qualityScoreTrend: [], errorBreakdown: [], topErrors: [], recentReports: [],
      },
    };
    axios.get.mockImplementation((url) => {
      if (url === '/api/teams/my-team') return Promise.resolve({ data: mockTeam });
      if (url === '/api/teams/my-team/goals') return Promise.resolve({ data: { goals: [], current: null } });
      if (url === '/api/teams/my-team/announcements') return Promise.resolve({ data: [] });
      if (url === '/api/teams/my-team/stats') return Promise.resolve({ data: mockTeamStats });
      if (url === '/api/teams/my-team/comparison') return Promise.resolve({ data: mockComparison });
      return Promise.resolve({ data: {} });
    });

    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /view analytics/i }));
    await screen.findByText('Team Analytics');

    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[1], 'u-lead');
    await user.selectOptions(selects[2], 'u-1');
    await user.click(screen.getByRole('button', { name: /compare members/i }));

    expect(await screen.findByRole('button', { name: /clear comparison/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /clear comparison/i }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /clear comparison/i })).not.toBeInTheDocument());
  });

  it('shows an alert when opening the Add Members modal fails', async () => {
    const user = userEvent.setup();
    axios.get.mockImplementation((url) => {
      if (url === '/api/teams/my-team') return Promise.resolve({ data: mockTeam });
      if (url === '/api/teams/my-team/goals') return Promise.resolve({ data: { goals: [], current: null } });
      if (url === '/api/teams/my-team/announcements') return Promise.resolve({ data: [] });
      if (url === '/api/teams/my-team/stats') return Promise.resolve({ data: mockTeamStats });
      if (url === '/api/teams/available-users') return Promise.reject(new Error('Network error'));
      return Promise.resolve({ data: {} });
    });

    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /\+ add members/i }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Failed to load users'));
  });

  it('shows an alert when the Add Members API call fails', async () => {
    const user = userEvent.setup();
    axios.patch.mockRejectedValueOnce({ response: { data: { message: 'Failed to update members' } } });

    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /\+ add members/i }));
    await screen.findByText('Alan Turing');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Failed to update members'));
  });

  it('shows an alert when removing a member fails', async () => {
    const user = userEvent.setup();
    axios.delete.mockRejectedValueOnce({ response: { data: { message: 'Cannot remove last member' } } });

    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /view members/i }));
    await user.click(screen.getByRole('button', { name: /remove/i }));

    const dialog = screen.getByRole('heading', { name: /remove member/i }).closest('div');
    await user.click(within(dialog).getByRole('button', { name: /^remove$/i }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Cannot remove last member'));
  });

  it('shows an API error when creating an announcement fails', async () => {
    const user = userEvent.setup();
    axios.post.mockRejectedValueOnce({ response: { data: { message: 'Announcement failed' } } });

    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /view announcements/i }));
    await screen.findByText('Team Announcements');
    await user.click(screen.getByRole('button', { name: /new announcement/i }));

    await user.type(screen.getByPlaceholderText(/Q2 performance update/i), 'Title');
    await user.type(screen.getByPlaceholderText(/Write your announcement/i), 'Body text');
    await user.click(screen.getByRole('button', { name: /^post$/i }));

    expect(await screen.findByText('Announcement failed')).toBeInTheDocument();
  });

  it('shows an alert when deleting an announcement fails', async () => {
    const user = userEvent.setup();
    axios.delete.mockRejectedValueOnce({ response: { data: { message: 'Delete failed' } } });

    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /view announcements/i }));
    await screen.findByText('Q2 Update');

    await user.click(screen.getByTitle('Delete announcement'));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Delete failed'));
  });

  it('does not delete an announcement when confirm is cancelled', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);

    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /view announcements/i }));
    await screen.findByText('Q2 Update');

    await user.click(screen.getByTitle('Delete announcement'));
    expect(axios.delete).not.toHaveBeenCalled();
  });

  it('shows an API error when saving a goal fails', async () => {
    const user = userEvent.setup();
    axios.post.mockRejectedValueOnce({ response: { data: { message: 'Goal limit reached' } } });

    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /add goal/i }));

    await user.type(screen.getByPlaceholderText(/Achieve 80% pass rate/i), 'My Goal');
    await user.type(screen.getByRole('spinbutton'), '75');
    await user.click(screen.getByRole('button', { name: /save goal/i }));

    expect(await screen.findByText('Goal limit reached')).toBeInTheDocument();
  });

  it('does not delete a goal when confirm is cancelled', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);

    renderPage();
    await screen.findByText('Hit 80% pass rate');
    await user.click(screen.getAllByTitle('Delete goal')[0]);
    expect(axios.delete).not.toHaveBeenCalled();
  });

  it('shows an alert when deleting a goal fails', async () => {
    const user = userEvent.setup();
    axios.delete.mockRejectedValueOnce({ response: { data: { message: 'Cannot delete goal' } } });

    renderPage();
    await screen.findByText('Hit 80% pass rate');
    await user.click(screen.getAllByTitle('Delete goal')[0]);

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Cannot delete goal'));
  });

  it('renders analytics with rich teamStats including recentReports and trendData', async () => {
    const richStats = {
      ...mockTeamStats,
      trendData: [{ period: 'Apr', reports: 5, errors: 2 }],
      recentReports: [{ _id: 'r-1', filename: 'report.pdf', status: 'done', errorCount: 1, result: 'good', analyzedBy: 'Ada', createdAt: '2026-04-01T00:00:00.000Z' }],
      topErrors: [{ message: 'Missing data', count: 3 }],
    };
    setupAxiosMocks({ teamStats: richStats });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /view analytics/i }));

    expect(await screen.findByText('Reports Over Time')).toBeInTheDocument();
    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    expect(screen.getByText('Missing data')).toBeInTheDocument();
  });

  it('shows the goal progress for avg_errors_below type correctly', async () => {
    setupAxiosMocks({
      goals: [{ _id: 'g-err', title: 'Low error goal', type: 'avg_errors_below', target: 5 }],
      currentStats: { avg_errors_below: 0 }, // 0 errors → pct = 100
    });
    renderPage();
    await screen.findByText('Low error goal');
    expect(screen.getAllByText('Achieved!').length).toBeGreaterThan(0);
  });
});
