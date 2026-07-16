import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import Header from './Header';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
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
  const mockToggle = vi.fn();
  return { useLanguage: () => ({ t, language: 'en', toggleLanguage: mockToggle }) };
});

import { useAuth } from '../context/AuthContext';

const renderHeader = () =>
  render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>
  );

describe('Header — unauthenticated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ isAuthenticated: false, user: null, logout: vi.fn() });
  });

  it('renders the brand name', () => {
    renderHeader();
    expect(screen.getByText('QC Checker')).toBeInTheDocument();
  });

  it('renders the User Login and Admin Login links', () => {
    renderHeader();
    expect(screen.getByText('User Login')).toBeInTheDocument();
    expect(screen.getByText('Admin Login')).toBeInTheDocument();
  });

  it('renders the How It Works link', () => {
    renderHeader();
    expect(screen.getByText('How It Works')).toBeInTheDocument();
  });

  it('does not render Logout button when not authenticated', () => {
    renderHeader();
    expect(screen.queryByRole('button', { name: /logout/i })).not.toBeInTheDocument();
  });

  it('renders the language toggle button', () => {
    renderHeader();
    expect(screen.getByTitle(/cymraeg/i)).toBeInTheDocument();
  });
});

describe('Header — authenticated user', () => {
  const mockLogout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({
      isAuthenticated: true,
      user: { name: 'Ada Lovelace', role: 'user', team: null },
      logout: mockLogout,
    });
  });

  it('renders the welcome message with the user name', () => {
    renderHeader();
    expect(screen.getByText(/Welcome, Ada Lovelace/i)).toBeInTheDocument();
  });

  it('renders Profile and Settings links', () => {
    renderHeader();
    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders the Logout button and calls logout when clicked', async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByRole('button', { name: /logout/i }));
    expect(mockLogout).toHaveBeenCalledOnce();
  });

  it('does not render Admin Dashboard link for a regular user', () => {
    renderHeader();
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });

  it('does not render My Team link when user has no team', () => {
    renderHeader();
    expect(screen.queryByText('My Team')).not.toBeInTheDocument();
  });

  it('renders My Team link when user has a team', () => {
    useAuth.mockReturnValue({
      isAuthenticated: true,
      user: { name: 'Ada Lovelace', role: 'user', team: 'team-1' },
      logout: mockLogout,
    });
    renderHeader();
    expect(screen.getByText('My Team')).toBeInTheDocument();
  });
});

describe('Header — authenticated admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({
      isAuthenticated: true,
      user: { name: 'Admin User', role: 'admin', team: null },
      logout: vi.fn(),
    });
  });

  it('renders the Dashboard link for an admin', () => {
    renderHeader();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });
});
