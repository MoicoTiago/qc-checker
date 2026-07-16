const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const Report = require('../models/Report');
const Team = require('../models/Team');
const { protect, authorize } = require('../middleware/authMiddleware');
const { trainingUpload, handleUploadError } = require('../middleware/uploadMiddleware');
const TrainingExample = require('../models/TrainingExample');
const AuditLog = require('../models/AuditLog');
const {
  buildAnalyticsPayload,
  resolveAnalyticsScope,
} = require('../services/analyticsService');
const { aggregateReportTimeMetrics, getReportTimeMetrics } = require('../services/timeEstimationService');
const { buildTrainingExamplesFromLabeledReports, processTrainingExample } = require('../services/trainingService');
const { sendTeamAssignmentEmail, sendTeamLeadAssignmentEmail, sendTeamRemovalEmail } = require('../services/emailService');
const audit = require('../services/auditService');


// GET /api/admin/stats?range=7d|30d|90d|all&team=teamId&user=userId&result=good|bad|uncertain
router.get('/stats', protect, authorize('admin'), async (req, res) => {

  try {
    const { range, team, user: userId, result } = req.query;
    const totalUsers = await User.countDocuments({ role: { $ne: 'admin' } });

    // Build report query filter
    const filter = {};

    // Date range filter
    if (range && range !== 'all') {
      const days = parseInt(range);
      if (!isNaN(days) && days > 0) {
        filter.createdAt = { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
      }
    }

    // Team filter — only include reports from members of the selected team
    if (team) {
      const teamDoc = await Team.findById(team);
      if (teamDoc) {
        const memberIds = teamDoc.members.map(m => m.toString());
        filter.analyzedBy = { $in: memberIds };
      }
    }

    // User filter
    if (userId) {
      filter.analyzedBy = userId;
    }

    // Result filter
    if (result) {
      filter['qualityAssessment.label'] = result;
    }

    const reports = await Report.find(filter);

    const totalReports = reports.length;
    const totalErrors = reports.reduce((sum, r) => sum + (r.errorCount || 0), 0);
    const timeMetrics = aggregateReportTimeMetrics(reports);
    const totalTimeSaved = timeMetrics.totalTimeSavedMinutes;

    const errorBreakdown = [
      { name: 'Placeholder', value: reports.reduce((sum, r) => sum + (r.errorSummary?.placeholder || 0), 0) },
      { name: 'Consistency', value: reports.reduce((sum, r) => sum + (r.errorSummary?.consistency || 0), 0) },
      { name: 'Compliance', value: reports.reduce((sum, r) => sum + (r.errorSummary?.compliance || 0), 0) },
      { name: 'Formatting', value: reports.reduce((sum, r) => sum + (r.errorSummary?.formatting || 0), 0) },
      { name: 'Missing Data', value: reports.reduce((sum, r) => sum + (r.errorSummary?.missing_data || 0), 0) },
    ];

    // Quality assessment counts
    const passed = reports.filter(r => r.qualityAssessment?.label === 'good').length;
    const failed = reports.filter(r => r.qualityAssessment?.label === 'bad').length;
    const uncertain = reports.filter(r => r.qualityAssessment?.label === 'uncertain').length;

    res.json({
      totalUsers,
      totalReports,
      totalErrors,
      timeSaved: Math.round(totalTimeSaved),
      totalTimeSavedMinutes: totalTimeSaved,
      totalManualReviewMinutes: timeMetrics.totalManualReviewMinutes,
      totalAiReviewMinutes: timeMetrics.totalAiReviewMinutes,
      manualTime: timeMetrics.totalManualReviewMinutes,
      aiTime: timeMetrics.totalAiReviewMinutes,
      timeSavedPercent: timeMetrics.timeSavedPercent,
      errorBreakdown,
      qualityBreakdown: { passed, failed, uncertain },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/analytics?level=company|team|user&teamId=xxx&userId=xxx&compareTeamId=xxx&compareUserId=xxx&range=7|30|90|all
router.get('/analytics', protect, authorize('admin'), async (req, res) => {
  try {
    const {
      level = 'company',
      teamId,
      userId,
      compareTeamId,
      compareUserId,
      range = '30',
    } = req.query;

    const comparisonType = level === 'team' ? 'team' : level === 'user' ? 'user' : null;
    const comparisonId = comparisonType === 'team' ? compareTeamId : compareUserId;
    const primaryId = comparisonType === 'team' ? teamId : comparisonType === 'user' ? userId : null;
    const comparisonMode = Boolean(comparisonType && primaryId && comparisonId);

    if (comparisonMode && primaryId === comparisonId) {
      return res.status(400).json({ message: 'Comparison requires two different selections' });
    }

    const primaryScope = await resolveAnalyticsScope({
      level,
      entityId: comparisonType ? primaryId : null,
      teamModel: Team,
      userModel: User,
    });

    if (!primaryScope) {
      return res.status(404).json({ message: `${comparisonType === 'team' ? 'Team' : 'User'} not found` });
    }

    if (!comparisonMode) {
      const payload = await buildAnalyticsPayload({
        filter: primaryScope.filter,
        scopeLabel: primaryScope.scopeLabel,
        scopeDetails: primaryScope.scopeDetails,
        range,
      });

      return res.json({
        level,
        range,
        ...payload,
      });
    }

    const secondaryScope = await resolveAnalyticsScope({
      level,
      entityId: comparisonId,
      teamModel: Team,
      userModel: User,
    });

    if (!secondaryScope) {
      return res.status(404).json({ message: `${comparisonType === 'team' ? 'Team' : 'User'} not found` });
    }

    const [primaryPayload, secondaryPayload] = await Promise.all([
      buildAnalyticsPayload({
        filter: primaryScope.filter,
        scopeLabel: primaryScope.scopeLabel,
        scopeDetails: primaryScope.scopeDetails,
        range,
      }),
      buildAnalyticsPayload({
        filter: secondaryScope.filter,
        scopeLabel: secondaryScope.scopeLabel,
        scopeDetails: secondaryScope.scopeDetails,
        range,
      }),
    ]);

    return res.json({
      level,
      range,
      comparisonMode: true,
      comparisonType,
      primaryScope: primaryPayload,
      secondaryScope: secondaryPayload,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users
router.get('/users', protect, authorize('admin'), async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: 'admin' } })
      .select('-password')
      .populate('reportsCount')
      .lean({ virtuals: true });

    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/reports
// Admin-only, unscoped listing that powers the Reports tab. Distinct from GET /api/reports,
// which is role-scoped (regular users see only their own). Sort is on `analyzedAt` — not
// `createdAt` — so the list reflects when analysis *completed*, matching the "Analyzed on ..."
// label shown in the UI. `.lean()` is used because the tab renders hundreds of rows and doesn't
// need Mongoose document methods.
router.get('/reports', protect, authorize('admin'), async (req, res) => {
  try {
    const reports = await Report.find()
      .populate('analyzedBy', 'name email')
      .sort({ analyzedAt: -1 })
      .lean();

    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/users/:id
// Cascading deletion used by the Manage tab's admin-only flow. Unlike DELETE /api/users/:id
// (see userController.deleteUser), this variant also wipes the user's reports so the admin
// dashboard doesn't keep showing orphaned analytics rows after removal. Team leaders are *not*
// allowed here — role cleanup of that scope belongs to admins only.
router.delete('/users/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    // Admin-on-admin deletion is blocked outright (not just "other admins"); removing an admin
    // must be done by directly editing the DB to avoid accidental lockout of the platform.
    if (user.role === 'admin') {
      return res.status(403).json({ message: 'Cannot delete an admin account' });
    }

    // Report cleanup runs before the User delete so a failure here leaves the user intact and
    // the operation safely retryable, rather than leaving reports pointing at a missing owner.
    await Report.deleteMany({ analyzedBy: req.params.id });

    await user.deleteOne();

    res.json({ message: 'User and their reports deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/reports/:id/training
// One-way transition: flips the report into the training set with a `good`/`bad` label. There is
// intentionally no "un-add" path here — once a report is labelled it stays labelled, and the
// training sync job (POST /admin/training/sync → trainingService.buildTrainingExamplesFromLabeledReports)
// picks it up from this flag pair. `'uncertain'` / `null` are rejected even though the Report
// schema permits them elsewhere, because only concrete good/bad examples are useful for training.
router.patch('/reports/:id/training', protect, authorize('admin'), async (req, res) => {
  try {
    const { trainingLabel } = req.body;

    if (!['good', 'bad'].includes(trainingLabel)) {
      return res.status(400).json({ message: 'trainingLabel must be "good" or "bad"' });
    }

    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { addedToTraining: true, trainingLabel },
      { new: true }
    );

    if (!report) return res.status(404).json({ message: 'Report not found' });

    res.json({ message: 'Report added to training', report });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/training/sync
router.post('/training/sync', protect, authorize('admin'), async (req, res) => {
  try {
    const result = await buildTrainingExamplesFromLabeledReports();
    const stats = await TrainingExample.getTrainingStats();

    res.json({
      message: 'Training examples synced from labeled reports',
      result,
      stats,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/training/stats
router.get('/training/stats', protect, authorize('admin'), async (req, res) => {
  try {
    const stats = await TrainingExample.getTrainingStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/training/upload
router.post(
  '/training/upload',
  protect,
  authorize('admin'),
  trainingUpload.single('pdf'),
  handleUploadError,
  async (req, res) => {
    try {
      const { type } = req.body;

      if (!req.file) {
        return res.status(400).json({ message: 'No PDF file uploaded' });
      }

      if (!['good', 'bad', 'template'].includes(type)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ message: 'Type must be "good", "bad", or "template"' });
      }

      const trainingExample = await TrainingExample.create({
        filename: req.file.originalname,
        filePath: req.file.path,
        fileSize: req.file.size,
        type,
        status: 'pending',
        uploadedBy: req.user._id,
      });

      processTrainingExample(trainingExample._id).catch((err) => {
        console.error('Background training processing failed:', err.message);
      });

      await audit.log('training_upload', {
        req,
        userId: req.user._id,
        email: req.user.email,
        details: {
          exampleId: trainingExample._id,
          filename: trainingExample.filename,
          type,
          fileSize: req.file.size,
        },
      });

      res.status(201).json({
        message: 'Training example uploaded successfully',
        example: trainingExample,
      });
    } catch (err) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/admin/training/examples
router.get('/training/examples', protect, authorize('admin'), async (req, res) => {
  try {
    const examples = await TrainingExample.find()
      .populate('uploadedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.json(examples);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/training/examples/:id
router.delete('/training/examples/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const example = await TrainingExample.findById(req.params.id);

    if (!example) {
      return res.status(404).json({ message: 'Training example not found' });
    }

    if (example.filePath && fs.existsSync(example.filePath)) {
      fs.unlinkSync(example.filePath);
    }

    await example.deleteOne();

    await audit.log('training_deleted', {
      req,
      userId: req.user._id,
      email: req.user.email,
      details: {
        exampleId: example._id,
        filename: example.filename,
        type: example.type,
      },
    });

    res.json({ message: 'Training example deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/training/examples/:id/activate — set a template as the active one
router.patch('/training/examples/:id/activate', protect, authorize('admin'), async (req, res) => {
  try {
    const example = await TrainingExample.findById(req.params.id);
    if (!example) return res.status(404).json({ message: 'Training example not found' });
    if (example.type !== 'template') {
      return res.status(400).json({ message: 'Only template examples can be activated' });
    }
    if (example.status !== 'trained') {
      return res.status(400).json({ message: 'Template must be trained before activating' });
    }

    // Deactivate any currently active template
    await TrainingExample.updateMany({ type: 'template', isActive: true }, { isActive: false });

    example.isActive = true;
    await example.save();

    res.json({ message: 'Template activated', example });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/users/:id/status
router.patch('/users/:id/status', protect, authorize('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') return res.status(403).json({ message: 'Cannot modify an admin account' });

    // Toggle between active and inactive
    user.status = user.status === 'active' ? 'inactive' : 'active';
    await user.save();

    res.json({ message: `User ${user.status}`, status: user.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/teams
router.get('/teams', protect, authorize('admin'), async (req, res) => {
  try {
    const teams = await Team.find()
      .populate('createdBy', 'name email')
      .populate('members', 'name email role')
      .populate('teamLead', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.json(teams);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/teams
router.post('/teams', protect, authorize('admin'), async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Team name is required' });
    }

    const existing = await Team.findOne({ name: name.trim() });
    if (existing) {
      return res.status(409).json({ message: 'A team with that name already exists' });
    }

    const team = await Team.create({
      name: name.trim(),
      createdBy: req.user._id,
    });

    await audit.log('team_created', {
      req,
      userId: req.user._id,
      email: req.user.email,
      details: { teamId: team._id, teamName: team.name },
    });

    res.status(201).json(team);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/teams/:id/members
router.patch('/teams/:id/members', protect, authorize('admin'), async (req, res) => {
  try {
    const { memberIds } = req.body;

    if (!Array.isArray(memberIds)) {
      return res.status(400).json({ message: 'memberIds must be an array' });
    }

    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ message: 'Team not found' });

    // Merge new members with existing, avoiding duplicates
    const existingIds = team.members.map(id => id.toString());
    const newIds = memberIds.filter(id => !existingIds.includes(id));
    const now = new Date();
    newIds.forEach(id => {
      team.members.push(id);
      team.memberJoinDates.set(id, now);
    });
    await team.save();

    // If the team already has a lead, any newly added team_leader must be reverted to basic user
    if (team.teamLead && newIds.length > 0) {
      const leadersToRevert = await User.find({ _id: { $in: newIds }, role: 'team_leader' }).select('_id').lean();
      if (leadersToRevert.length > 0) {
        await User.updateMany(
          { _id: { $in: leadersToRevert.map(u => u._id) } },
          { $set: { role: 'user' } }
        );
      }
    }

    // Send team assignment emails to newly added members
    if (newIds.length > 0) {
      const newMembers = await User.find({ _id: { $in: newIds } }).select('email role').lean();
      const loginUrl = `${process.env.FRONTEND_URL}/login`;

      for (const member of newMembers) {
        try {
          await sendTeamAssignmentEmail({
            to: member.email,
            teamName: team.name,
            role: member.role,
            loginUrl,
          });
        } catch (emailErr) {
          console.error(`Failed to send team assignment email to ${member.email}:`, emailErr.message);
        }
      }
    }

    const updated = await Team.findById(team._id)
      .populate('createdBy', 'name email')
      .populate('members', 'name email role')
      .populate('teamLead', 'name email')
      .lean();

    if (newIds.length > 0) {
      const addedUsers = await User.find({ _id: { $in: newIds } }).select('name email').lean();
      await audit.log('team_member_added', {
        req,
        userId: req.user._id,
        email: req.user.email,
        details: {
          teamId: team._id,
          teamName: team.name,
          addedMembers: addedUsers.map(u => ({ id: u._id, name: u.name, email: u.email })),
          count: newIds.length,
        },
      });
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/teams/:id/members/:userId
router.delete('/teams/:id/members/:userId', protect, authorize('admin'), async (req, res) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ message: 'Team not found' });

    // Get the removed user's email before removing them
    const removedUser = await User.findById(req.params.userId).select('email').lean();

    team.members = team.members.filter(m => m.toString() !== req.params.userId);
    team.memberJoinDates.delete(req.params.userId);

    // Clear teamLead if the removed member was the lead and revert their role
    if (team.teamLead && team.teamLead.toString() === req.params.userId) {
      await User.findByIdAndUpdate(req.params.userId, { role: 'user' });
      team.teamLead = null;
    }

    await team.save();

    // Send removal email
    if (removedUser) {
      try {
        await sendTeamRemovalEmail({ to: removedUser.email, teamName: team.name });
      } catch (emailErr) {
        console.error(`Failed to send team removal email to ${removedUser.email}:`, emailErr.message);
      }
    }

    const updated = await Team.findById(team._id)
      .populate('createdBy', 'name email')
      .populate('members', 'name email role')
      .populate('teamLead', 'name email')
      .lean();

    await audit.log('team_member_removed', {
      req,
      userId: req.user._id,
      email: req.user.email,
      details: {
        teamId: team._id,
        teamName: team.name,
        removedUserId: req.params.userId,
        removedUserEmail: removedUser?.email || null,
      },
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/teams/:id/lead
router.patch('/teams/:id/lead', protect, authorize('admin'), async (req, res) => {
  try {
    const { userId } = req.body;
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ message: 'Team not found' });

    if (!team.members.map(m => m.toString()).includes(userId)) {
      return res.status(400).json({ message: 'User must be a member of the team' });
    }

    // Revert previous lead back to 'user' role
    if (team.teamLead && team.teamLead.toString() !== userId) {
      await User.findByIdAndUpdate(team.teamLead, { role: 'user' });
    }

    // Set new lead's role to 'team_leader'
    await User.findByIdAndUpdate(userId, { role: 'team_leader' });

    team.teamLead = userId;
    await team.save();

    // Send email notifying the new team lead
    try {
      const leadUser = await User.findById(userId).select('email').lean();
      await sendTeamLeadAssignmentEmail({
        to: leadUser.email,
        teamName: team.name,
        loginUrl: `${process.env.FRONTEND_URL}/login`,
      });
    } catch (emailErr) {
      console.error(`Failed to send team lead assignment email:`, emailErr.message);
    }

    const updated = await Team.findById(team._id)
      .populate('createdBy', 'name email')
      .populate('members', 'name email role')
      .populate('teamLead', 'name email')
      .lean();

    const assignedUser = await User.findById(userId).select('name email').lean();
    await audit.log('team_lead_assigned', {
      req,
      userId: req.user._id,
      email: req.user.email,
      details: {
        teamId: team._id,
        teamName: team.name,
        newLeadId: userId,
        newLeadName: assignedUser?.name || null,
        newLeadEmail: assignedUser?.email || null,
      },
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/teams/:id
router.delete('/teams/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ message: 'Team not found' });

    // Revert team lead role back to 'user'
    if (team.teamLead) {
      await User.findByIdAndUpdate(team.teamLead, { role: 'user' });
    }

    await audit.log('team_deleted', {
      req,
      userId: req.user._id,
      email: req.user.email,
      details: {
        teamId: team._id,
        teamName: team.name,
        memberCount: team.members.length,
      },
    });

    await team.deleteOne();

    res.json({ message: 'Team deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/teams/:id/stats?range=7|30|90|all&user=userId&result=good|bad|uncertain
router.get('/teams/:id/stats', protect, authorize('admin'), async (req, res) => {
  try {
    const { range, user: userId, result } = req.query;

    const team = await Team.findById(req.params.id)
      .populate('members', 'name email')
      .populate('teamLead', 'name email');
    if (!team) return res.status(404).json({ message: 'Team not found' });

    const memberIds = team.members.map(m => (typeof m === 'object' ? m._id.toString() : m.toString()));

    // Build query filter
    const filter = { analyzedBy: userId ? userId : { $in: memberIds } };

    // Date range filter
    if (range && range !== 'all') {
      const days = parseInt(range);
      if (!isNaN(days) && days > 0) {
        filter.createdAt = { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
      }
    }

    // Result filter
    if (result) {
      filter['qualityAssessment.label'] = result;
    }

    const allMemberReports = await Report.find(filter)
      .populate('analyzedBy', 'name email')
      .sort({ createdAt: -1 });

    // Only include reports created after the member joined this team
    const reports = allMemberReports.filter(r => {
      const rUserId = typeof r.analyzedBy === 'object' ? r.analyzedBy._id.toString() : r.analyzedBy.toString();
      const joinDate = team.memberJoinDates?.get(rUserId);
      // If no join date recorded (legacy member), include all their reports
      if (!joinDate) return true;
      return new Date(r.createdAt) >= new Date(joinDate);
    });

    const totalReports = reports.length;
    const totalErrors = reports.reduce((sum, r) => sum + (r.errorCount || 0), 0);
    const timeMetrics = aggregateReportTimeMetrics(reports);
    const totalTimeSaved = timeMetrics.totalTimeSavedMinutes;

    const errorBreakdown = [
      { name: 'Placeholder', value: reports.reduce((sum, r) => sum + (r.errorSummary?.placeholder || 0), 0) },
      { name: 'Consistency', value: reports.reduce((sum, r) => sum + (r.errorSummary?.consistency || 0), 0) },
      { name: 'Compliance', value: reports.reduce((sum, r) => sum + (r.errorSummary?.compliance || 0), 0) },
      { name: 'Formatting', value: reports.reduce((sum, r) => sum + (r.errorSummary?.formatting || 0), 0) },
      { name: 'Missing Data', value: reports.reduce((sum, r) => sum + (r.errorSummary?.missing_data || 0), 0) },
    ];

    // Quality assessment breakdown
    const passed = reports.filter(r => r.qualityAssessment?.label === 'good').length;
    const failed = reports.filter(r => r.qualityAssessment?.label === 'bad').length;
    const uncertain = reports.filter(r => r.qualityAssessment?.label === 'uncertain').length;
    const pending = reports.filter(r => r.status === 'pending' || r.status === 'processing').length;

    // Per-member breakdown (filtered by join date per member)
    const memberBreakdown = team.members.map(member => {
      const mId = typeof member === 'object' ? member._id.toString() : member.toString();
      const memberReports = reports.filter(r => {
        const rId = typeof r.analyzedBy === 'object' ? r.analyzedBy._id.toString() : r.analyzedBy.toString();
        return rId === mId;
      });
      return {
        _id: mId,
        name: typeof member === 'object' ? member.name : 'Unknown',
        email: typeof member === 'object' ? member.email : '',
        reportsCount: memberReports.length,
        errorsFound: memberReports.reduce((sum, r) => sum + (r.errorCount || 0), 0),
        passed: memberReports.filter(r => r.qualityAssessment?.label === 'good').length,
        failed: memberReports.filter(r => r.qualityAssessment?.label === 'bad').length,
      };
    });

    // Recent reports (last 10)
    const recentReports = reports.slice(0, 10).map(r => ({
      _id: r._id,
      filename: r.filename,
      analyzedBy: r.analyzedBy?.name || 'Unknown',
      status: r.status,
      errorCount: r.errorCount || 0,
      result: r.qualityAssessment?.label || null,
      createdAt: r.createdAt,
    }));

    res.json({
      totalMembers: memberIds.length,
      totalReports,
      totalErrors,
      timeSaved: Math.round(totalTimeSaved),
      totalTimeSavedMinutes: totalTimeSaved,
      totalManualReviewMinutes: timeMetrics.totalManualReviewMinutes,
      totalAiReviewMinutes: timeMetrics.totalAiReviewMinutes,
      manualTime: timeMetrics.totalManualReviewMinutes,
      aiTime: timeMetrics.totalAiReviewMinutes,
      timeSavedPercent: timeMetrics.timeSavedPercent,
      errorBreakdown,
      qualityBreakdown: { passed, failed, uncertain, pending },
      memberBreakdown,
      recentReports,
      teamLead: team.teamLead ? { name: team.teamLead.name, email: team.teamLead.email } : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users/:id/profile-analytics?scope=week|month|all
router.get('/users/:id/profile-analytics', protect, authorize('admin'), async (req, res) => {
  try {
    const userId = req.params.id;
    const targetUser = await User.findById(userId).select('name email');
    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    const scope = ['week', 'month', 'all'].includes(req.query.scope) ? req.query.scope : 'all';

    // Build date filter
    const reportQuery = { analyzedBy: userId };
    let startDate = null;
    if (scope === 'week') {
      startDate = new Date();
      startDate.setUTCDate(startDate.getUTCDate() - 6);
      startDate.setUTCHours(0, 0, 0, 0);
    } else if (scope === 'month') {
      startDate = new Date();
      startDate.setUTCDate(startDate.getUTCDate() - 29);
      startDate.setUTCHours(0, 0, 0, 0);
    }
    if (startDate) reportQuery.createdAt = { $gte: startDate };

    const reports = await Report.find(reportQuery)
      .select('filename status errorCount errorSummary timeSaved estimatedManualReviewMinutes estimatedAiReviewMinutes estimatedTimeSavedMinutes timeSavedPercent qualityAssessment createdAt errors metadata')
      .sort({ createdAt: -1 })
      .lean();

    const summary = {
      totalReports: reports.length,
      analyzedReports: 0,
      pendingReports: 0,
      failedReports: 0,
      totalErrors: 0,
      averageErrorsPerReport: 0,
      totalTimeSaved: 0,
      totalManualReviewMinutes: 0,
      totalAiReviewMinutes: 0,
      totalTimeSavedMinutes: 0,
      timeSavedPercent: 0,
    };

    const errorBreakdown = { placeholder: 0, consistency: 0, compliance: 0, formatting: 0, missing_data: 0 };
    const qualityBreakdown = { good: 0, bad: 0, uncertain: 0 };
    const errorTypesByReport = { placeholder: 0, consistency: 0, compliance: 0, formatting: 0, missing_data: 0 };
    const checklistFailureCounts = new Map();

    reports.forEach((report) => {
      const timeMetrics = getReportTimeMetrics(report);
      summary.totalErrors += report.errorCount || 0;
      summary.totalTimeSaved += timeMetrics.savedMinutes;
      summary.totalManualReviewMinutes += timeMetrics.manualMinutes;
      summary.totalAiReviewMinutes += timeMetrics.aiMinutes;
      summary.totalTimeSavedMinutes += timeMetrics.savedMinutes;

      if (report.status === 'analyzed') summary.analyzedReports += 1;
      else if (report.status === 'failed') summary.failedReports += 1;
      else if (['pending', 'processing'].includes(report.status)) summary.pendingReports += 1;

      errorBreakdown.placeholder += report.errorSummary?.placeholder || 0;
      errorBreakdown.consistency += report.errorSummary?.consistency || 0;
      errorBreakdown.compliance += report.errorSummary?.compliance || 0;
      errorBreakdown.formatting += report.errorSummary?.formatting || 0;
      errorBreakdown.missing_data += report.errorSummary?.missing_data || 0;

      if ((report.errorSummary?.placeholder || 0) > 0) errorTypesByReport.placeholder += 1;
      if ((report.errorSummary?.consistency || 0) > 0) errorTypesByReport.consistency += 1;
      if ((report.errorSummary?.compliance || 0) > 0) errorTypesByReport.compliance += 1;
      if ((report.errorSummary?.formatting || 0) > 0) errorTypesByReport.formatting += 1;
      if ((report.errorSummary?.missing_data || 0) > 0) errorTypesByReport.missing_data += 1;

      const qualityLabel = report.qualityAssessment?.label;
      if (qualityLabel && qualityBreakdown[qualityLabel] !== undefined) qualityBreakdown[qualityLabel] += 1;

      (report.errors || []).forEach((error) => {
        if (!error?.message) return;
        checklistFailureCounts.set(error.message, (checklistFailureCounts.get(error.message) || 0) + 1);
      });
    });

    if (summary.analyzedReports > 0) {
      summary.averageErrorsPerReport = Number((summary.totalErrors / summary.analyzedReports).toFixed(2));
    }
    summary.totalTimeSaved = Math.round(summary.totalTimeSaved);
    summary.totalManualReviewMinutes = Math.round(summary.totalManualReviewMinutes);
    summary.totalAiReviewMinutes = Math.round(summary.totalAiReviewMinutes);
    summary.totalTimeSavedMinutes = Math.round(summary.totalTimeSavedMinutes);
    summary.timeSavedPercent =
      summary.totalManualReviewMinutes > 0
        ? Math.round((summary.totalTimeSaved / summary.totalManualReviewMinutes) * 100)
        : 0;

    const mostCommonErrorTypes = Object.entries(errorBreakdown)
      .map(([type, count]) => ({ type, count, reportsAffected: errorTypesByReport[type] || 0 }))
      .sort((a, b) => b.count !== a.count ? b.count - a.count : b.reportsAffected - a.reportsAffected);

    const checklistFailureBreakdown = Array.from(checklistFailureCounts.entries())
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const qualityScoreTrend = reports
      .filter((r) => r.status === 'analyzed')
      .map((r) => ({
        _id: r._id,
        filename: r.filename,
        createdAt: r.createdAt,
        qualityLabel: r.qualityAssessment?.label || null,
        qualityScore: Number(((r.qualityAssessment?.goodScore || 0) * 100).toFixed(1)),
      }))
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .slice(-10);

    const recentReports = reports.slice(0, 5).map((r) => ({
      _id: r._id,
      filename: r.filename,
      createdAt: r.createdAt,
      status: r.status,
      errorCount: r.errorCount || 0,
      timeSaved: getReportTimeMetrics(r).savedMinutes,
      estimatedManualReviewMinutes: getReportTimeMetrics(r).manualMinutes,
      estimatedAiReviewMinutes: getReportTimeMetrics(r).aiMinutes,
      estimatedTimeSavedMinutes: getReportTimeMetrics(r).savedMinutes,
      timeSavedPercent: r.timeSavedPercent || 0,
      qualityLabel: r.qualityAssessment?.label || null,
      errorSummary: {
        placeholder: r.errorSummary?.placeholder || 0,
        consistency: r.errorSummary?.consistency || 0,
        compliance: r.errorSummary?.compliance || 0,
        formatting: r.errorSummary?.formatting || 0,
        missing_data: r.errorSummary?.missing_data || 0,
      },
    }));

    res.json({
      user: { name: targetUser.name, email: targetUser.email },
      scope,
      summary,
      errorBreakdown,
      qualityBreakdown,
      mostCommonErrorTypes,
      checklistFailureBreakdown,
      qualityScoreTrend,
      recentReports,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/audit-logs?action=login_failed&page=1&limit=50
router.get('/audit-logs', protect, authorize('admin'), async (req, res) => {
  try {
    const { action, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (action) filter.action = action;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('userId', 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    // Summary counts for the last 24h
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [successCount, failedCount, inactiveCount] = await Promise.all([
      AuditLog.countDocuments({ action: 'login_success', createdAt: { $gte: since24h } }),
      AuditLog.countDocuments({ action: 'login_failed', createdAt: { $gte: since24h } }),
      AuditLog.countDocuments({ action: 'login_inactive', createdAt: { $gte: since24h } }),
    ]);

    res.json({
      logs,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      summary24h: { successCount, failedCount, inactiveCount },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
