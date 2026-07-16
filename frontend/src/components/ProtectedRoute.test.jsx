import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import ProtectedRoute from './ProtectedRoute';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));

import { useAuth } from '../context/AuthContext';

const renderRoute = ({ path = '/protected', initialPath = '/protected', allowedRoles = [] } = {}) =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path={path}
          element={
            <ProtectedRoute allowedRoles={allowedRoles}>
              <div>Protected Content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/unauthorized" element={<div>Unauthorized Page</div>} />
        <Route path="/change-password" element={<div>Change Password Page</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('ProtectedRoute', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a loading spinner while auth is loading', () => {
    useAuth.mockReturnValue({ isAuthenticated: false, user: null, loading: true });
    renderRoute();
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('redirects to /login when the user is not authenticated', () => {
    useAuth.mockReturnValue({ isAuthenticated: false, user: null, loading: false });
    renderRoute();
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('renders children when the user is authenticated with no role restriction', () => {
    useAuth.mockReturnValue({
      isAuthenticated: true,
      user: { role: 'user', mustChangePassword: false },
      loading: false,
    });
    renderRoute();
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('renders children when the user role matches allowedRoles', () => {
    useAuth.mockReturnValue({
      isAuthenticated: true,
      user: { role: 'admin', mustChangePassword: false },
      loading: false,
    });
    renderRoute({ allowedRoles: ['admin'] });
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('redirects to /unauthorized when user role is not in allowedRoles', () => {
    useAuth.mockReturnValue({
      isAuthenticated: true,
      user: { role: 'user', mustChangePassword: false },
      loading: false,
    });
    renderRoute({ allowedRoles: ['admin'] });
    expect(screen.getByText('Unauthorized Page')).toBeInTheDocument();
  });

  it('redirects to /change-password when mustChangePassword is true', () => {
    useAuth.mockReturnValue({
      isAuthenticated: true,
      user: { role: 'user', mustChangePassword: true },
      loading: false,
    });
    renderRoute();
    expect(screen.getByText('Change Password Page')).toBeInTheDocument();
  });

  it('does not redirect to /change-password when already on that path', () => {
    useAuth.mockReturnValue({
      isAuthenticated: true,
      user: { role: 'user', mustChangePassword: true },
      loading: false,
    });
    render(
      <MemoryRouter initialEntries={['/change-password']}>
        <Routes>
          <Route
            path="/change-password"
            element={
              <ProtectedRoute>
                <div>Change Password Content</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Change Password Content')).toBeInTheDocument();
  });
});
