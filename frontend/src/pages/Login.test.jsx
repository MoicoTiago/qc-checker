import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import Login from './Login';

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

import { useAuth } from '../context/AuthContext';

// Renders the login page at an optional URL (to pass ?admin=true etc.)
const renderLogin = (path = '/login') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<div>Admin Dashboard</div>} />
        <Route path="/dashboard" element={<div>User Dashboard</div>} />
        <Route path="/change-password" element={<div>Change Password</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('Login page', () => {
  const mockLogin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ login: mockLogin, isAuthenticated: false, user: null });
  });

  afterEach(() => vi.restoreAllMocks());

  // Initial rendering

  it('renders the User Login heading by default', () => {
    renderLogin();
    expect(screen.getByText('User Login')).toBeInTheDocument();
    expect(screen.getByText('Sign in to analyze your QC reports')).toBeInTheDocument();
  });

  it('renders the Admin Login heading when ?admin=true is in the URL', () => {
    renderLogin('/login?admin=true');
    expect(screen.getByText('Admin Login')).toBeInTheDocument();
    expect(screen.getByText('Access the admin dashboard')).toBeInTheDocument();
  });

  it('renders the email and password fields', () => {
    renderLogin();
    expect(screen.getByPlaceholderText('user@example.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
  });

  it('renders the Sign In button', () => {
    renderLogin();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('renders the Switch to Admin Login toggle', () => {
    renderLogin();
    expect(screen.getByRole('button', { name: /switch to admin login/i })).toBeInTheDocument();
  });

  it('shows the default admin credentials hint', () => {
    renderLogin();
    expect(screen.getByText('Default Admin Credentials:')).toBeInTheDocument();
    expect(screen.getByText('Email: admin@qcchecker.com')).toBeInTheDocument();
  });

  // Admin/user mode toggle

  it('switches to Admin Login mode when the toggle button is clicked', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole('button', { name: /switch to admin login/i }));

    expect(screen.getByText('Admin Login')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /switch to user login/i })).toBeInTheDocument();
  });

  it('switches back to User Login mode from Admin mode', async () => {
    const user = userEvent.setup();
    renderLogin('/login?admin=true');

    await user.click(screen.getByRole('button', { name: /switch to user login/i }));

    expect(screen.getByText('User Login')).toBeInTheDocument();
  });

  it('uses the admin email placeholder in admin mode', () => {
    renderLogin('/login?admin=true');
    expect(screen.getByPlaceholderText('admin@qcchecker.com')).toBeInTheDocument();
  });

  it('uses the user email placeholder in user mode', () => {
    renderLogin();
    expect(screen.getByPlaceholderText('user@example.com')).toBeInTheDocument();
  });

  // Already authenticated redirect

  it('redirects to /dashboard when a regular user is already authenticated', () => {
    useAuth.mockReturnValue({
      login: mockLogin,
      isAuthenticated: true,
      user: { role: 'user', mustChangePassword: false },
    });
    renderLogin();
    expect(screen.getByText('User Dashboard')).toBeInTheDocument();
  });

  it('redirects to /admin when an admin is already authenticated', () => {
    useAuth.mockReturnValue({
      login: mockLogin,
      isAuthenticated: true,
      user: { role: 'admin', mustChangePassword: false },
    });
    renderLogin();
    expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();
  });

  it('does not redirect when mustChangePassword is true', () => {
    useAuth.mockReturnValue({
      login: mockLogin,
      isAuthenticated: true,
      user: { role: 'user', mustChangePassword: true },
    });
    renderLogin();
    expect(screen.getByText('User Login')).toBeInTheDocument();
  });

  // Form submission — success

  it('calls login with the entered email and password on submit', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValueOnce({ role: 'user', mustChangePassword: false });
    renderLogin();

    await user.type(screen.getByPlaceholderText('user@example.com'), 'ada@example.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(mockLogin).toHaveBeenCalledWith('ada@example.com', 'password123');
  });

  it('navigates to /dashboard after a successful user login', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValueOnce({ role: 'user', mustChangePassword: false });
    renderLogin();

    await user.type(screen.getByPlaceholderText('user@example.com'), 'ada@example.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('User Dashboard')).toBeInTheDocument();
  });

  it('navigates to /admin after a successful admin login', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValueOnce({ role: 'admin', mustChangePassword: false });
    renderLogin();

    await user.type(screen.getByPlaceholderText('user@example.com'), 'admin@example.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'Admin123!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Admin Dashboard')).toBeInTheDocument();
  });

  it('navigates to /change-password when mustChangePassword is true', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValueOnce({ role: 'user', mustChangePassword: true });
    renderLogin();

    await user.type(screen.getByPlaceholderText('user@example.com'), 'ada@example.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Change Password')).toBeInTheDocument();
  });

  // Form submission — loading state

  it('shows "Signing In…" and disables the button while logging in', async () => {
    const user = userEvent.setup();
    let resolve;
    mockLogin.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    renderLogin();

    await user.type(screen.getByPlaceholderText('user@example.com'), 'ada@example.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
    expect(screen.getByPlaceholderText('user@example.com')).toBeDisabled();
    expect(screen.getByPlaceholderText('Enter your password')).toBeDisabled();

    resolve({ role: 'user', mustChangePassword: false });
    await screen.findByText('User Dashboard');
  });

  // Form submission — error states

  it('shows an error message when login fails with a server message', async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce({ response: { data: { message: 'Account locked' } } });
    renderLogin();

    await user.type(screen.getByPlaceholderText('user@example.com'), 'ada@example.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Account locked')).toBeInTheDocument();
  });

  it('shows a generic error when no server message is provided', async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce(new Error('Network error'));
    renderLogin();

    await user.type(screen.getByPlaceholderText('user@example.com'), 'ada@example.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Invalid credentials. Please try again.')).toBeInTheDocument();
  });

  it('clears the error message on the next submit attempt', async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce({ response: { data: { message: 'Invalid credentials. Please try again.' } } });
    mockLogin.mockResolvedValueOnce({ role: 'user', mustChangePassword: false });
    renderLogin();

    await user.type(screen.getByPlaceholderText('user@example.com'), 'ada@example.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await screen.findByText('Invalid credentials. Please try again.');

    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() =>
      expect(screen.queryByText('Invalid credentials. Please try again.')).not.toBeInTheDocument()
    );
  });

  // Form input interaction

  it('updates the email field as the user types', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByPlaceholderText('user@example.com'), 'test@example.com');
    expect(screen.getByPlaceholderText('user@example.com')).toHaveValue('test@example.com');
  });

  it('updates the password field as the user types', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByPlaceholderText('Enter your password'), 'mypassword');
    expect(screen.getByPlaceholderText('Enter your password')).toHaveValue('mypassword');
  });
});
