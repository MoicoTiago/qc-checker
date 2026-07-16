import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';

vi.mock('axios', () => {
  const mockInstance = {
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  };
  return {
    default: {
      create: vi.fn(() => mockInstance),
    },
  };
});

describe('api service', () => {
  let requestFulfilled, requestRejected, responseFulfilled, responseRejected;
  let mockInstance;

  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();

    mockInstance = {
      interceptors: {
        request: { use: vi.fn((f, r) => { requestFulfilled = f; requestRejected = r; }) },
        response: { use: vi.fn((f, r) => { responseFulfilled = f; responseRejected = r; }) },
      },
    };

    vi.doMock('axios', () => ({
      default: { create: vi.fn(() => mockInstance) },
    }));

    await import('./api');
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  // Request interceptor

  it('attaches the Bearer token to the request when a token is in localStorage', () => {
    localStorage.setItem('token', 'test-token-123');
    const config = { headers: {} };
    const result = requestFulfilled(config);
    expect(result.headers.Authorization).toBe('Bearer test-token-123');
  });

  it('does not attach an Authorization header when there is no token', () => {
    const config = { headers: {} };
    const result = requestFulfilled(config);
    expect(result.headers.Authorization).toBeUndefined();
  });

  it('propagates errors from the request interceptor', async () => {
    const err = new Error('Request setup failed');
    await expect(requestRejected(err)).rejects.toThrow('Request setup failed');
  });

  // Response interceptor

  it('passes through successful responses unchanged', () => {
    const response = { status: 200, data: { ok: true } };
    expect(responseFulfilled(response)).toBe(response);
  });

  it('removes the token and redirects on a 401 response', async () => {
    localStorage.setItem('token', 'stale-token');
    Object.defineProperty(window, 'location', {
      value: { pathname: '/dashboard', href: '' },
      writable: true,
    });

    const error = { response: { status: 401 } };
    await expect(responseRejected(error)).rejects.toEqual(error);
    expect(localStorage.getItem('token')).toBeNull();
    expect(window.location.href).toBe('/login');
  });

  it('does not redirect when already on the /login page on a 401', async () => {
    localStorage.setItem('token', 'stale-token');
    Object.defineProperty(window, 'location', {
      value: { pathname: '/login', href: '/login' },
      writable: true,
    });

    const error = { response: { status: 401 } };
    await expect(responseRejected(error)).rejects.toEqual(error);
    expect(window.location.href).toBe('/login');
  });

  it('propagates non-401 errors without touching localStorage or redirecting', async () => {
    localStorage.setItem('token', 'good-token');
    const error = { response: { status: 500 } };
    await expect(responseRejected(error)).rejects.toEqual(error);
    expect(localStorage.getItem('token')).toBe('good-token');
  });
});
