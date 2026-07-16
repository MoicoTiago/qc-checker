jest.mock('crypto', () => ({
  randomBytes: jest.fn(() => Buffer.from('temp-password')),
}));

jest.mock('bcryptjs', () => ({
  genSalt: jest.fn(),
  hash: jest.fn(),
}));

jest.mock('../../services/emailService', () => ({
  sendNewUserWelcomeEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
}));

jest.mock('../../models/User', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
  findByIdAndDelete: jest.fn(),
}));

jest.mock('../../models/PasswordResetRequest', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
}));

const bcrypt = require('bcryptjs');
const User = require('../../models/User');
const PasswordResetRequest = require('../../models/PasswordResetRequest');
const {
  sendNewUserWelcomeEmail,
  sendPasswordResetEmail,
} = require('../../services/emailService');
const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  resetUserPassword,
} = require('../userController');
const {
  createPasswordResetRequest,
  getPasswordResetRequests,
  completePasswordResetRequest,
  rejectPasswordResetRequest,
} = require('../passwordResetRequestController');

const createResponse = () => {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };

  return res;
};

const createObjectId = (value) => ({
  toString: () => value,
});

const createUserFindChain = (users) => {
  const sort = jest.fn().mockResolvedValue(users);
  const populate = jest.fn(() => ({ sort }));
  const select = jest.fn(() => ({ populate }));

  User.find.mockReturnValue({ select });

  return { select, populate, sort };
};

const createPasswordRequestFindChain = (requests) => {
  const sort = jest.fn().mockResolvedValue(requests);
  const populateResolvedBy = jest.fn(() => ({ sort }));
  const populateUser = jest.fn(() => ({ populate: populateResolvedBy }));

  PasswordResetRequest.find.mockReturnValue({ populate: populateUser });

  return { populateUser, populateResolvedBy, sort };
};

const createUserByIdChain = (user) => {
  const populate = jest.fn().mockResolvedValue(user);
  const select = jest.fn(() => ({ populate }));

  return { select, populate };
};

describe('Manage tab user controller behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FRONTEND_URL = 'http://localhost:3000';
    bcrypt.genSalt.mockResolvedValue('salt');
    bcrypt.hash.mockResolvedValue('hashed-temporary-password');
    sendNewUserWelcomeEmail.mockResolvedValue();
    sendPasswordResetEmail.mockResolvedValue();
  });

  test('getUsers returns all users for admins with passwords excluded', async () => {
    const users = [
      { _id: 'user-1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'user' },
      { _id: 'user-2', name: 'Grace Hopper', email: 'grace@example.com', role: 'team_leader' },
    ];
    const { select, populate, sort } = createUserFindChain(users);
    const req = { user: { _id: 'admin-1', role: 'admin' } };
    const res = createResponse();

    await getUsers(req, res);

    expect(User.find).toHaveBeenCalledWith({});
    expect(select).toHaveBeenCalledWith('-password');
    expect(populate).toHaveBeenCalledWith('managedBy', 'name email');
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(res.json).toHaveBeenCalledWith(users);
  });

  test('getUsers scopes team leaders to themselves and their managed users', async () => {
    const users = [{ _id: 'leader-1', name: 'Team Lead', role: 'team_leader' }];
    createUserFindChain(users);
    const req = { user: { _id: 'leader-1', role: 'team_leader' } };
    const res = createResponse();

    await getUsers(req, res);

    expect(User.find).toHaveBeenCalledWith({
      $or: [
        { managedBy: 'leader-1' },
        { _id: 'leader-1' },
      ],
    });
    expect(res.json).toHaveBeenCalledWith(users);
  });

  test('getUsers returns 500 when user listing fails', async () => {
    User.find.mockImplementation(() => {
      throw new Error('list failed');
    });
    const req = { user: { _id: 'admin-1', role: 'admin' } };
    const res = createResponse();

    await getUsers(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'list failed' });
  });

  test('getUserById returns a populated user when requester is authorized', async () => {
    const user = {
      _id: createObjectId('user-1'),
      managedBy: createObjectId('leader-1'),
      email: 'ada@example.com',
    };
    const { select, populate } = createUserByIdChain(user);
    User.findById.mockReturnValue({ select });
    const req = {
      params: { id: 'user-1' },
      user: { _id: createObjectId('leader-1'), role: 'team_leader' },
    };
    const res = createResponse();

    await getUserById(req, res);

    expect(User.findById).toHaveBeenCalledWith('user-1');
    expect(select).toHaveBeenCalledWith('-password');
    expect(populate).toHaveBeenCalledWith('managedBy', 'name email');
    expect(res.json).toHaveBeenCalledWith(user);
  });

  test('getUserById returns 404 when the user does not exist', async () => {
    const { select } = createUserByIdChain(null);
    User.findById.mockReturnValue({ select });
    const req = {
      params: { id: 'missing-user' },
      user: { _id: createObjectId('admin-1'), role: 'admin' },
    };
    const res = createResponse();

    await getUserById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'User not found' });
  });

  test('getUserById blocks team leaders from viewing unmanaged users', async () => {
    const user = {
      _id: createObjectId('user-1'),
      managedBy: createObjectId('other-leader'),
    };
    const { select } = createUserByIdChain(user);
    User.findById.mockReturnValue({ select });
    const req = {
      params: { id: 'user-1' },
      user: { _id: createObjectId('leader-1'), role: 'team_leader' },
    };
    const res = createResponse();

    await getUserById(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'Not authorized to view this user' });
  });

  test('createUser validates required fields and role', async () => {
    const missingRes = createResponse();

    await createUser(
      {
        body: { email: 'ada@example.com', role: 'user' },
        user: { email: 'admin@example.com' },
      },
      missingRes
    );

    expect(missingRes.status).toHaveBeenCalledWith(400);
    expect(missingRes.json).toHaveBeenCalledWith({ message: 'Please provide name and email' });

    const invalidRoleRes = createResponse();

    await createUser(
      {
        body: { name: 'Ada Lovelace', email: 'ada@example.com', role: 'manager' },
        user: { email: 'admin@example.com' },
      },
      invalidRoleRes
    );

    expect(invalidRoleRes.status).toHaveBeenCalledWith(400);
    expect(invalidRoleRes.json).toHaveBeenCalledWith({ message: 'Please provide a valid role' });
    expect(User.create).not.toHaveBeenCalled();
  });

  test('createUser rejects duplicate emails after normalizing case', async () => {
    User.findOne.mockResolvedValue({ _id: 'existing-user' });
    const req = {
      body: { name: 'Ada Lovelace', email: 'ADA@EXAMPLE.COM', role: 'user' },
      user: { email: 'admin@example.com' },
    };
    const res = createResponse();

    await createUser(req, res);

    expect(User.findOne).toHaveBeenCalledWith({ email: 'ada@example.com' });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'User with this email already exists' });
  });

  test('createUser creates an active user and sends a welcome email', async () => {
    const createdUser = {
      _id: 'user-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      role: 'user',
      status: 'active',
    };
    User.findOne.mockResolvedValue(null);
    User.create.mockResolvedValue(createdUser);
    const req = {
      body: { name: 'Ada Lovelace', email: 'ADA@EXAMPLE.COM', role: 'user' },
      user: { email: 'admin@example.com' },
    };
    const res = createResponse();

    await createUser(req, res);

    expect(bcrypt.genSalt).toHaveBeenCalledWith(10);
    expect(bcrypt.hash).toHaveBeenCalledWith(expect.stringMatching(/!$/), 'salt');
    expect(User.create).toHaveBeenCalledWith({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'hashed-temporary-password',
      role: 'user',
      status: 'active',
      mustChangePassword: true,
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      _id: 'user-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      role: 'user',
      status: 'active',
      emailSent: true,
      message: 'User created and welcome email sent',
    });
  });

  test('createUser still succeeds when welcome email fails', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    User.findOne.mockResolvedValue(null);
    User.create.mockResolvedValue({
      _id: 'user-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      role: 'team_leader',
      status: 'active',
    });
    sendNewUserWelcomeEmail.mockRejectedValue(new Error('SMTP unavailable'));
    const req = {
      body: { name: 'Ada Lovelace', email: 'ada@example.com', role: 'team_leader' },
      user: { email: 'admin@example.com' },
    };
    const res = createResponse();

    await createUser(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        emailSent: false,
        message: 'User created but welcome email could not be sent',
      })
    );

    consoleErrorSpy.mockRestore();
  });

  test('updateUser applies admin updates and returns the populated user', async () => {
    const user = {
      _id: 'user-1',
      name: 'Old Name',
      email: 'old@example.com',
      role: 'user',
      status: 'active',
      save: jest.fn().mockResolvedValue(),
    };
    const updatedUser = {
      _id: 'user-1',
      name: 'New Name',
      email: 'new@example.com',
      role: 'team_leader',
      managedBy: { name: 'Admin', email: 'admin@example.com' },
    };
    const { select, populate } = createUserByIdChain(updatedUser);
    User.findById
      .mockResolvedValueOnce(user)
      .mockReturnValueOnce({ select });
    const req = {
      params: { id: 'user-1' },
      body: {
        name: 'New Name',
        email: 'new@example.com',
        role: 'team_leader',
        managedBy: 'admin-1',
        status: 'inactive',
      },
      user: { _id: 'admin-1', role: 'admin' },
    };
    const res = createResponse();

    await updateUser(req, res);

    expect(user).toEqual(
      expect.objectContaining({
        name: 'New Name',
        email: 'new@example.com',
        role: 'team_leader',
        managedBy: 'admin-1',
        status: 'inactive',
      })
    );
    expect(user.save).toHaveBeenCalled();
    expect(select).toHaveBeenCalledWith('-password');
    expect(populate).toHaveBeenCalledWith('managedBy', 'name email');
    expect(res.json).toHaveBeenCalledWith(updatedUser);
  });

  test('updateUser blocks unauthorized team leader changes', async () => {
    User.findById.mockResolvedValue({
      _id: createObjectId('user-1'),
      managedBy: createObjectId('other-leader'),
      save: jest.fn(),
    });
    const req = {
      params: { id: 'user-1' },
      body: { name: 'New Name' },
      user: { _id: createObjectId('leader-1'), role: 'team_leader' },
    };
    const res = createResponse();

    await updateUser(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'Not authorized to update this user' });
  });

  test('updateUser blocks team leaders from changing roles', async () => {
    const user = {
      _id: createObjectId('user-1'),
      managedBy: createObjectId('leader-1'),
      save: jest.fn(),
    };
    User.findById.mockResolvedValue(user);
    const req = {
      params: { id: 'user-1' },
      body: { role: 'team_leader' },
      user: { _id: createObjectId('leader-1'), role: 'team_leader' },
    };
    const res = createResponse();

    await updateUser(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'Team leaders cannot change roles' });
    expect(user.save).not.toHaveBeenCalled();
  });

  test('updateUser blocks non-admin promotion to admin and returns 404 for missing users', async () => {
    User.findById.mockResolvedValueOnce({
      _id: createObjectId('user-1'),
      save: jest.fn(),
    });
    const promoteRes = createResponse();

    await updateUser(
      {
        params: { id: 'user-1' },
        body: { role: 'admin' },
        user: { _id: createObjectId('leader-1'), role: 'user' },
      },
      promoteRes
    );

    expect(promoteRes.status).toHaveBeenCalledWith(403);
    expect(promoteRes.json).toHaveBeenCalledWith({ message: 'Only admins can promote to admin' });

    User.findById.mockResolvedValueOnce(null);
    const missingRes = createResponse();

    await updateUser(
      {
        params: { id: 'missing-user' },
        body: { name: 'New Name' },
        user: { _id: 'admin-1', role: 'admin' },
      },
      missingRes
    );

    expect(missingRes.status).toHaveBeenCalledWith(404);
    expect(missingRes.json).toHaveBeenCalledWith({ message: 'User not found' });
  });

  test('resetUserPassword hashes a temporary password, flags mustChangePassword, and sends email', async () => {
    const targetUser = {
      _id: createObjectId('user-1'),
      email: 'ada@example.com',
      role: 'user',
      save: jest.fn().mockResolvedValue(),
    };
    User.findById.mockResolvedValue(targetUser);

    const req = {
      params: { id: 'user-1' },
      user: { _id: 'admin-1', email: 'admin@example.com', role: 'admin' },
    };
    const res = createResponse();

    await resetUserPassword(req, res);

    expect(User.findById).toHaveBeenCalledWith('user-1');
    expect(bcrypt.genSalt).toHaveBeenCalledWith(10);
    expect(bcrypt.hash).toHaveBeenCalledWith(expect.stringMatching(/!$/), 'salt');
    expect(targetUser.password).toBe('hashed-temporary-password');
    expect(targetUser.mustChangePassword).toBe(true);
    expect(targetUser.save).toHaveBeenCalled();
    expect(sendPasswordResetEmail).toHaveBeenCalledWith({
      to: 'ada@example.com',
      tempPassword: expect.stringMatching(/!$/),
      loginUrl: 'http://localhost:3000/login',
      adminEmail: 'admin@example.com',
    });
    expect(res.json).toHaveBeenCalledWith({
      message: 'Password reset successfully and reset email sent',
      mustChangePassword: true,
      emailSent: true,
    });
  });

  test('resetUserPassword returns 404 when the target user does not exist', async () => {
    User.findById.mockResolvedValue(null);
    const req = {
      params: { id: 'missing-user' },
      user: { _id: 'admin-1', email: 'admin@example.com', role: 'admin' },
    };
    const res = createResponse();

    await resetUserPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'User not found' });
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });

  test('resetUserPassword blocks team leaders from resetting unmanaged users', async () => {
    User.findById.mockResolvedValue({
      _id: createObjectId('user-1'),
      managedBy: createObjectId('other-leader'),
      email: 'ada@example.com',
    });
    const req = {
      params: { id: 'user-1' },
      user: { _id: 'leader-1', email: 'lead@example.com', role: 'team_leader' },
    };
    const res = createResponse();

    await resetUserPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Not authorized to reset this user\'s password',
    });
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });

  test('resetUserPassword still resets the password when email delivery fails', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const targetUser = {
      _id: createObjectId('user-1'),
      email: 'ada@example.com',
      role: 'user',
      save: jest.fn().mockResolvedValue(),
    };
    User.findById.mockResolvedValue(targetUser);
    sendPasswordResetEmail.mockRejectedValue(new Error('SMTP unavailable'));
    const req = {
      params: { id: 'user-1' },
      user: { _id: 'admin-1', email: 'admin@example.com', role: 'admin' },
    };
    const res = createResponse();

    await resetUserPassword(req, res);

    expect(targetUser.password).toBe('hashed-temporary-password');
    expect(targetUser.mustChangePassword).toBe(true);
    expect(targetUser.save).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      message: 'Password reset successfully but reset email could not be sent',
      mustChangePassword: true,
      emailSent: false,
    });

    consoleErrorSpy.mockRestore();
  });

  test('deleteUser removes a target user but prevents deleting the current admin account', async () => {
    const res = createResponse();
    User.findById.mockResolvedValueOnce({
      _id: createObjectId('admin-1'),
      role: 'admin',
    });

    await deleteUser(
      {
        params: { id: 'admin-1' },
        user: { _id: createObjectId('admin-1'), role: 'admin' },
      },
      res
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Cannot delete your own account' });
    expect(User.findByIdAndDelete).not.toHaveBeenCalled();

    const deleteRes = createResponse();
    User.findById.mockResolvedValueOnce({
      _id: createObjectId('user-1'),
      role: 'user',
    });

    await deleteUser(
      {
        params: { id: 'user-1' },
        user: { _id: createObjectId('admin-1'), role: 'admin' },
      },
      deleteRes
    );

    expect(User.findByIdAndDelete).toHaveBeenCalledWith('user-1');
    expect(deleteRes.json).toHaveBeenCalledWith({ message: 'User removed successfully' });
  });

  test('deleteUser returns 404 when the target user does not exist', async () => {
    User.findById.mockResolvedValue(null);
    const req = {
      params: { id: 'missing-user' },
      user: { _id: createObjectId('admin-1'), role: 'admin' },
    };
    const res = createResponse();

    await deleteUser(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'User not found' });
    expect(User.findByIdAndDelete).not.toHaveBeenCalled();
  });

  test('deleteUser blocks unmanaged users and admin accounts when requester is not an admin', async () => {
    User.findById.mockResolvedValueOnce({
      _id: createObjectId('user-1'),
      role: 'user',
      managedBy: createObjectId('other-leader'),
    });
    const unmanagedRes = createResponse();

    await deleteUser(
      {
        params: { id: 'user-1' },
        user: { _id: createObjectId('leader-1'), role: 'team_leader' },
      },
      unmanagedRes
    );

    expect(unmanagedRes.status).toHaveBeenCalledWith(403);
    expect(unmanagedRes.json).toHaveBeenCalledWith({ message: 'Not authorized to delete this user' });

    User.findById.mockResolvedValueOnce({
      _id: createObjectId('admin-2'),
      role: 'admin',
    });
    const adminRes = createResponse();

    await deleteUser(
      {
        params: { id: 'admin-2' },
        user: { _id: createObjectId('user-9'), role: 'user' },
      },
      adminRes
    );

    expect(adminRes.status).toHaveBeenCalledWith(403);
    expect(adminRes.json).toHaveBeenCalledWith({ message: 'Only admins can delete admin accounts' });
    expect(User.findByIdAndDelete).not.toHaveBeenCalled();
  });
});

describe('Manage tab password reset request controller behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FRONTEND_URL = 'http://localhost:3000';
    bcrypt.genSalt.mockResolvedValue('salt');
    bcrypt.hash.mockResolvedValue('hashed-temporary-password');
    sendNewUserWelcomeEmail.mockResolvedValue();
    sendPasswordResetEmail.mockResolvedValue();
  });

  test('createPasswordResetRequest rejects duplicate pending requests', async () => {
    PasswordResetRequest.findOne.mockResolvedValue({ _id: 'request-1' });
    const req = { user: { _id: 'user-1' } };
    const res = createResponse();

    await createPasswordResetRequest(req, res);

    expect(PasswordResetRequest.findOne).toHaveBeenCalledWith({
      user: 'user-1',
      status: 'pending',
    });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'You already have a pending password reset request',
    });
    expect(PasswordResetRequest.create).not.toHaveBeenCalled();
  });

  test('createPasswordResetRequest creates a pending request', async () => {
    const request = { _id: 'request-1', user: 'user-1', status: 'pending' };
    PasswordResetRequest.findOne.mockResolvedValue(null);
    PasswordResetRequest.create.mockResolvedValue(request);
    const req = { user: { _id: 'user-1' } };
    const res = createResponse();

    await createPasswordResetRequest(req, res);

    expect(PasswordResetRequest.create).toHaveBeenCalledWith({
      user: 'user-1',
      status: 'pending',
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Password reset request successfully',
      request,
    });
  });

  test('createPasswordResetRequest returns 500 when creation fails', async () => {
    PasswordResetRequest.findOne.mockResolvedValue(null);
    PasswordResetRequest.create.mockRejectedValue(new Error('create failed'));
    const req = { user: { _id: 'user-1' } };
    const res = createResponse();

    await createPasswordResetRequest(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'create failed' });
  });

  test('getPasswordResetRequests lists pending requests with user and resolver details populated', async () => {
    const requests = [
      {
        _id: 'request-1',
        status: 'pending',
        user: { name: 'Ada Lovelace', email: 'ada@example.com', role: 'user' },
      },
    ];
    const { populateUser, populateResolvedBy, sort } = createPasswordRequestFindChain(requests);
    const req = { query: { status: 'pending' } };
    const res = createResponse();

    await getPasswordResetRequests(req, res);

    expect(PasswordResetRequest.find).toHaveBeenCalledWith({ status: 'pending' });
    expect(populateUser).toHaveBeenCalledWith('user', 'name email role status');
    expect(populateResolvedBy).toHaveBeenCalledWith('resolvedBy', 'name email');
    expect(sort).toHaveBeenCalledWith({ requestedAt: -1 });
    expect(res.json).toHaveBeenCalledWith(requests);
  });

  test('getPasswordResetRequests lists all requests when no status filter is supplied', async () => {
    const requests = [
      { _id: 'request-1', status: 'completed' },
      { _id: 'request-2', status: 'rejected' },
    ];
    createPasswordRequestFindChain(requests);
    const req = { query: {} };
    const res = createResponse();

    await getPasswordResetRequests(req, res);

    expect(PasswordResetRequest.find).toHaveBeenCalledWith({});
    expect(res.json).toHaveBeenCalledWith(requests);
  });

  test('getPasswordResetRequests returns 500 when listing fails', async () => {
    PasswordResetRequest.find.mockImplementation(() => {
      throw new Error('list failed');
    });
    const req = { query: { status: 'pending' } };
    const res = createResponse();

    await getPasswordResetRequests(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'list failed' });
  });

  test('completePasswordResetRequest resets the target user password and completes the request', async () => {
    const request = {
      _id: 'request-1',
      status: 'pending',
      user: { _id: 'user-1' },
      save: jest.fn().mockResolvedValue(),
    };
    const populate = jest.fn().mockResolvedValue(request);
    PasswordResetRequest.findById.mockReturnValue({ populate });

    const targetUser = {
      _id: createObjectId('user-1'),
      email: 'ada@example.com',
      save: jest.fn().mockResolvedValue(),
    };
    User.findById.mockResolvedValue(targetUser);

    const req = {
      params: { id: 'request-1' },
      user: { _id: 'admin-1', email: 'admin@example.com' },
    };
    const res = createResponse();

    await completePasswordResetRequest(req, res);

    expect(PasswordResetRequest.findById).toHaveBeenCalledWith('request-1');
    expect(populate).toHaveBeenCalledWith('user');
    expect(User.findById).toHaveBeenCalledWith('user-1');
    expect(targetUser.password).toBe('hashed-temporary-password');
    expect(targetUser.mustChangePassword).toBe(true);
    expect(targetUser.save).toHaveBeenCalled();
    expect(request.status).toBe('completed');
    expect(request.resolvedAt).toBeInstanceOf(Date);
    expect(request.resolvedBy).toBe('admin-1');
    expect(request.save).toHaveBeenCalled();
    expect(sendPasswordResetEmail).toHaveBeenCalledWith({
      to: 'ada@example.com',
      tempPassword: expect.stringMatching(/!$/),
      loginUrl: 'http://localhost:3000/login',
      adminEmail: 'admin@example.com',
    });
    expect(res.json).toHaveBeenCalledWith({
      message: 'Password reset completed and reset email sent',
      request,
      emailSent: true,
    });
  });

  test('completePasswordResetRequest returns 404 when request is not found', async () => {
    PasswordResetRequest.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(null),
    });
    const req = {
      params: { id: 'missing-request' },
      user: { _id: 'admin-1', email: 'admin@example.com' },
    };
    const res = createResponse();

    await completePasswordResetRequest(req, res);

    expect(PasswordResetRequest.findById).toHaveBeenCalledWith('missing-request');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Password reset not found' });
    expect(User.findById).not.toHaveBeenCalled();
  });

  test('completePasswordResetRequest rejects already handled requests', async () => {
    const request = {
      _id: 'request-1',
      status: 'completed',
      user: { _id: 'user-1' },
    };
    PasswordResetRequest.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(request),
    });
    const req = { params: { id: 'request-1' }, user: { _id: 'admin-1' } };
    const res = createResponse();

    await completePasswordResetRequest(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'This request has already been handled' });
    expect(User.findById).not.toHaveBeenCalled();
  });

  test('completePasswordResetRequest returns 404 when target user is not found', async () => {
    const request = {
      _id: 'request-1',
      status: 'pending',
      user: { _id: 'missing-user' },
      save: jest.fn(),
    };
    PasswordResetRequest.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(request),
    });
    User.findById.mockResolvedValue(null);
    const req = {
      params: { id: 'request-1' },
      user: { _id: 'admin-1', email: 'admin@example.com' },
    };
    const res = createResponse();

    await completePasswordResetRequest(req, res);

    expect(User.findById).toHaveBeenCalledWith('missing-user');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'User not found' });
    expect(request.save).not.toHaveBeenCalled();
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });

  test('completePasswordResetRequest completes the request when reset email fails', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const request = {
      _id: 'request-1',
      status: 'pending',
      user: { _id: 'user-1' },
      save: jest.fn().mockResolvedValue(),
    };
    PasswordResetRequest.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(request),
    });
    const targetUser = {
      _id: createObjectId('user-1'),
      email: 'ada@example.com',
      save: jest.fn().mockResolvedValue(),
    };
    User.findById.mockResolvedValue(targetUser);
    sendPasswordResetEmail.mockRejectedValue(new Error('SMTP unavailable'));
    const req = {
      params: { id: 'request-1' },
      user: { _id: 'admin-1', email: 'admin@example.com' },
    };
    const res = createResponse();

    await completePasswordResetRequest(req, res);

    expect(targetUser.save).toHaveBeenCalled();
    expect(request.status).toBe('completed');
    expect(request.save).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      message: 'Password reset completed but reset email could not be sent',
      request,
      emailSent: false,
    });

    consoleErrorSpy.mockRestore();
  });

  test('completePasswordResetRequest returns 500 when lookup fails', async () => {
    PasswordResetRequest.findById.mockImplementation(() => {
      throw new Error('lookup failed');
    });
    const req = {
      params: { id: 'request-1' },
      user: { _id: 'admin-1', email: 'admin@example.com' },
    };
    const res = createResponse();

    await completePasswordResetRequest(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'lookup failed' });
  });

  test('rejectPasswordResetRequest marks a pending request rejected with admin notes', async () => {
    const request = {
      _id: 'request-2',
      status: 'pending',
      save: jest.fn().mockResolvedValue(),
    };
    PasswordResetRequest.findById.mockResolvedValue(request);
    const req = {
      params: { id: 'request-2' },
      body: { notes: 'Rejected by Admin' },
      user: { _id: 'admin-1' },
    };
    const res = createResponse();

    await rejectPasswordResetRequest(req, res);

    expect(PasswordResetRequest.findById).toHaveBeenCalledWith('request-2');
    expect(request.status).toBe('rejected');
    expect(request.resolvedAt).toBeInstanceOf(Date);
    expect(request.resolvedBy).toBe('admin-1');
    expect(request.notes).toBe('Rejected by Admin');
    expect(request.save).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      message: 'Password reset request rejected',
      request,
    });
  });

  test('rejectPasswordResetRequest returns 404 when request is not found', async () => {
    PasswordResetRequest.findById.mockResolvedValue(null);
    const req = {
      params: { id: 'missing-request' },
      body: {},
      user: { _id: 'admin-1' },
    };
    const res = createResponse();

    await rejectPasswordResetRequest(req, res);

    expect(PasswordResetRequest.findById).toHaveBeenCalledWith('missing-request');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Password reset request not found',
    });
  });

  test('rejectPasswordResetRequest rejects already handled requests', async () => {
    const request = {
      _id: 'request-2',
      status: 'completed',
      save: jest.fn(),
    };
    PasswordResetRequest.findById.mockResolvedValue(request);
    const req = {
      params: { id: 'request-2' },
      body: { notes: 'No longer needed' },
      user: { _id: 'admin-1' },
    };
    const res = createResponse();

    await rejectPasswordResetRequest(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'This request has already been handled',
    });
    expect(request.save).not.toHaveBeenCalled();
  });

  test('rejectPasswordResetRequest stores empty notes when none are provided', async () => {
    const request = {
      _id: 'request-2',
      status: 'pending',
      save: jest.fn().mockResolvedValue(),
    };
    PasswordResetRequest.findById.mockResolvedValue(request);
    const req = {
      params: { id: 'request-2' },
      body: {},
      user: { _id: 'admin-1' },
    };
    const res = createResponse();

    await rejectPasswordResetRequest(req, res);

    expect(request.status).toBe('rejected');
    expect(request.resolvedBy).toBe('admin-1');
    expect(request.notes).toBe('');
    expect(request.save).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      message: 'Password reset request rejected',
      request,
    });
  });

  test('rejectPasswordResetRequest returns 500 when lookup fails', async () => {
    PasswordResetRequest.findById.mockRejectedValue(new Error('db exploded'));
    const req = {
      params: { id: 'request-2' },
      body: {},
      user: { _id: 'admin-1' },
    };
    const res = createResponse();

    await rejectPasswordResetRequest(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: 'db exploded',
    });
  });
});
