import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import api from '../services/api';
import Settings from './Settings';

vi.mock('../services/api', () => ({
  default: {
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
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
        (str, [k, v]) => str.replace(new RegExp(`{{${k}}}`, 'g'), v), value
      );
    }
    return value;
  };
  return { useLanguage: () => ({ t, language: 'en', toggleLanguage: () => {} }) };
});
vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));

import { useAuth } from '../context/AuthContext';

const mockUser = {
  _id: 'user-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  role: 'user',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastLogin: '2026-04-22T10:00:00.000Z',
};

const mockPreferences = {
  theme: 'light',
  highContrast: false,
  fontSize: 100,
  colorblindMode: 'none',
  reducedMotion: false,
  notifications: {
    teamAssignment: true,
    teamRemoval: true,
    reportComplete: true,
    weeklySummary: false,
  },
};

const mockUpdatePreferences = vi.fn();
const mockUpdateUser = vi.fn();
const mockLogout = vi.fn();

const renderPage = () =>
  render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>
  );

describe('Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({
      user: mockUser,
      preferences: mockPreferences,
      updatePreferences: mockUpdatePreferences,
      updateUser: mockUpdateUser,
      logout: mockLogout,
    });
    mockUpdatePreferences.mockResolvedValue({});
  });

  afterEach(() => vi.restoreAllMocks());

  // Page structure

  it('renders the settings title', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('renders all four sidebar navigation sections', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /^account$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /display/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^notifications$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /data/i })).toBeInTheDocument();
  });

  // Account section (default)

  it('shows the Account section by default', () => {
    renderPage();
    expect(screen.getByDisplayValue('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByDisplayValue('ada@example.com')).toBeInTheDocument();
  });

  it('shows the user role and status', () => {
    renderPage();
    expect(screen.getByText(/active/i)).toBeInTheDocument();
  });

  it('saves the profile and shows a success message', async () => {
    const user = userEvent.setup();
    api.put.mockResolvedValueOnce({ data: { user: { ...mockUser, name: 'Ada Updated' } } });
    renderPage();

    const nameInput = screen.getByDisplayValue('Ada Lovelace');
    await user.clear(nameInput);
    await user.type(nameInput, 'Ada Updated');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/auth/profile', expect.objectContaining({ name: 'Ada Updated' })));
    expect(await screen.findByText(/profile updated/i)).toBeInTheDocument();
  });

  it('shows an error when saving profile fails with a server message', async () => {
    const user = userEvent.setup();
    api.put.mockRejectedValueOnce({ response: { data: { message: 'Email already taken' } } });
    renderPage();

    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText('Email already taken')).toBeInTheDocument();
  });

  it('shows a generic error when profile save fails without a server message', async () => {
    const user = userEvent.setup();
    api.put.mockRejectedValueOnce(new Error('Network'));
    renderPage();

    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText('Failed to update profile')).toBeInTheDocument();
  });

  // Display section

  it('navigates to Display section and shows theme options', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /display/i }));
    expect(screen.getByRole('button', { name: /light/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dark/i })).toBeInTheDocument();
  });

  it('switches to dark theme and saves', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /display/i }));
    await user.click(screen.getByRole('button', { name: /^dark$/i }));
    await user.click(screen.getByRole('button', { name: /save display/i }));

    await waitFor(() => expect(mockUpdatePreferences).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'dark' })
    ));
  });

  it('toggles the first switch (high contrast) in Display section', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /display/i }));
    const switches = screen.getAllByRole('switch');
    await user.click(switches[0]);

    await user.click(screen.getByRole('button', { name: /save display/i }));
    await waitFor(() => expect(mockUpdatePreferences).toHaveBeenCalledWith(
      expect.objectContaining({ highContrast: true })
    ));
  });

  it('resets font size to default', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /display/i }));
    await user.click(screen.getByRole('button', { name: /reset to default/i }));

    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('selects a colorblind mode option', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /display/i }));
    await user.click(screen.getByRole('button', { name: /protanopia/i }));

    await user.click(screen.getByRole('button', { name: /save display/i }));
    await waitFor(() => expect(mockUpdatePreferences).toHaveBeenCalledWith(
      expect.objectContaining({ colorblindMode: 'protanopia' })
    ));
  });

  it('shows a success message after saving display settings', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /display/i }));
    await user.click(screen.getByRole('button', { name: /save display/i }));

    expect(await screen.findByText(/display settings saved/i)).toBeInTheDocument();
  });

  // Notifications section

  it('navigates to Notifications section and shows its content', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /^notifications$/i }));
    const main = screen.getByRole('main');
    expect(within(main).getByText('Email Notifications')).toBeInTheDocument();
  });

  it('saves notification preferences', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /^notifications$/i }));
    await user.click(screen.getByRole('button', { name: /save notification/i }));

    await waitFor(() => expect(mockUpdatePreferences).toHaveBeenCalledWith(
      expect.objectContaining({ notifications: expect.any(Object) })
    ));
    expect(await screen.findByText(/notification preferences saved/i)).toBeInTheDocument();
  });

  it('toggles a notification switch', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /^notifications$/i }));
    const switches = screen.getAllByRole('switch');
    await user.click(switches[0]);

    await user.click(screen.getByRole('button', { name: /save notification/i }));
    expect(mockUpdatePreferences).toHaveBeenCalled();
  });

  // Data & Privacy section

  it('navigates to Data & Privacy section', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /data/i }));
    expect(screen.getByText(/export data/i)).toBeInTheDocument();
    expect(screen.getByText(/delete account/i)).toBeInTheDocument();
  });

  it('shows the delete confirmation form when Delete My Account is clicked', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /data/i }));
    await user.click(screen.getByRole('button', { name: /delete my account/i }));

    expect(screen.getByPlaceholderText(/enter your email/i)).toBeInTheDocument();
  });

  it('keeps the permanently delete button disabled when the email does not match', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /data/i }));
    await user.click(screen.getByRole('button', { name: /delete my account/i }));

    await user.type(screen.getByPlaceholderText(/enter your email/i), 'wrong@email.com');

    expect(screen.getByRole('button', { name: /permanently delete/i })).toBeDisabled();
  });

  it('enables the permanently delete button when the email matches', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /data/i }));
    await user.click(screen.getByRole('button', { name: /delete my account/i }));

    await user.type(screen.getByPlaceholderText(/enter your email/i), 'ada@example.com');

    expect(screen.getByRole('button', { name: /permanently delete/i })).not.toBeDisabled();
  });

  it('deletes the account and calls logout when email matches', async () => {
    const user = userEvent.setup();
    api.delete.mockResolvedValueOnce({});
    renderPage();

    await user.click(screen.getByRole('button', { name: /data/i }));
    await user.click(screen.getByRole('button', { name: /delete my account/i }));

    await user.type(screen.getByPlaceholderText(/enter your email/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /permanently delete/i }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/auth/account', expect.anything()));
    expect(mockLogout).toHaveBeenCalled();
  });

  it('shows a server error when account deletion fails', async () => {
    const user = userEvent.setup();
    api.delete.mockRejectedValueOnce({ response: { data: { message: 'Deletion not allowed' } } });
    renderPage();

    await user.click(screen.getByRole('button', { name: /data/i }));
    await user.click(screen.getByRole('button', { name: /delete my account/i }));

    await user.type(screen.getByPlaceholderText(/enter your email/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /permanently delete/i }));

    expect(await screen.findByText('Deletion not allowed')).toBeInTheDocument();
  });

  it('shows a generic deletion error when no message is provided', async () => {
    const user = userEvent.setup();
    api.delete.mockRejectedValueOnce(new Error('network'));
    renderPage();

    await user.click(screen.getByRole('button', { name: /data/i }));
    await user.click(screen.getByRole('button', { name: /delete my account/i }));

    await user.type(screen.getByPlaceholderText(/enter your email/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /permanently delete/i }));

    expect(await screen.findByText('Failed to delete account')).toBeInTheDocument();
  });

  it('cancels the delete confirmation form', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /data/i }));
    await user.click(screen.getByRole('button', { name: /delete my account/i }));

    expect(screen.getByPlaceholderText(/enter your email/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.queryByPlaceholderText(/enter your email/i)).not.toBeInTheDocument();
  });

  it('calls the export API when Export button is clicked', async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValueOnce({ data: { reports: [] } });
    window.URL.createObjectURL = vi.fn(() => 'blob:mock');
    window.URL.revokeObjectURL = vi.fn();

    // Stub document.createElement only for <a> tags to avoid breaking renders
    const realCreateElement = document.createElement.bind(document);
    const mockAnchor = realCreateElement('a');
    mockAnchor.click = vi.fn();
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tag) =>
      tag === 'a' ? mockAnchor : realCreateElement(tag)
    );

    renderPage();
    await user.click(screen.getByRole('button', { name: /data/i }));
    await user.click(screen.getByRole('button', { name: /export data/i }));

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/auth/export'));
    createSpy.mockRestore();
  });

  it('shows an error message when export fails', async () => {
    const user = userEvent.setup();
    api.get.mockRejectedValueOnce(new Error('Export error'));

    renderPage();
    await user.click(screen.getByRole('button', { name: /data/i }));
    await user.click(screen.getByRole('button', { name: /export data/i }));

    expect(await screen.findByText('Failed to export data')).toBeInTheDocument();
  });
});
