import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import App from './App';
import api from './services/api';

vi.mock('./services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

// Mock heavy page components so App tests stay fast
vi.mock('./pages/AdminDashboard', () => ({ default: () => <div>Admin Dashboard</div> }));
vi.mock('./pages/Dashboard', () => ({ default: () => <div>User Dashboard</div> }));
vi.mock('./pages/TeamPage', () => ({ default: () => <div>Team Page</div> }));
vi.mock('./pages/ReportDetail', () => ({ default: () => <div>Report Detail</div> }));
vi.mock('./pages/Profile', () => ({ default: () => <div>Profile</div> }));
vi.mock('./pages/Settings', () => ({ default: () => <div>Settings</div> }));
vi.mock('./pages/HowItWorks', () => ({ default: () => <div>How It Works</div> }));
vi.mock('./pages/Login', () => ({ default: () => <div>Login</div> }));
vi.mock('./pages/ChangePassword', () => ({ default: () => <div>Change Password</div> }));
vi.mock('./pages/Unauthorized', () => ({ default: () => <div>Unauthorized</div> }));

// Mock window.matchMedia (used by some accessibility code)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

describe('App routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Default: no token, so no /auth/me call
    api.get.mockResolvedValue({ data: {} });
  });

  it('renders without crashing', async () => {
    render(<App />);
    // App renders the router — it will redirect / to /how-it-works for unauthenticated users
    await waitFor(() => expect(document.body).toBeTruthy());
  });

  it('shows the How It Works page at / when unauthenticated', async () => {
    render(<App />);
    expect(await screen.findByText('How It Works')).toBeInTheDocument();
  });

  it('shows the Unauthorized page at /unauthorized', async () => {
    window.history.pushState({}, '', '/unauthorized');
    render(<App />);
    expect(await screen.findByText('Unauthorized')).toBeInTheDocument();
  });

  it('redirects authenticated admin from / to /admin', async () => {
    localStorage.setItem('token', 'admin-token');
    api.get.mockImplementation((url) => {
      if (url === '/auth/me') return Promise.resolve({ data: { _id: 'a-1', name: 'Admin', role: 'admin', mustChangePassword: false } });
      if (url === '/auth/preferences') return Promise.resolve({ data: {} });
      return Promise.resolve({ data: {} });
    });

    window.history.pushState({}, '', '/');
    render(<App />);
    expect(await screen.findByText('Admin Dashboard')).toBeInTheDocument();
  });

  it('redirects authenticated user from / to /dashboard', async () => {
    localStorage.setItem('token', 'user-token');
    api.get.mockImplementation((url) => {
      if (url === '/auth/me') return Promise.resolve({ data: { _id: 'u-1', name: 'Ada', role: 'user', mustChangePassword: false } });
      if (url === '/auth/preferences') return Promise.resolve({ data: {} });
      return Promise.resolve({ data: {} });
    });

    window.history.pushState({}, '', '/');
    render(<App />);
    expect(await screen.findByText('User Dashboard')).toBeInTheDocument();
  });

  it('redirects to /change-password when mustChangePassword is true', async () => {
    localStorage.setItem('token', 'user-token');
    api.get.mockImplementation((url) => {
      if (url === '/auth/me') return Promise.resolve({ data: { _id: 'u-1', name: 'Ada', role: 'user', mustChangePassword: true } });
      if (url === '/auth/preferences') return Promise.resolve({ data: {} });
      return Promise.resolve({ data: {} });
    });

    window.history.pushState({}, '', '/');
    render(<App />);
    expect(await screen.findByText('Change Password')).toBeInTheDocument();
  });

  it('shows a loading spinner while auth is initialising', async () => {
    localStorage.setItem('token', 'user-token');
    let resolveMe;
    api.get.mockImplementation((url) => {
      if (url === '/auth/me') return new Promise((r) => { resolveMe = r; });
      return Promise.resolve({ data: {} });
    });

    window.history.pushState({}, '', '/');
    render(<App />);
    // Spinner should appear while loading
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    resolveMe({ data: { _id: 'u-1', name: 'Ada', role: 'user', mustChangePassword: false } });
    await screen.findByText('User Dashboard');
  });
});
