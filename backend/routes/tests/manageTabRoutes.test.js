const mockGetUsers = jest.fn();
const mockGetUserById = jest.fn();
const mockCreateUser = jest.fn();
const mockUpdateUser = jest.fn();
const mockDeleteUser = jest.fn();
const mockResetUserPassword = jest.fn();
const mockCreatePasswordResetRequest = jest.fn();
const mockGetPasswordResetRequests = jest.fn();
const mockCompletePasswordResetRequest = jest.fn();
const mockRejectPasswordResetRequest = jest.fn();
const mockProtect = jest.fn((req, res, next) => next());
const mockAuthorize = jest.fn(() => jest.fn((req, res, next) => next()));

jest.mock('../../controllers/userController', () => ({
  getUsers: mockGetUsers,
  getUserById: mockGetUserById,
  createUser: mockCreateUser,
  updateUser: mockUpdateUser,
  deleteUser: mockDeleteUser,
  resetUserPassword: mockResetUserPassword,
}));

jest.mock('../../controllers/passwordResetRequestController', () => ({
  createPasswordResetRequest: mockCreatePasswordResetRequest,
  getPasswordResetRequests: mockGetPasswordResetRequests,
  completePasswordResetRequest: mockCompletePasswordResetRequest,
  rejectPasswordResetRequest: mockRejectPasswordResetRequest,
}));

jest.mock('../../middleware/authMiddleware', () => ({
  protect: mockProtect,
  authorize: mockAuthorize,
}));

const userRouter = require('../userRoutes');
const passwordResetRequestRouter = require('../passwordResetRequestRoutes');
const userController = require('../../controllers/userController');
const passwordResetRequestController = require('../../controllers/passwordResetRequestController');

const getRouteHandlers = (router, path, method) => {
  const layer = router.stack.find(
    (entry) => entry.route && entry.route.path === path && entry.route.methods[method]
  );

  if (!layer) {
    throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  }

  return layer.route.stack
    .filter((entry) => entry.method === method)
    .map((entry) => entry.handle);
};

describe('Manage tab route wiring', () => {
  test('user routes used by the Manage tab point to the expected controllers', () => {
    expect(getRouteHandlers(userRouter, '/', 'get').at(-1)).toBe(userController.getUsers);
    expect(getRouteHandlers(userRouter, '/:id', 'delete').at(-1)).toBe(userController.deleteUser);
    expect(getRouteHandlers(userRouter, '/:id/reset-password', 'put').at(-1)).toBe(
      userController.resetUserPassword
    );

    expect(mockAuthorize).toHaveBeenCalledWith('admin', 'team_leader');
  });

  test('password reset request routes used by the Manage tab point to the expected controllers', () => {
    expect(getRouteHandlers(passwordResetRequestRouter, '/', 'get').at(-1)).toBe(
      passwordResetRequestController.getPasswordResetRequests
    );
    expect(getRouteHandlers(passwordResetRequestRouter, '/:id/complete', 'put').at(-1)).toBe(
      passwordResetRequestController.completePasswordResetRequest
    );
    expect(getRouteHandlers(passwordResetRequestRouter, '/:id/reject', 'put').at(-1)).toBe(
      passwordResetRequestController.rejectPasswordResetRequest
    );

    expect(getRouteHandlers(passwordResetRequestRouter, '/', 'post').at(-1)).toBe(
      passwordResetRequestController.createPasswordResetRequest
    );
    expect(mockAuthorize).toHaveBeenCalledWith('admin', 'team_leader');
  });
});
