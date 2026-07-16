import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import HowItWorks from './HowItWorks';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
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

import { useAuth } from '../context/AuthContext';

const renderPage = () =>
  render(
    <MemoryRouter>
      <HowItWorks />
    </MemoryRouter>
  );

describe('HowItWorks — unauthenticated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ isAuthenticated: false, user: null });
  });

  it('renders the main heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('renders the Sign In to Start button linking to /login', () => {
    renderPage();
    const link = screen.getByRole('link', { name: /sign in to start/i });
    expect(link).toHaveAttribute('href', '/login');
  });

  it('renders the Admin Sign In link', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /admin sign in/i })).toBeInTheDocument();
  });

  it('renders the features section heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /main features/i })).toBeInTheDocument();
  });

  it('renders the How to Read Results section', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /how to read/i })).toBeInTheDocument();
  });

  it('renders the header and footer', () => {
    renderPage();
    expect(screen.getByText('Header')).toBeInTheDocument();
    expect(screen.getByText('Footer')).toBeInTheDocument();
  });

  it('renders the At a Glance sidebar', () => {
    renderPage();
    expect(screen.getByText(/at a glance/i)).toBeInTheDocument();
  });
});

describe('HowItWorks — authenticated user', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({
      isAuthenticated: true,
      user: { role: 'user', mustChangePassword: false },
    });
  });

  it('renders the Open Workspace button linking to /dashboard', () => {
    renderPage();
    const link = screen.getByRole('link', { name: /open workspace/i });
    expect(link).toHaveAttribute('href', '/dashboard');
  });

  it('does not render the Admin Sign In link when authenticated', () => {
    renderPage();
    expect(screen.queryByRole('link', { name: /admin sign in/i })).not.toBeInTheDocument();
  });
});

describe('HowItWorks — authenticated admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({
      isAuthenticated: true,
      user: { role: 'admin', mustChangePassword: false },
    });
  });

  it('renders the Open Workspace button linking to /admin for an admin', () => {
    renderPage();
    const link = screen.getByRole('link', { name: /open workspace/i });
    expect(link).toHaveAttribute('href', '/admin');
  });
});

describe('HowItWorks — mustChangePassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({
      isAuthenticated: true,
      user: { role: 'user', mustChangePassword: true },
    });
  });

  it('links to /change-password when mustChangePassword is true', () => {
    renderPage();
    const link = screen.getByRole('link', { name: /open workspace/i });
    expect(link).toHaveAttribute('href', '/change-password');
  });
});
