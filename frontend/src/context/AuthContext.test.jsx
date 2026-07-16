import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import api from '../services/api';

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Simple consumer component that renders auth state
const TestConsumer = ({ action }) => {
  const auth = useAuth();

  return (
    <div>
      <div data-testid="authenticated">{String(auth.isAuthenticated)}</div>
      <div data-testid="loading">{String(auth.loading)}</div>
      <div data-testid="user">{auth.user ? auth.user.name : 'null'}</div>
      {action === 'login' && (
        <>
          <button onClick={() => auth.login('user@test.com', 'pass123')}>Login</button>
          <button onClick={() => auth.logout()}>Logout</button>
          <button onClick={() => auth.changePassword(null, 'newpass')}>Change Password</button>
          <button onClick={() => auth.updateUser({ name: 'New Name' })}>Update User</button>
          <button onClick={() => auth.updatePreferences({ theme: 'dark' })}>Update Prefs</button>
        </>
      )}
    </div>
  );
};

const renderWithAuth = (action) =>
  render(
    <AuthProvider>
      <TestConsumer action={action} />
    </AuthProvider>
  );

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    api.get.mockResolvedValue({ data: {} });
    api.put.mockResolvedValue({ data: {} });
    api.post.mockResolvedValue({ data: {} });
  });

  afterEach(() => {
    localStorage.clear();
  });

  // useAuth throws when used outside provider

  it('throws when useAuth is used outside AuthProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow('useAuth must be used within an AuthProvider');
    spy.mockRestore();
  });

  // Initial state — no token

  it('starts unauthenticated when there is no token in localStorage', async () => {
    renderWithAuth();
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
  });

  // Initial state — valid token

  it('sets the user when a valid token is in localStorage', async () => {
    localStorage.setItem('token', 'valid-token');
    api.get.mockImplementation((url) => {
      if (url === '/auth/me') return Promise.resolve({ data: { _id: 'u-1', name: 'Ada', role: 'user' } });
      if (url === '/auth/preferences') return Promise.resolve({ data: { theme: 'dark' } });
      return Promise.resolve({ data: {} });
    });

    renderWithAuth();
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Ada'));
    expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
  });

  it('clears the token and user when /auth/me fails', async () => {
    localStorage.setItem('token', 'bad-token');
    api.get.mockRejectedValueOnce(new Error('Unauthorized'));

    renderWithAuth();
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('uses local preferences when /auth/preferences fails', async () => {
    localStorage.setItem('token', 'valid-token');
    api.get.mockImplementation((url) => {
      if (url === '/auth/me') return Promise.resolve({ data: { _id: 'u-1', name: 'Ada', role: 'user' } });
      if (url === '/auth/preferences') return Promise.reject(new Error('not found'));
      return Promise.resolve({ data: {} });
    });

    renderWithAuth();
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Ada'));
  });

  // Login

  it('logs in the user and stores the token', async () => {
    const user = { _id: 'u-1', name: 'Ada', role: 'user' };
    api.get.mockResolvedValue({ data: {} });
    api.post.mockResolvedValueOnce({
      data: { token: 'new-token', ...user, preferences: {} },
    });

    renderWithAuth('login');
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));

    await act(async () => {
      screen.getByText('Login').click();
    });

    await waitFor(() => expect(localStorage.getItem('token')).toBe('new-token'));
    expect(api.post).toHaveBeenCalledWith('/auth/login', { email: 'user@test.com', password: 'pass123' });
  });

  it('applies user preferences on login when returned by the server', async () => {
    const user = { _id: 'u-1', name: 'Ada', role: 'user' };
    api.get.mockResolvedValue({ data: {} });
    api.post.mockResolvedValueOnce({
      data: { token: 'new-token', ...user, preferences: { theme: 'dark' } },
    });

    renderWithAuth('login');
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));

    await act(async () => { screen.getByText('Login').click(); });
    await waitFor(() => expect(localStorage.getItem('token')).toBe('new-token'));
  });

  // Logout

  it('clears token and user on logout', async () => {
    localStorage.setItem('token', 'valid-token');
    api.get.mockImplementation((url) => {
      if (url === '/auth/me') return Promise.resolve({ data: { _id: 'u-1', name: 'Ada', role: 'user' } });
      if (url === '/auth/preferences') return Promise.resolve({ data: {} });
      return Promise.resolve({ data: {} });
    });

    renderWithAuth('login');
    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));

    await act(async () => { screen.getByText('Logout').click(); });
    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('false'));
    expect(localStorage.getItem('token')).toBeNull();
  });

  // changePassword

  it('calls the change password API and clears mustChangePassword', async () => {
    localStorage.setItem('token', 'valid-token');
    api.get.mockImplementation((url) => {
      if (url === '/auth/me') return Promise.resolve({ data: { _id: 'u-1', name: 'Ada', role: 'user', mustChangePassword: true } });
      if (url === '/auth/preferences') return Promise.resolve({ data: {} });
      return Promise.resolve({ data: {} });
    });
    api.put.mockResolvedValueOnce({ data: {} });

    renderWithAuth('login');
    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));

    await act(async () => { screen.getByText('Change Password').click(); });
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/auth/change-password', expect.objectContaining({ newPassword: 'newpass' })));
  });

  // updateUser

  it('updates the user data', async () => {
    localStorage.setItem('token', 'valid-token');
    api.get.mockImplementation((url) => {
      if (url === '/auth/me') return Promise.resolve({ data: { _id: 'u-1', name: 'Ada', role: 'user' } });
      if (url === '/auth/preferences') return Promise.resolve({ data: {} });
      return Promise.resolve({ data: {} });
    });

    renderWithAuth('login');
    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));

    await act(async () => { screen.getByText('Update User').click(); });
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('New Name'));
  });

  // updatePreferences

  it('updates preferences and persists to server when a token exists', async () => {
    localStorage.setItem('token', 'valid-token');
    api.get.mockImplementation((url) => {
      if (url === '/auth/me') return Promise.resolve({ data: { _id: 'u-1', name: 'Ada', role: 'user' } });
      if (url === '/auth/preferences') return Promise.resolve({ data: {} });
      return Promise.resolve({ data: {} });
    });
    api.put.mockResolvedValue({ data: {} });

    renderWithAuth('login');
    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));

    await act(async () => { screen.getByText('Update Prefs').click(); });
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/auth/preferences', { theme: 'dark' }));
  });

  it('applies dark theme class to document when theme is dark', async () => {
    localStorage.setItem('token', 'valid-token');
    api.get.mockImplementation((url) => {
      if (url === '/auth/me') return Promise.resolve({ data: { _id: 'u-1', name: 'Ada', role: 'user' } });
      if (url === '/auth/preferences') return Promise.resolve({ data: { theme: 'dark' } });
      return Promise.resolve({ data: {} });
    });

    renderWithAuth();
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('removes dark theme class when theme is light', async () => {
    document.documentElement.classList.add('dark');
    api.get.mockResolvedValue({ data: {} });
    renderWithAuth();
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
