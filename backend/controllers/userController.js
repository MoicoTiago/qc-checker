const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const {
  sendNewUserWelcomeEmail,
  sendPasswordResetEmail,
} = require('../services/emailService');
const User = require('../models/User');

// The trailing '!' guarantees a special character so the generated password always clears the
// User model's complexity validator, even if the random base64 slice happens to be alphanumeric.
const generateTemporaryPassword = () => {
  return crypto.randomBytes(6).toString('base64').slice(0, 10) + '!';
};

// Team leaders intentionally see themselves in addition to the users they manage, so the Manage
// tab can surface their own row (e.g. to self-reset) alongside their reports.
const getUsers = async (req, res) => {
  try {
    let query = {};
    
    if (req.user.role === 'team_leader') {
      query = {
        $or: [
          { managedBy: req.user._id },
          { _id: req.user._id }
        ]
      };
    }
    
    const users = await User.find(query)
      .select('-password')
      .populate('managedBy', 'name email')
      .sort({ createdAt: -1 });
      
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .populate('managedBy', 'name email');
      
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (req.user.role === 'team_leader' && 
        user._id.toString() !== req.user._id.toString() &&
        user.managedBy?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to view this user' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createUser = async (req, res) => {
  try {
    const { name, email, role } = req.body;

    if (!name || !email) {
      return res.status(400).json({ message: 'Please provide name and email' });
    }

    const allowedRoles = ['user', 'team_leader', 'admin'];

    if (!role || !allowedRoles.includes(role)) {
      return res.status(400).json({ message: 'Please provide a valid role' });
    }


    const normalizedEmail = email.toLowerCase();

    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    const tempPassword = generateTemporaryPassword();

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(tempPassword, salt);

    const user = await User.create({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      role,
      status: 'active',
      mustChangePassword: true,
    });

    const loginUrl = `${process.env.FRONTEND_URL}/login`;

    let emailSent = true;
    try {
      await sendNewUserWelcomeEmail({
        to: user.email,
        tempPassword,
        loginUrl,
        role: user.role,
        adminEmail: req.user.email,
      });
    } catch (emailError) {
      emailSent = false;
      console.error('Failed to send welcome email: ', emailError.message);
    }

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      emailSent,
      message: emailSent
        ? 'User created and welcome email sent'
        : 'User created but welcome email could not be sent',
    });
  } catch (error) {
    console.error('Create user error: ', error);
    res.status(500).json({ message: error.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (req.user.role === 'team_leader') {
      if (user.managedBy?.toString() !== req.user._id.toString() && 
          user._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Not authorized to update this user' });
      }
      
      if (req.body.role && req.body.role !== 'user') {
        return res.status(403).json({ message: 'Team leaders cannot change roles' });
      }
    }

    if (req.body.role === 'admin' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can promote to admin' });
    }

    const allowedUpdates = ['name', 'email', 'status'];
    
    if (req.user.role === 'admin') {
      allowedUpdates.push('role', 'managedBy');
    }

    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) {
        user[field] = req.body[field];
      }
    });

    await user.save();

    const updatedUser = await User.findById(user._id)
      .select('-password')
      .populate('managedBy', 'name email');

    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// User-scoped deletion used by DELETE /api/users/:id. This leaves the user's reports untouched;
// the admin-only DELETE /api/admin/users/:id route (see backend/routes/adminRoutes.js) cascades
// and removes their reports as well.
const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    if (req.user.role === 'team_leader') {
      if (user.managedBy?.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Not authorized to delete this user' });
      }
    }

    if (user.role === 'admin' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can delete admin accounts' });
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User removed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const resetUserPassword = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (req.user.role === 'team_leader') {
      if (user.managedBy?.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Not authorized to reset this user\'s password' });
      }
    }

    // `mustChangePassword: true` forces the user through the change-password screen on next login,
    // so the temporary password cannot be reused indefinitely even if the welcome email is missed.
    const tempPassword = generateTemporaryPassword();
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(tempPassword, salt);
    user.mustChangePassword = true;
    await user.save();

    const loginUrl = `${process.env.FRONTEND_URL}/login`;
    let emailSent = true;

    // An SMTP failure must not roll back the password change: the admin has already committed to
    // the reset, so we persist the new credentials and surface `emailSent: false` in the response
    // so the frontend can instruct the admin to communicate the temp password out-of-band.
    try {
      await sendPasswordResetEmail({
        to: user.email,
        tempPassword,
        loginUrl,
        adminEmail: req.user.email,
      });
    } catch (emailError) {
      emailSent = false;
      console.error('Failed to send password reset email:', emailError.message);
    }

    res.json({ 
      message: emailSent
        ? 'Password reset successfully and reset email sent'
        : 'Password reset successfully but reset email could not be sent',
      mustChangePassword: true,
      emailSent,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  resetUserPassword,
};
