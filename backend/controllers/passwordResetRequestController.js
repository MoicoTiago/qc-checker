const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sendPasswordResetEmail } = require('../services/emailService');
const PasswordResetRequest = require('../models/PasswordResetRequest');
const User = require('../models/User');

const generateTemporaryPassword = () => {
    return crypto.randomBytes(6).toString('base64').slice(0, 10) + '!';
};

// Backs the Profile page's "Request Password Reset" button (POST /api/password-reset-requests).
// Open to any authenticated user (see passwordResetRequestRoutes.js) so the end-user can queue
// their own request without going through an admin. The duplicate-prevention guard below is the
// contract the Profile UI relies on — it stops the queue from filling with repeated submissions
// from the same user while their last request is still awaiting admin action in the Manage tab.
const createPasswordResetRequest = async (req, res) => {
    try{
        const existingRequest = await PasswordResetRequest.findOne({
            user:req.user._id,
            status: 'pending',
        });

        if (existingRequest) {
            return res.status(400).json({
                message: 'You already have a pending password reset request'
            });
        }

        const request = await PasswordResetRequest.create({
            user: req.user._id,
            status: 'pending',
        });

        res.status(201).json({
            message: 'Password reset request successfully',
            request,
        });
    } catch (error) {
        res.status(500).json({ message: error.message});
    }
};

// The Manage tab calls this with `?status=pending` so it only shows the action queue; omitting
// the filter returns completed/rejected history too, which other admin views may consume.
const getPasswordResetRequests = async (req, res) => {
    try {
        const query = {};

        if (req.query.status) {
            query.status = req.query.status;
        }

        const requests = await PasswordResetRequest.find(query)
            .populate('user','name email role status')
            .populate('resolvedBy', 'name email')
            .sort({ requestedAt: -1});

        res.json(requests);
    } catch (error) {
        res.status(500).json({message: error.message});
    }
};

// Mirrors the temp-password + mustChangePassword flow in userController.resetUserPassword; the
// key differences are that this path is driven by a user-submitted PasswordResetRequest document
// (so we transition its status) rather than an admin acting directly on a User row.
const completePasswordResetRequest = async (req, res) => {
    try {
        const request = await PasswordResetRequest.findById(req.params.id).populate('user');
        
        if (!request) {
            return res.status(404).json({ message: 'Password reset not found'});
        }

        // Guard against double-processing: once a request is completed/rejected it stays in the
        // collection for audit history, but must not be actionable again (prevents generating a
        // fresh temp password and re-emailing the user on a stale click).
        if(request.status !== 'pending') {
            return res.status(400).json({message: 'This request has already been handled'});
        }

        const user = await User.findById(request.user._id);

        if (!user) {
            return res.status(404).json({message: 'User not found'});
        }

        const tempPassword = generateTemporaryPassword();
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(tempPassword, salt);
        user.mustChangePassword = true;
        await user.save();

        const loginUrl = `${process.env.FRONTEND_URL}/login`;
        let emailSent = true;

        // Same rationale as userController.resetUserPassword: the password change is already
        // persisted above, so an SMTP failure is reported via `emailSent` rather than unwinding.
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

        // Transition the request *after* the user save so a DB failure on the User write leaves
        // the request `pending` and retryable, instead of stranding it in `completed` with an
        // unchanged password.
        request.status = 'completed';
        request.resolvedAt = new Date();
        request.resolvedBy = req.user._id;
        await request.save();

        res.json({ 
            message: emailSent
                ? 'Password reset completed and reset email sent'
                : 'Password reset completed but reset email could not be sent',
            request,
            emailSent,
        });
    } catch (error) {
        res.status(500).json({message: error.message});
    }
};

const rejectPasswordResetRequest = async (req, res) => {
    try{
        const request = await PasswordResetRequest.findById(req.params.id);

        if (!request) {
            return res.status(404).json({ message: 'Password reset request not found'})
        }

        if(request.status !== 'pending') {
            return res.status(400).json({message: 'This request has already been handled'});
        }

        // `notes` is persisted verbatim for the audit trail; the frontend currently sends a fixed
        // string ("Rejected by Admin") but the schema accepts any admin-supplied reason.
        request.status = 'rejected';
        request.resolvedAt = new Date();
        request.resolvedBy = req.user._id;
        request.notes = req.body.notes || '';
        await request.save();

        res.json({
            message: 'Password reset request rejected',
            request,
        });
    } catch (error) {
        res.status(500).json({message: error.message});
    }
};

module.exports = {
    createPasswordResetRequest,
    getPasswordResetRequests,
    completePasswordResetRequest,
    rejectPasswordResetRequest,
};
