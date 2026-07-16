const express = require('express');
const router = express.Router();
const Team = require('../models/Team');
const User = require('../models/User');
const Report = require('../models/Report');
const { protect, authorize } = require('../middleware/authMiddleware');
const { buildAnalyticsPayload } = require('../services/analyticsService');
const { sendTeamAssignmentEmail, sendTeamRemovalEmail } = require('../services/emailService');

// GET /api/teams/my-team — get the logged-in user's team with members
router.get('/my-team', protect, async (req, res) => {
  try {
    const team = await Team.findOne({ members: req.user._id })
      .populate('members', 'name email role')
      .populate('teamLead', 'name email')
      .lean();

    if (!team) {
      return res.status(404).json({ message: 'You are not part of any team' });
    }

    res.json(team);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/teams/available-users — get non-admin users for adding to team
router.get('/available-users', protect, authorize('team_leader'), async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: 'admin' } })
      .select('name email role')
      .lean();

    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/teams/my-team/members — team lead adds members
router.patch('/my-team/members', protect, authorize('team_leader'), async (req, res) => {
  try {
    const { memberIds } = req.body;

    if (!Array.isArray(memberIds)) {
      return res.status(400).json({ message: 'memberIds must be an array' });
    }

    const team = await Team.findOne({ teamLead: req.user._id });
    if (!team) {
      return res.status(403).json({ message: 'You are not a team lead' });
    }

    const existingIds = team.members.map(id => id.toString());
    const newIds = memberIds.filter(id => !existingIds.includes(id));
    const now = new Date();
    newIds.forEach(id => {
      team.members.push(id);
      team.memberJoinDates.set(id, now);
    });
    await team.save();

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
      .populate('members', 'name email role')
      .populate('teamLead', 'name email')
      .lean();

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/teams/my-team/members/:userId — team lead removes a member
router.delete('/my-team/members/:userId', protect, authorize('team_leader'), async (req, res) => {
  try {
    const team = await Team.findOne({ teamLead: req.user._id });
    if (!team) {
      return res.status(403).json({ message: 'You are not a team lead' });
    }

    // Prevent team lead from removing themselves
    if (req.params.userId === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot remove yourself from the team' });
    }

    // Get the removed user's email before removing them
    const removedUser = await User.findById(req.params.userId).select('email').lean();

    team.members = team.members.filter(m => m.toString() !== req.params.userId);
    team.memberJoinDates.delete(req.params.userId);
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
      .populate('members', 'name email role')
      .populate('teamLead', 'name email')
      .lean();

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/teams/my-team/stats — team lead gets team-specific stats
router.get('/my-team/stats', protect, authorize('team_leader'), async (req, res) => {
  try {
    const { range = '30' } = req.query;
    const team = await Team.findOne({ teamLead: req.user._id });
    if (!team) {
      return res.status(403).json({ message: 'You are not a team lead' });
    }

    const memberIds = team.members.map(m => m.toString());
    const payload = await buildAnalyticsPayload({
      filter: { analyzedBy: { $in: memberIds } },
      scopeLabel: `Team: ${team.name}`,
      scopeDetails: {
        teamId: team._id,
        teamName: team.name,
        memberCount: memberIds.length,
      },
      range,
      postFetchFilter: (report) => {
        const analyzedById = report.analyzedBy?._id?.toString?.() || report.analyzedBy?.toString?.();
        const joinDate = team.memberJoinDates?.get?.(analyzedById);
        if (!joinDate) return true;
        return new Date(report.createdAt) >= new Date(joinDate);
      },
    });

    res.json({
      range,
      totalMembers: memberIds.length,
      totalReports: payload.summary.totalReports,
      totalErrors: payload.summary.totalErrors,
      timeSaved: Math.round(payload.summary.totalTimeSaved),
      manualTime: payload.summary.manualTime,
      aiTime: payload.summary.aiTime,
      timeSavedPercent: payload.summary.timeSavedPercent,
      errorBreakdown: payload.errorBreakdown,
      qualityBreakdown: {
        passed: payload.qualityBreakdown.good,
        failed: payload.qualityBreakdown.bad,
        uncertain: payload.qualityBreakdown.uncertain,
        pending: payload.summary.pendingReports,
      },
      summary: payload.summary,
      scopeLabel: payload.scopeLabel,
      scopeDetails: payload.scopeDetails,
      trendData: payload.trendData,
      passFailRateTrends: payload.passFailRateTrends,
      qualityScoreTrend: payload.qualityScoreTrend,
      mostCommonErrorTypes: payload.mostCommonErrorTypes,
      checklistFailureBreakdown: payload.checklistFailureBreakdown,
      topErrors: payload.topErrors,
      recentReports: payload.recentReports.map((report) => ({
        ...report,
        result: report.qualityLabel,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/teams/my-team/comparison?primaryUserId=xxx&secondaryUserId=xxx&range=7|30|90|all
router.get('/my-team/comparison', protect, authorize('team_leader'), async (req, res) => {
  try {
    const { primaryUserId, secondaryUserId, range = '30' } = req.query;

    if (!primaryUserId || !secondaryUserId) {
      return res.status(400).json({ message: 'Two users are required for comparison' });
    }

    if (primaryUserId === secondaryUserId) {
      return res.status(400).json({ message: 'Comparison requires two different users' });
    }

    const team = await Team.findOne({ teamLead: req.user._id })
      .populate('members', 'name email role')
      .lean();

    if (!team) {
      return res.status(403).json({ message: 'You are not a team lead' });
    }

    const teamMemberIds = new Set(team.members.map((member) => member._id.toString()));
    if (!teamMemberIds.has(primaryUserId) || !teamMemberIds.has(secondaryUserId)) {
      return res.status(403).json({ message: 'You can only compare members of your own team' });
    }

    const selectedMembers = team.members.filter((member) =>
      member._id.toString() === primaryUserId || member._id.toString() === secondaryUserId
    );

    const memberById = new Map(
      selectedMembers.map((member) => [member._id.toString(), member])
    );

    const buildMemberScope = async (memberId) => {
      const member = memberById.get(memberId);
      const joinDate = team.memberJoinDates?.[memberId] || team.memberJoinDates?.get?.(memberId) || null;

      return buildAnalyticsPayload({
        filter: {
          analyzedBy: memberId,
          ...(joinDate ? { createdAt: { $gte: joinDate } } : {}),
        },
        scopeLabel: `User: ${member.name}`,
        scopeDetails: {
          userId: member._id,
          userName: member.name,
          userEmail: member.email,
          userRole: member.role,
          teamId: team._id,
          teamName: team.name,
        },
        range,
      });
    };

    const [primaryScope, secondaryScope] = await Promise.all([
      buildMemberScope(primaryUserId),
      buildMemberScope(secondaryUserId),
    ]);

    return res.json({
      range,
      comparisonMode: true,
      comparisonType: 'user',
      teamId: team._id,
      teamName: team.name,
      primaryScope,
      secondaryScope,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/teams/my-team/announcements — all team members can view
router.get('/my-team/announcements', protect, async (req, res) => {
  try {
    const team = await Team.findOne({ members: req.user._id })
      .populate('announcements.createdBy', 'name')
      .lean();
    if (!team) return res.status(404).json({ message: 'You are not part of any team' });

    const userId = req.user._id.toString();
    const sorted = (team.announcements || [])
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(ann => ({
        ...ann,
        readByMe: (ann.readBy || []).some(id => id.toString() === userId),
      }));

    res.json(sorted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/teams/my-team/announcements — team leader only
router.post('/my-team/announcements', protect, authorize('team_leader'), async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!title?.trim() || !content?.trim()) {
      return res.status(400).json({ message: 'Title and content are required' });
    }

    const team = await Team.findOne({ teamLead: req.user._id });
    if (!team) return res.status(403).json({ message: 'You are not a team lead' });

    team.announcements.push({ title: title.trim(), content: content.trim(), createdBy: req.user._id });
    await team.save();

    const saved = team.announcements[team.announcements.length - 1];
    res.status(201).json({
      ...saved.toObject(),
      createdBy: { _id: req.user._id, name: req.user.name },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/teams/my-team/announcements/:announcementId — team leader only
router.delete('/my-team/announcements/:announcementId', protect, authorize('team_leader'), async (req, res) => {
  try {
    const team = await Team.findOne({ teamLead: req.user._id });
    if (!team) return res.status(403).json({ message: 'You are not a team lead' });

    const announcement = team.announcements.id(req.params.announcementId);
    if (!announcement) return res.status(404).json({ message: 'Announcement not found' });

    announcement.deleteOne();
    await team.save();
    res.json({ message: 'Announcement deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/teams/my-team/announcements/:announcementId/read — mark as read for current user
router.patch('/my-team/announcements/:announcementId/read', protect, async (req, res) => {
  try {
    const team = await Team.findOne({ members: req.user._id });
    if (!team) return res.status(404).json({ message: 'You are not part of any team' });

    const announcement = team.announcements.id(req.params.announcementId);
    if (!announcement) return res.status(404).json({ message: 'Announcement not found' });

    const alreadyRead = announcement.readBy.some(id => id.toString() === req.user._id.toString());
    if (!alreadyRead) {
      announcement.readBy.push(req.user._id);
      await team.save();
    }

    res.json({ message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/teams/my-team/goals — all team members can view goals + current progress
router.get('/my-team/goals', protect, async (req, res) => {
  try {
    const team = await Team.findOne({ members: req.user._id });
    if (!team) return res.status(404).json({ message: 'You are not part of any team' });

    const memberIds = team.members.map(m => m.toString());
    const allReports = await Report.find({ analyzedBy: { $in: memberIds } });

    // Filter by join date
    const reports = allReports.filter(r => {
      const joinDate = team.memberJoinDates?.get(r.analyzedBy.toString());
      if (!joinDate) return true;
      return new Date(r.createdAt) >= new Date(joinDate);
    });

    const totalReports = reports.length;
    const analyzedReports = reports.filter(r => r.status === 'analyzed');
    const passedReports = analyzedReports.filter(r => r.qualityAssessment?.label === 'good').length;
    const passRate = analyzedReports.length > 0
      ? Math.round((passedReports / analyzedReports.length) * 100)
      : 0;
    const totalErrors = reports.reduce((sum, r) => sum + (r.errorCount || 0), 0);
    const avgErrors = analyzedReports.length > 0
      ? Number((totalErrors / analyzedReports.length).toFixed(1))
      : 0;

    const current = { pass_rate: passRate, reports_submitted: totalReports, avg_errors_below: avgErrors };

    res.json({ goals: team.goals || [], current });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/teams/my-team/goals — team leader creates a goal
router.post('/my-team/goals', protect, authorize('team_leader'), async (req, res) => {
  try {
    const { title, type, target, deadline } = req.body;

    if (!title || !type || target == null) {
      return res.status(400).json({ message: 'title, type and target are required' });
    }

    const validTypes = ['pass_rate', 'reports_submitted', 'avg_errors_below'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ message: 'Invalid goal type' });
    }

    const team = await Team.findOne({ teamLead: req.user._id });
    if (!team) return res.status(403).json({ message: 'You are not a team lead' });

    team.goals.push({ title, type, target, deadline: deadline || null });
    await team.save();

    res.status(201).json(team.goals[team.goals.length - 1]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/teams/my-team/goals/:goalId — team leader deletes a goal
router.delete('/my-team/goals/:goalId', protect, authorize('team_leader'), async (req, res) => {
  try {
    const team = await Team.findOne({ teamLead: req.user._id });
    if (!team) return res.status(403).json({ message: 'You are not a team lead' });

    const goal = team.goals.id(req.params.goalId);
    if (!goal) return res.status(404).json({ message: 'Goal not found' });

    goal.deleteOne();
    await team.save();

    res.json({ message: 'Goal deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
