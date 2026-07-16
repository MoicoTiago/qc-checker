import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import ChangePassword from './ChangePassword';

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

const renderPage = (path = '/change-password') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/dashboard" element={<div>Dashboard</div>} />
        <Route path="/admin" element={<div>Admin Dashboard</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('ChangePassword', () => {
  const mockChangePassword = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({
      user: { role: 'user', mustChangePassword: true },
      changePassword: mockChangePassword,
      isAuthenticated: true,
    });
  });

  afterEach(() => vi.restoreAllMocks());

  // Redirects

  it('redirects to /login when not authenticated', () => {
    useAuth.mockReturnValue({ user: null, changePassword: mockChangePassword, isAuthenticated: false });
    renderPage();
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('redirects to /dashboard for a user who does not need to change password', () => {
    useAuth.mockReturnValue({
      user: { role: 'user', mustChangePassword: false },
      changePassword: mockChangePassword,
      isAuthenticated: true,
    });
    renderPage();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('redirects to /admin for an admin who does not need to change password', () => {
    useAuth.mockReturnValue({
      user: { role: 'admin', mustChangePassword: false },
      changePassword: mockChangePassword,
      isAuthenticated: true,
    });
    renderPage();
    expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();
  });

  // Rendering

  it('renders the change password form', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /set password/i })).toBeInTheDocument();
  });

  it('renders two password inputs', () => {
    renderPage();
    const pwInputs = document.querySelectorAll('input[type="password"]');
    expect(pwInputs.length).toBe(2);
  });

  // Validation

  it('shows an error when the new password is too short', async () => {
    const user = userEvent.setup();
    renderPage();
    const pwInputs = document.querySelectorAll('input[type="password"]');
    await user.type(pwInputs[0], 'abc');
    await user.type(pwInputs[1], 'abc');
    await user.click(screen.getByRole('button', { name: /set password/i }));
    await waitFor(() =>
      expect(screen.getAllByText(/at least 6 characters/i).length).toBeGreaterThanOrEqual(1)
    );
    expect(screen.getByText('Password must be at least 6 characters')).toBeInTheDocument();
  });

  it('shows an error when passwords do not match', async () => {
    const user = userEvent.setup();
    renderPage();
    const pwInputs = document.querySelectorAll('input[type="password"]');
    await user.type(pwInputs[0], 'password123');
    await user.type(pwInputs[1], 'differentpass');
    await user.click(screen.getByRole('button', { name: /set password/i }));
    expect(await screen.findByText(/do not match/i)).toBeInTheDocument();
  });

  // Successful submission

  it('calls changePassword and navigates to /dashboard on success for a user', async () => {
    const user = userEvent.setup();
    mockChangePassword.mockResolvedValueOnce({});
    renderPage();
    const pwInputs = document.querySelectorAll('input[type="password"]');
    await user.type(pwInputs[0], 'newpassword');
    await user.type(pwInputs[1], 'newpassword');
    await user.click(screen.getByRole('button', { name: /set password/i }));
    await waitFor(() => expect(mockChangePassword).toHaveBeenCalledWith(null, 'newpassword'));
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
  });

  it('calls changePassword and navigates to /admin on success for an admin', async () => {
    useAuth.mockReturnValue({
      user: { role: 'admin', mustChangePassword: true },
      changePassword: mockChangePassword,
      isAuthenticated: true,
    });
    const user = userEvent.setup();
    mockChangePassword.mockResolvedValueOnce({});
    renderPage();
    const pwInputs = document.querySelectorAll('input[type="password"]');
    await user.type(pwInputs[0], 'newpassword');
    await user.type(pwInputs[1], 'newpassword');
    await user.click(screen.getByRole('button', { name: /set password/i }));
    expect(await screen.findByText('Admin Dashboard')).toBeInTheDocument();
  });

  // Error state

  it('shows server error when changePassword rejects with a message', async () => {
    const user = userEvent.setup();
    mockChangePassword.mockRejectedValueOnce({ response: { data: { message: 'Password too weak' } } });
    renderPage();
    const pwInputs = document.querySelectorAll('input[type="password"]');
    await user.type(pwInputs[0], 'newpassword');
    await user.type(pwInputs[1], 'newpassword');
    await user.click(screen.getByRole('button', { name: /set password/i }));
    expect(await screen.findByText('Password too weak')).toBeInTheDocument();
  });

  it('shows a generic error when changePassword rejects without a message', async () => {
    const user = userEvent.setup();
    mockChangePassword.mockRejectedValueOnce(new Error('Network error'));
    renderPage();
    const pwInputs = document.querySelectorAll('input[type="password"]');
    await user.type(pwInputs[0], 'newpassword');
    await user.type(pwInputs[1], 'newpassword');
    await user.click(screen.getByRole('button', { name: /set password/i }));
    expect(await screen.findByText(/failed/i)).toBeInTheDocument();
  });

  // Loading state

  it('disables the button and inputs while submitting', async () => {
    const user = userEvent.setup();
    let resolve;
    mockChangePassword.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    renderPage();
    const pwInputs = document.querySelectorAll('input[type="password"]');
    await user.type(pwInputs[0], 'newpassword');
    await user.type(pwInputs[1], 'newpassword');
    await user.click(screen.getByRole('button', { name: /set password/i }));
    expect(screen.getByRole('button', { name: /setting/i })).toBeDisabled();
    resolve({});
    await screen.findByText('Dashboard');
  });
});
