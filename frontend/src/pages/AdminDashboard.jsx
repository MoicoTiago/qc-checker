import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  BarChart3,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  Eye,
  FileText,
  Filter,
  KeyRound,
  Loader2,
  LogIn,
  Search,
  Shield,
  Trash2,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import Header from '../components/Header';
import Footer from '../components/Footer';
import api from '../services/api';

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'users', label: 'Users' },
  { id: 'manage', label: 'Manage' },
  { id: 'reports', label: 'Reports' },
  { id: 'training', label: 'AI Training' },
  { id: 'teams', label: 'Teams' },
  { id: 'security', label: 'Security' },
];

const COLORS = ['#6366f1', '#f59e0b', '#ef4444', '#10b981', '#3b82f6'];

const formatDate = (value) => {
  if (!value) {
    return 'N/A';
  }

  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatMinutes = (value) => {
  const minutes = Number(value) || 0;
  const roundedMinutes = Math.round(minutes);

  if (roundedMinutes < 60) {
    return `${roundedMinutes} min`;
  }

  const hours = roundedMinutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
};

const getStatusOutlineClass = (status) => {
  const normalizedStatus = String(status || '').toLowerCase();

  if (normalizedStatus.includes('pending')) {
    return 'border-orange-400 text-orange-700 dark:text-orange-300';
  }

  if (normalizedStatus === 'active') {
    return 'border-green-400 text-green-700 dark:text-green-300';
  }

  if (normalizedStatus.includes('inactive')) {
    return 'border-red-400 text-red-700 dark:text-red-300';
  }

  return 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300';
};

const AdminDashboard = () => {
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState('overview'); 
  //overview is the starting tab when admin navigates to the dashboard
  const [manageView, setManageView] = useState('users');
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('user');
  const [searchTerm, setSearchTerm] = useState('');
  const [reportSearch, setReportSearch] = useState('');
  const [expandedReports, setExpandedReports] = useState({});
  const [openTrainingMenu, setOpenTrainingMenu] = useState(null);
  const [users, setUsers] = useState([]);
  const [reports, setReports] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingReports, setLoadingReports] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [resettingUserId, setResettingUserId] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [requestsMessage, setRequestsMessage] = useState('');
  const [requestsError, setRequestsError] = useState('');
  const [deletingUserId, setDeletingUserId] = useState('');
  const [passwordResetRequests, setPasswordResetRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [reportsError, setReportsError] = useState('');
  
  // Overview filters
  const [filterRange, setFilterRange] = useState('all');
  const [filterTeam, setFilterTeam] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterResult, setFilterResult] = useState('');

  // ===== OVERVIEW TAB RENDER =====
// Shows KPIs: reports/errors/time saved + pie/bar charts.
// Filters (range/team/user/result) trigger fetchDashboardData re-fetch via useEffect.


  const [dashboardStats, setDashboardStats] = useState({
    totalReports: 0,
    totalErrors: 0,
    timeSaved: 0,
    manualTime: 0,
    aiTime: 0,
    timeSavedPercent: 0,
    errorBreakdown: [
      { name: 'Placeholder', value: 0 },
      { name: 'Consistency', value: 0 },
      { name: 'Compliance', value: 0 },
      { name: 'Formatting', value: 0 },
      { name: 'Missing Data', value: 0 },
    ],
  });

  // --- Teams state ---
  const [newTeamName, setNewTeamName] = useState('');
  const [teamError, setTeamError] = useState('');
  const [teamCreating, setTeamCreating] = useState(false);
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [manageTeamId, setManageTeamId] = useState(null);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [addingMembers, setAddingMembers] = useState(false);
  const [showViewMembers, setShowViewMembers] = useState(false);
  const [confirmRemoveMember, setConfirmRemoveMember] = useState(null);
  const [showAssignLead, setShowAssignLead] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [confirmLead, setConfirmLead] = useState(null);
  const [leadSuccessMessage, setLeadSuccessMessage] = useState('');
  const [confirmDeleteTeam, setConfirmDeleteTeam] = useState(false);
  const [showTeamAnalytics, setShowTeamAnalytics] = useState(false);
  const [teamStats, setTeamStats] = useState(null);
  const [teamStatsLoading, setTeamStatsLoading] = useState(false);
  const [teamFilterRange, setTeamFilterRange] = useState('all');
  const [teamFilterUser, setTeamFilterUser] = useState('');
  const [teamFilterResult, setTeamFilterResult] = useState('');

  // User profile analytics (shown when filtering by a specific user)
  const [userProfileAnalytics, setUserProfileAnalytics] = useState(null);
  const [userProfileLoading, setUserProfileLoading] = useState(false);
  const [teamUserProfileAnalytics, setTeamUserProfileAnalytics] = useState(null);
  const [teamUserProfileLoading, setTeamUserProfileLoading] = useState(false);

  // --- Training state ---
  const [trainingExamples, setTrainingExamples] = useState([]);
  const [trainingStats, setTrainingStats] = useState({
    totalExamples: 0,
    trainedExamples: 0,
    pendingExamples: 0,
    goodExamples: 0,
    badExamples: 0,
    templates: 0,
  });
  const [loadingTraining, setLoadingTraining] = useState(true);
  const [trainingFile, setTrainingFile] = useState(null);
  const [trainingType, setTrainingType] = useState('good');
  const [uploadingTraining, setUploadingTraining] = useState(false);
  const [trainingMessage, setTrainingMessage] = useState('');
  const [trainingError, setTrainingError] = useState('');
  const [syncingTraining, setSyncingTraining] = useState(false);
  const [deletingExampleId, setDeletingExampleId] = useState('');
  const [activatingTemplateId, setActivatingTemplateId] = useState('');
  const [dragActive, setDragActive] = useState(false);

  // --- Security / Audit state ---
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditSummary, setAuditSummary] = useState({ successCount: 0, failedCount: 0, inactiveCount: 0 });
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditFilter, setAuditFilter] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(1);

  // --- Analytics state --- 
  
  // ===== ANALYTICS TAB RENDER =====  
// Drill-down views: company/team/user level + comparisons.
// Trends for pass rates, quality scores, error types, checklist failures.
  const [analyticsLevel, setAnalyticsLevel] = useState('company');
  const [analyticsTeamId, setAnalyticsTeamId] = useState('');
  const [analyticsCompareTeamId, setAnalyticsCompareTeamId] = useState('');
  const [analyticsUserId, setAnalyticsUserId] = useState('');
  const [analyticsCompareUserId, setAnalyticsCompareUserId] = useState('');
  const [analyticsRange, setAnalyticsRange] = useState('30');
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [analyticsError, setAnalyticsError] = useState('');
  const [analyticsComparisonEnabled, setAnalyticsComparisonEnabled] = useState(false);

  // `users` is consumed by both the Users tab *and* the Manage tab's User Actions view, so this
  // single fetch backs both screens. Load errors surface through `errorMessage` (the Users tab
  // banner) because that's where the admin first lands; Manage-tab-initiated mutations use the
  // `requestsMessage`/`requestsError` channel instead to avoid cross-tab flicker.
  const fetchUsers = async () => {
    setLoadingUsers(true);

    try {
      const response = await api.get('/users');
      setUsers(response.data);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error.response?.data?.message || 'Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchTeams = async () => {
    try {
      const response = await api.get('/admin/teams');
      setTeams(response.data);
    } catch (error) {
      console.error('Failed to load teams:', error);
    }
  };

  // Results are written to requestsMessage/requestsError (the Manage tab banners) rather than
  // successMessage/errorMessage, which are reserved for the Users tab's create-user flow.
  // `deletingUserId` is mirrored in the row's disabled logic to block concurrent reset + delete.
  const handleDeleteUser = async (userId, userName) => {
    const confirmed = window.confirm(`Are you sure you want to delete ${userName}?`)

    if (!confirmed){
      return;
    }

    setDeletingUserId(userId);
    setRequestsMessage('');
    setRequestsError('');

    try{
      const response = await api.delete(`/users/${userId}`);
      setRequestsMessage(response.data.message || 'User deleted successfully');
      await fetchUsers();
    } catch(error) {
      setRequestsError(error.response?.data?.message || 'Failed to delete this user');
    } finally {
      setDeletingUserId('')
    }
  };

  const mapReportStats = (statsData) => {
    const totalReports = statsData?.totalReports || 0;
    const totalErrors = statsData?.totalErrors || 0;
    const timeSaved = Math.round(
      statsData?.totalTimeSavedMinutes ??
      statsData?.totalTimeSaved ??
      statsData?.timeSaved ??
      0
    );
    const manualTime = Math.round(
      statsData?.totalManualReviewMinutes ??
      statsData?.manualTime ??
      0
    );
    const aiTime = Math.round(
      statsData?.totalAiReviewMinutes ??
      statsData?.aiTime ??
      0
    );
    const timeSavedPercent =
      statsData?.timeSavedPercent ??
      (manualTime > 0 ? Math.round((timeSaved / manualTime) * 100) : 0);

    return {
      totalReports,
      totalErrors,
      timeSaved,
      manualTime,
      aiTime,
      timeSavedPercent,
      errorBreakdown: [
        { name: 'Placeholder', value: statsData?.placeholderErrors || 0 },
        { name: 'Consistency', value: statsData?.consistencyErrors || 0 },
        { name: 'Compliance', value: statsData?.complianceErrors || 0 },
        { name: 'Formatting', value: statsData?.formattingErrors || 0 },
        { name: 'Missing Data', value: statsData?.missingDataErrors || 0 },
      ],
    };
  };

  const fetchDashboardData = async (range = filterRange, team = filterTeam, userId = filterUser, result = filterResult) => {
    setLoadingReports(true);

    // Build query string from active filters
    const params = new URLSearchParams();
    if (range && range !== 'all') params.append('range', range);
    if (team) params.append('team', team);
    if (userId) params.append('user', userId);
    if (result) params.append('result', result);
    const qs = params.toString() ? `?${params.toString()}` : '';

    // Two-tier fetch: try the admin-scoped endpoints first (they honour the Overview tab's
    // team/user/result/range filters and return the full cross-user report list for the Reports
    // tab), and fall back to the user-scoped endpoints if the caller isn't an admin at that
    // moment (e.g. role was demoted mid-session). Keeping both in one `fetchDashboardData`
    // guarantees the Overview stats and the Reports-tab list never drift out of sync.
    try {
      const [statsResponse, reportsResponse] = await Promise.all([
        api.get(`/admin/stats${qs}`),
        api.get('/admin/reports'),
      ]);

      setDashboardStats({
        ...mapReportStats({
          totalReports: statsResponse.data?.totalReports,
          totalErrors: statsResponse.data?.totalErrors,
          timeSaved: statsResponse.data?.timeSaved,
          placeholderErrors: statsResponse.data?.errorBreakdown?.find((e) => e.name === 'Placeholder')?.value || 0,
          consistencyErrors: statsResponse.data?.errorBreakdown?.find((e) => e.name === 'Consistency')?.value || 0,
          complianceErrors: statsResponse.data?.errorBreakdown?.find((e) => e.name === 'Compliance')?.value || 0,
          formattingErrors: statsResponse.data?.errorBreakdown?.find((e) => e.name === 'Formatting')?.value || 0,
          missingDataErrors: statsResponse.data?.errorBreakdown?.find((e) => e.name === 'Missing Data')?.value || 0,
          totalTimeSavedMinutes: statsResponse.data?.totalTimeSavedMinutes,
          totalTimeSaved: statsResponse.data?.timeSaved,
          totalManualReviewMinutes: statsResponse.data?.totalManualReviewMinutes,
          totalAiReviewMinutes: statsResponse.data?.totalAiReviewMinutes,
          manualTime: statsResponse.data?.manualTime,
          aiTime: statsResponse.data?.aiTime,
          timeSavedPercent: statsResponse.data?.timeSavedPercent,
        }),
        manualTime: statsResponse.data?.totalManualReviewMinutes ?? statsResponse.data?.manualTime ?? 0,
        aiTime: statsResponse.data?.totalAiReviewMinutes ?? statsResponse.data?.aiTime ?? 0,
        timeSavedPercent: statsResponse.data?.timeSavedPercent || 0,
        errorBreakdown: statsResponse.data?.errorBreakdown || [],
        qualityBreakdown: statsResponse.data?.qualityBreakdown || null,
      });
      setReports(reportsResponse.data || []);
      setReportsError('');
    } catch (adminError) {
      try {
        const [statsResponse, reportsResponse] = await Promise.all([
          api.get('/reports/stats'),
          api.get('/reports'),
        ]);

        setDashboardStats(mapReportStats(statsResponse.data));
        setReports(reportsResponse.data || []);
        setReportsError('');
      } catch (fallbackError) {
        setReportsError(
          fallbackError.response?.data?.message || 'Failed to load report analytics'
        );
      }
    } finally {
      setLoadingReports(false);
    }
  };

  // Re-fetch stats when any filter changes
  useEffect(() => {
    fetchDashboardData(filterRange, filterTeam, filterUser, filterResult);
  }, [filterRange, filterTeam, filterUser, filterResult]);

  // Fetch user profile analytics when a specific user is selected in the overview filter
  useEffect(() => {
    if (!filterUser) {
      setUserProfileAnalytics(null);
      return;
    }
    const fetchUserProfile = async () => {
      setUserProfileLoading(true);
      try {
        const res = await api.get(`/admin/users/${filterUser}/profile-analytics`);
        setUserProfileAnalytics(res.data);
      } catch {
        setUserProfileAnalytics(null);
      } finally {
        setUserProfileLoading(false);
      }
    };
    fetchUserProfile();
  }, [filterUser]);

  // Fetch user profile analytics when a specific member is selected in the team analytics filter
  useEffect(() => {
    if (!teamFilterUser) {
      setTeamUserProfileAnalytics(null);
      return;
    }
    const fetchTeamUserProfile = async () => {
      setTeamUserProfileLoading(true);
      try {
        const res = await api.get(`/admin/users/${teamFilterUser}/profile-analytics`);
        setTeamUserProfileAnalytics(res.data);
      } catch {
        setTeamUserProfileAnalytics(null);
      } finally {
        setTeamUserProfileLoading(false);
      }
    };
    fetchTeamUserProfile();
  }, [teamFilterUser]);

  const fetchAuditLogs = async (filter = auditFilter, page = auditPage) => {
    setAuditLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 50 });
      if (filter) params.append('action', filter);
      const res = await api.get(`/admin/audit-logs?${params}`);
      setAuditLogs(res.data.logs);
      setAuditSummary(res.data.summary24h);
      setAuditTotalPages(res.data.pages);
    } catch (err) {
      console.error('Failed to load audit logs', err);
    } finally {
      setAuditLoading(false);
    }
  };

  const fetchTrainingData = async () => {
    setLoadingTraining(true);
    try {
      const [examplesRes, statsRes] = await Promise.all([
        api.get('/admin/training/examples'),
        api.get('/admin/training/stats'),
      ]);
      setTrainingExamples(examplesRes.data);
      setTrainingStats(statsRes.data);
      setTrainingError('');
    } catch (error) {
      setTrainingError(error.response?.data?.message || 'Failed to load training data');
    } finally {
      setLoadingTraining(false);
    }
  };

  const handleTrainingUpload = async (e) => {
    e.preventDefault();
    if (!trainingFile) {
      setTrainingError('Please select a PDF file');
      return;
    }

    setUploadingTraining(true);
    setTrainingMessage('');
    setTrainingError('');

    const formData = new FormData();
    formData.append('pdf', trainingFile);
    formData.append('type', trainingType);

    try {
      const response = await api.post('/admin/training/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setTrainingMessage(response.data.message || 'Training example uploaded successfully');
      setTrainingFile(null);
      setTrainingType('good');
      await fetchTrainingData();
    } catch (error) {
      setTrainingError(error.response?.data?.message || 'Failed to upload training example');
    } finally {
      setUploadingTraining(false);
    }
  };

  const handleActivateTemplate = async (exampleId) => {
    setActivatingTemplateId(exampleId);
    setTrainingMessage('');
    setTrainingError('');

    try {
      const response = await api.patch(`/admin/training/examples/${exampleId}/activate`);
      setTrainingMessage(response.data.message || 'Template activated');
      await fetchTrainingData();
    } catch (error) {
      setTrainingError(error.response?.data?.message || 'Failed to activate template');
    } finally {
      setActivatingTemplateId('');
    }
  };

  const handleDeleteTrainingExample = async (exampleId) => {
    if (!window.confirm('Are you sure you want to delete this training example?')) return;

    setDeletingExampleId(exampleId);
    setTrainingMessage('');
    setTrainingError('');

    try {
      const response = await api.delete(`/admin/training/examples/${exampleId}`);
      setTrainingMessage(response.data.message || 'Training example deleted');
      await fetchTrainingData();
    } catch (error) {
      setTrainingError(error.response?.data?.message || 'Failed to delete training example');
    } finally {
      setDeletingExampleId('');
    }
  };

  const handleSyncTraining = async () => {
    setSyncingTraining(true);
    setTrainingMessage('');
    setTrainingError('');

    try {
      const response = await api.post('/admin/training/sync');
      setTrainingMessage(response.data.message || 'Training examples synced');
      await fetchTrainingData();
    } catch (error) {
      setTrainingError(error.response?.data?.message || 'Failed to sync training');
    } finally {
      setSyncingTraining(false);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'application/pdf') {
        setTrainingFile(file);
        setTrainingError('');
      } else {
        setTrainingError('Only PDF files are allowed');
      }
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setTrainingFile(e.target.files[0]);
      setTrainingError('');
    }
  };

  const fetchAnalytics = async () => {
    setLoadingAnalytics(true);
    setAnalyticsError('');
    try {
      const params = new URLSearchParams({ level: analyticsLevel, range: analyticsRange });
      if (analyticsLevel === 'team' && analyticsTeamId) {
        params.append('teamId', analyticsTeamId);
        if (analyticsComparisonEnabled && analyticsCompareTeamId) {
          params.append('compareTeamId', analyticsCompareTeamId);
        }
      }
      if (analyticsLevel === 'user' && analyticsUserId) {
        params.append('userId', analyticsUserId);
        if (analyticsComparisonEnabled && analyticsCompareUserId) {
          params.append('compareUserId', analyticsCompareUserId);
        }
      }
      const response = await api.get(`/admin/analytics?${params.toString()}`);
      setAnalyticsData(response.data);
    } catch (error) {
      setAnalyticsError(error.response?.data?.message || 'Failed to load analytics');
    } finally {
      setLoadingAnalytics(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchPasswordResetRequest();
    fetchTeams();
    fetchTrainingData();
  }, []);

  useEffect(() => {
    if (activeTab === 'security') {
      fetchAuditLogs(auditFilter, auditPage);
    }
  }, [activeTab, auditFilter, auditPage]);

  useEffect(() => {
    if (activeTab === 'analytics') {
      fetchAnalytics();
    }
  }, [
    activeTab,
    analyticsLevel,
    analyticsTeamId,
    analyticsCompareTeamId,
    analyticsUserId,
    analyticsCompareUserId,
    analyticsRange,
    analyticsComparisonEnabled,
  ]);

  const stats = [
    { label: 'Total Users', value: users.length, icon: Users, color: 'bg-blue-500' },
    { label: 'Reports Analyzed', value: dashboardStats.totalReports, icon: FileText, color: 'bg-green-500' },
    { label: 'Total Errors Found', value: dashboardStats.totalErrors, icon: AlertTriangle, color: 'bg-red-500' },
    { label: 'Time Saved', value: formatMinutes(dashboardStats.timeSaved), icon: Clock, color: 'bg-amber-500' },
  ];

  const barData = dashboardStats.errorBreakdown.map((entry) => ({
    name: entry.name,
    errors: entry.value,
  }));

  const timeSavingsCards = [
    { label: 'Manual Review Time', value: formatMinutes(dashboardStats.manualTime), bg: 'bg-purple-100', text: 'text-indigo-600' },
    { label: 'AI Review Time', value: formatMinutes(dashboardStats.aiTime), bg: 'bg-green-100', text: 'text-green-600' },
    { label: 'Time Saved', value: `${dashboardStats.timeSavedPercent}%`, bg: 'bg-purple-100', text: 'text-purple-600' },
  ];

  const errorSummaryCards = [
    { key: 'placeholder', label: 'Placeholder', valueClass: 'text-orange-600', cardClass: 'bg-orange-50' },
    { key: 'consistency', label: 'Consistency', valueClass: 'text-blue-600', cardClass: 'bg-blue-50' },
    { key: 'compliance', label: 'Compliance', valueClass: 'text-red-600', cardClass: 'bg-red-50' },
    { key: 'formatting', label: 'Formatting', valueClass: 'text-purple-600', cardClass: 'bg-purple-50' },
    { key: 'missing_data', label: 'Missing Data', valueClass: 'text-green-600', cardClass: 'bg-green-50' },
  ];

  const errorTypeLabelMap = {
    placeholder: 'Placeholder', consistency: 'Consistency', compliance: 'Compliance',
    formatting: 'Formatting', missing_data: 'Missing Data',
  };
  const errorTypeColors = ['#F97316', '#2563EB', '#DC2626', '#9333EA', '#16A34A'];
  const adminPassRateChartData = analyticsData?.passFailRateTrends?.map((item, index) => ({
    pointIndex: index,
    periodKey: `${item.periodLabel}-${index}`,
    periodLabel: item.periodLabel,
    analyzedCount: Number(item.analyzedCount ?? 0),
    passedCount: Number(item.passedCount ?? 0),
    failedCount: Number(item.failedCount ?? 0),
    passRate: Number(item.passRate ?? 0),
  })) || [];
  const adminPassRateLabelMap = Object.fromEntries(
    adminPassRateChartData.map((item) => [item.periodKey, item.periodLabel])
  );
  const adminQualityScoreMaxValue = analyticsData?.qualityScoreTrend?.reduce(
    (max, report) => Math.max(max, report.qualityScore || 0),
    0
  ) ?? 0;
  const adminQualityScoreChartData = analyticsData?.qualityScoreTrend?.map((report, index) => ({
    pointIndex: index,
    pointKey: report._id || `${report.filename}-${index}`,
    label: report.filename.length > 18 ? `${report.filename.slice(0, 18)}...` : report.filename,
    fullLabel: report.filename,
    score: Number(report.qualityScore ?? 0),
    date: formatDate(report.createdAt),
  })) || [];
  const adminQualityScoreLabelMap = Object.fromEntries(
    adminQualityScoreChartData.map((item) => [item.pointKey, item.label])
  );
  const adminCommonErrorTypeChartData = analyticsData?.mostCommonErrorTypes?.map((item, index) => ({
    name: errorTypeLabelMap[item.type] || item.type,
    errors: item.count,
    reportsAffected: item.reportsAffected,
    fill: errorTypeColors[index % errorTypeColors.length],
  })) || [];
  const adminChecklistFailureChartData = analyticsData?.checklistFailureBreakdown?.map((item) => ({
    shortLabel: item.message.length > 28 ? `${item.message.slice(0, 28)}...` : item.message,
    fullLabel: item.message,
    count: item.count,
  })) || [];
  const analyticsComparisonActive = Boolean(analyticsData?.comparisonMode);
  const comparisonPrimaryScope = analyticsData?.primaryScope || null;
  const comparisonSecondaryScope = analyticsData?.secondaryScope || null;
  const comparisonColours = {
    primary: '#6366f1',
    secondary: '#10b981',
  };

  const buildMergedPeriodSeries = (primary = [], secondary = [], valueKey) => {
    const merged = new Map();

    primary.forEach((item) => {
      const key = item.periodKey || item.periodLabel || item.period;
      merged.set(key, {
        periodKey: key,
        periodLabel: item.periodLabel || item.period || key,
        primaryValue: Number(item[valueKey] ?? 0),
        secondaryValue: null,
      });
    });

    secondary.forEach((item) => {
      const key = item.periodKey || item.periodLabel || item.period;
      if (!merged.has(key)) {
        merged.set(key, {
          periodKey: key,
          periodLabel: item.periodLabel || item.period || key,
          primaryValue: null,
          secondaryValue: null,
        });
      }
      merged.get(key).secondaryValue = Number(item[valueKey] ?? 0);
    });

    return Array.from(merged.values()).map((item, index) => ({
      ...item,
      pointIndex: index,
    }));
  };

  const buildMergedErrorTypeSeries = (primary = [], secondary = []) => {
    const merged = new Map();

    primary.forEach((item) => {
      merged.set(item.name, {
        name: item.name,
        primaryValue: Number(item.value ?? item.errors ?? 0),
        secondaryValue: 0,
      });
    });

    secondary.forEach((item) => {
      if (!merged.has(item.name)) {
        merged.set(item.name, {
          name: item.name,
          primaryValue: 0,
          secondaryValue: 0,
        });
      }
      merged.get(item.name).secondaryValue = Number(item.value ?? item.errors ?? 0);
    });

    return Array.from(merged.values());
  };

  const buildMergedQualityScoreSeries = (primary = [], secondary = []) => {
    const maxLength = Math.max(primary.length, secondary.length);

    return Array.from({ length: maxLength }, (_, index) => {
      const primaryItem = primary[index];
      const secondaryItem = secondary[index];

      return {
        pointIndex: index,
        pointLabel: `Report ${index + 1}`,
        primaryDate: primaryItem?.createdAt ? formatDate(primaryItem.createdAt) : null,
        secondaryDate: secondaryItem?.createdAt ? formatDate(secondaryItem.createdAt) : null,
        primaryValue: primaryItem ? Number(primaryItem.qualityScore ?? 0) : null,
        secondaryValue: secondaryItem ? Number(secondaryItem.qualityScore ?? 0) : null,
      };
    });
  };

  const comparisonReportsChartData = analyticsComparisonActive
    ? buildMergedPeriodSeries(
        comparisonPrimaryScope?.trendData,
        comparisonSecondaryScope?.trendData,
        'reports'
      )
    : [];
  const comparisonPassRateChartData = analyticsComparisonActive
    ? buildMergedPeriodSeries(
        comparisonPrimaryScope?.passFailRateTrends,
        comparisonSecondaryScope?.passFailRateTrends,
        'passRate'
      )
    : [];
  const comparisonErrorTypeChartData = analyticsComparisonActive
    ? buildMergedErrorTypeSeries(
        comparisonPrimaryScope?.errorBreakdown,
        comparisonSecondaryScope?.errorBreakdown
      )
    : [];
  const comparisonQualityScoreChartData = analyticsComparisonActive
    ? buildMergedQualityScoreSeries(
        comparisonPrimaryScope?.qualityScoreTrend,
        comparisonSecondaryScope?.qualityScoreTrend
      )
    : [];
  const comparisonQualityScoreMaxValue = comparisonQualityScoreChartData.reduce(
    (max, item) => Math.max(max, item.primaryValue ?? 0, item.secondaryValue ?? 0),
    0
  );
  const comparisonSummaryCards = analyticsComparisonActive
    ? [
        ['Total Reports', comparisonPrimaryScope?.summary?.totalReports ?? 0, comparisonSecondaryScope?.summary?.totalReports ?? 0],
        ['Analysed', comparisonPrimaryScope?.summary?.analyzedReports ?? 0, comparisonSecondaryScope?.summary?.analyzedReports ?? 0],
        ['Total Errors', comparisonPrimaryScope?.summary?.totalErrors ?? 0, comparisonSecondaryScope?.summary?.totalErrors ?? 0],
        ['Avg Errors/Report', comparisonPrimaryScope?.summary?.averageErrorsPerReport ?? 0, comparisonSecondaryScope?.summary?.averageErrorsPerReport ?? 0],
        ['Pass Rate', `${comparisonPrimaryScope?.summary?.passRate ?? 0}%`, `${comparisonSecondaryScope?.summary?.passRate ?? 0}%`],
        ['Time Saved', formatMinutes(comparisonPrimaryScope?.summary?.totalTimeSaved), formatMinutes(comparisonSecondaryScope?.summary?.totalTimeSaved)],
      ]
    : [];
  const comparisonSelectionIncomplete = analyticsComparisonEnabled && (
    (analyticsLevel === 'team' && analyticsTeamId && !analyticsCompareTeamId) ||
    (analyticsLevel === 'user' && analyticsUserId && !analyticsCompareUserId)
  );
  const comparisonPrimaryHasNoReports = analyticsComparisonActive && (comparisonPrimaryScope?.summary?.totalReports ?? 0) === 0;
  const comparisonSecondaryHasNoReports = analyticsComparisonActive && (comparisonSecondaryScope?.summary?.totalReports ?? 0) === 0;
  const comparisonPrimaryHasNoAnalysed = analyticsComparisonActive && (comparisonPrimaryScope?.summary?.analyzedReports ?? 0) === 0;
  const comparisonSecondaryHasNoAnalysed = analyticsComparisonActive && (comparisonSecondaryScope?.summary?.analyzedReports ?? 0) === 0;

  const renderUserProfileStats = (analytics, loading) => {
    if (loading) {
      return (
        <div className="py-8 flex items-center justify-center text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2 text-indigo-600" />
          Loading user analytics...
        </div>
      );
    }
    if (!analytics) return null;

    const { summary, errorBreakdown, qualityBreakdown, mostCommonErrorTypes, checklistFailureBreakdown, qualityScoreTrend } = analytics;

    const averageErrorTypeBreakdown = errorSummaryCards.map((card) => {
      const totalForType = errorBreakdown?.[card.key] ?? 0;
      const analyzed = summary?.analyzedReports ?? 0;
      return { ...card, average: analyzed > 0 ? Number((totalForType / analyzed).toFixed(2)) : 0 };
    });

    const commonErrorTypeChartData = (mostCommonErrorTypes || []).map((item, index) => ({
      name: errorTypeLabelMap[item.type] || item.type,
      errors: item.count,
      fill: errorTypeColors[index % errorTypeColors.length],
    }));

    const checklistChartData = (checklistFailureBreakdown || []).map((item) => ({
      shortLabel: item.message.length > 28 ? `${item.message.slice(0, 28)}...` : item.message,
      fullLabel: item.message,
      count: item.count,
    }));

    const qualityScoreMaxValue = (qualityScoreTrend || []).reduce((max, r) => Math.max(max, r.qualityScore || 0), 0);
    const qualityScoreChartData = (qualityScoreTrend || []).map((r) => ({
      label: r.filename.length > 18 ? `${r.filename.slice(0, 18)}...` : r.filename,
      fullLabel: r.filename,
      score: r.qualityScore,
      date: formatDate(r.createdAt),
    }));

    const summaryCards = [
      { label: 'Total Reports', value: summary?.totalReports ?? 0, icon: FileText },
      { label: 'Analyzed Reports', value: summary?.analyzedReports ?? 0, icon: CheckCircle },
      { label: 'Total Errors', value: summary?.totalErrors ?? 0, icon: AlertCircle },
      { label: 'Average Errors', value: summary?.averageErrorsPerReport ?? 0, icon: BarChart3 },
      { label: 'Time Saved', value: formatMinutes(summary?.totalTimeSaved), icon: Clock },
    ];

    return (
      <div className="mt-4 space-y-6">
        {/* User info header */}
        {analytics.user && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3">
            <p className="text-sm font-semibold text-indigo-800">
              Individual Statistics for {analytics.user.name}
            </p>
            <p className="text-xs text-indigo-600">{analytics.user.email}</p>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="rounded-xl bg-gray-50 p-4 border border-gray-100">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">{card.label}</p>
                  <Icon className="w-5 h-5 text-indigo-600" />
                </div>
                <p className="text-2xl font-bold text-gray-900 mt-3">{card.value}</p>
              </div>
            );
          })}
        </div>

        {/* Passed / Failed */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Failed Reports</p>
            <p className="text-2xl font-semibold text-gray-900 mt-2">{summary?.failedReports ?? 0}</p>
          </div>
          <div className="rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Passed Reviews</p>
            <p className="text-2xl font-semibold text-gray-900 mt-2">{qualityBreakdown?.good ?? 0}</p>
          </div>
        </div>

        {/* Average Errors Per Report */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Average Errors Per Report</h3>
          <p className="text-sm text-gray-500 mt-1">The average number of each error type found per analyzed report.</p>
          <div className="rounded-xl border border-gray-200 p-5 mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
              {averageErrorTypeBreakdown.map((item) => (
                <div key={item.key} className={`rounded-xl px-4 py-4 text-center border border-transparent ${item.cardClass}`}>
                  <p className={`text-2xl font-bold ${item.valueClass}`}>{item.average}</p>
                  <p className="text-sm text-gray-700 mt-1">{item.label}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">Analyzed Reports</p>
                <p className="text-2xl font-semibold text-gray-900 dark:text-white mt-2">{summary?.analyzedReports ?? 0}</p>
              </div>
              <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">Overall Average Errors</p>
                <p className="text-2xl font-semibold text-gray-900 dark:text-white mt-2">{summary?.averageErrorsPerReport ?? 0}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quality Score Trend */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Quality Score Trend</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Per-report quality score over time.</p>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 mt-4">
            {qualityScoreTrend?.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={qualityScoreChartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, Math.max(qualityScoreMaxValue, 100)]} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value) => [`${value}`, 'Quality Score']}
                    labelFormatter={(label, payload) => {
                      const point = payload?.[0]?.payload;
                      return point ? `${point.fullLabel} - ${point.date}` : label;
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="score" name="Quality Score" stroke="#10B981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-500">No analyzed reports with quality scores yet.</p>
            )}
          </div>
        </div>

        {/* Most Common Error Types */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Most Common Error Types</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Ranked by frequency.</p>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 mt-4">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={commonErrorTypeChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => [`${value}`, 'Errors']} />
                <Bar dataKey="errors" name="Errors" radius={[6, 6, 0, 0]}>
                  {commonErrorTypeChartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Checklist Failures */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Top Recurring Checklist Failures</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">The most frequently repeated issue messages.</p>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 mt-4">
            {checklistFailureBreakdown?.length ? (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={checklistChartData} layout="vertical" margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="shortLabel" type="category" tick={{ fontSize: 12 }} width={55} />
                  <Tooltip
                    formatter={(value) => [`${value}`, 'Occurrences']}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.fullLabel || label}
                  />
                  <Bar dataKey="count" fill="#6366F1" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-500">No recurring checklist failures found yet.</p>
            )}
          </div>
        </div>

        {/* Recent Reports */}
        {analytics.recentReports?.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Recent Reports</h3>
            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Report</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Errors</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Result</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {analytics.recentReports.map((report) => (
                    <tr key={report._id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{report.filename}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          report.status === 'analyzed' ? 'bg-green-100 text-green-800' :
                          report.status === 'failed' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {report.status ? report.status.charAt(0).toUpperCase() + report.status.slice(1) : 'Unknown'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        {report.status === 'analyzed' ? (
                          <span className={`font-medium ${report.errorCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {report.errorCount} {report.errorCount === 1 ? 'error' : 'errors'}
                          </span>
                        ) : <span className="text-gray-400">-</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {report.status === 'analyzed' ? (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            report.qualityLabel === 'good' ? 'bg-green-100 text-green-800' :
                            report.qualityLabel === 'bad' ? 'bg-red-100 text-red-800' :
                            'bg-amber-100 text-amber-800'
                          }`}>
                            {report.qualityLabel === 'good' ? 'Passed' : report.qualityLabel === 'bad' ? 'Failed' : 'Uncertain'}
                          </span>
                        ) : <span className="text-sm text-gray-400">Pending</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{formatDate(report.createdAt)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                        <Link
                          to={`/report/${report._id}`}
                          className="text-indigo-600 hover:text-indigo-900 mr-3"
                          title="View Report"
                        >
                          <Eye className="w-4 h-4 inline" />
                        </Link>
                        <button
                          onClick={() => handleReportDownload(report._id, report.filename)}
                          className="text-gray-600 hover:text-gray-900 mr-3"
                          title="Download Summary"
                        >
                          <Download className="w-4 h-4 inline" />
                        </button>
                        <button
                          onClick={() => handleReportDelete(report._id)}
                          className="text-red-600 hover:text-red-900"
                          title="Delete Report"
                        >
                          <Trash2 className="w-4 h-4 inline" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const filteredUsers = users.filter((entry) => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) {
      return true;
    }

    return (
      entry.name?.toLowerCase().includes(query) ||
      entry.email?.toLowerCase().includes(query) ||
      entry.role?.toLowerCase().includes(query)
    );
  });

  // Uses its own `reportSearch` state (not the Manage-tab-shared `searchTerm`) because the match
  // shape is different here — filename + analyzer name rather than user identity fields — and
  // admins routinely keep a filename fragment in the Reports tab while searching by person in
  // Manage. Keeping the queries independent prevents cross-tab interference.
  const filteredReports = reports.filter((report) => {
    const query = reportSearch.trim().toLowerCase();

    if (!query) {
      return true;
    }

    return (
      report.filename?.toLowerCase().includes(query) ||
      report.analyzedBy?.name?.toLowerCase().includes(query)
    );
  });

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setSuccessMessage('');
    setErrorMessage('');

    try {
      const response = await api.post('/users', { name, email, role });

      setSuccessMessage(response.data.message);
      // Also clear the Manage-tab banner so a stale "user deleted" / "request rejected" message
      // from an earlier action doesn't linger underneath this fresh creation-success notice when
      // the admin switches tabs.
      setRequestsMessage('');
      setName('');
      setEmail('');
      setRole('user');
      setShowCreateUserModal(false);
      await fetchUsers();
    } catch (error) {
      setErrorMessage(error.response?.data?.message || 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  };

  // Shared handler for the Manage tab's user-actions row AND the pending-requests row; in the
  // requests view the UI keys its disabled/"Resetting..." state off `resettingUserId === request.user?._id`,
  // which is why this stores the *user* id, not a request id.
  const handleResetPassword = async (userId) => {
    setResettingUserId(userId);
    setRequestsMessage('');
    setRequestsError('');

    try {
      const response = await api.put(`/users/${userId}/reset-password`);
      setRequestsMessage(response.data.message || 'Password reset successfully');
    } catch (error) {
      setRequestsError(
        error.response?.data?.message || 'Failed to reset this user password'
      );
    } finally {
      setResettingUserId('');
    }
  };

  const openCreateUserModal = () => {
    setSuccessMessage('');
    setErrorMessage('');
    setShowCreateUserModal(true);
  };

  const closeCreateUserModal = () => {
    if (submitting) {
      return;
    }

    setShowCreateUserModal(false);
    setName('');
    setEmail('');
    setRole('user');
    setErrorMessage('');
  };

  // Scoped to pending only: completed/rejected requests stay on the backend for audit history
  // but must not appear in the Manage tab's action queue.
  const fetchPasswordResetRequest = async () =>{
    setLoadingRequests(true);

    try {
      const response = await api.get('/password-reset-requests?status=pending');
      setPasswordResetRequests(response.data);
      setRequestsError('');
    } catch (error) {
      setRequestsError(
        error.response?.data?.message || 'Failed to load password requests'
      );
    } finally {
      setLoadingRequests(false)
    }
  };

  // Re-fetch after success: the backend transitions the request out of the `pending` queue,
  // so the local list is stale until we reload it.
  const handleCompleteRequest = async (requestId) => {
    setRequestsMessage('');
    setRequestsError('');

    try{
      const response = await api.put(`/password-reset-requests/${requestId}/complete`);
      setRequestsMessage(response.data.message);
      await fetchPasswordResetRequest();
    } catch (error) {
      setRequestsError(error.response?.data?.message || 'Failed to complete password reset request');
    }
  };

  const handleRejectRequest = async (requestId) => {
    setRequestsMessage('');
    setRequestsError('');

    try {
      const response = await api.put(`/password-reset-requests/${requestId}/reject`, {
        notes: 'Rejected by Admin',
      });
      setRequestsMessage(response.data.message);
      await fetchPasswordResetRequest();
    } catch(error) {
      setRequestsError(error.response?.data?.message || 'Failed to reject password request');
    }
  };

  // Optimistic in-place update: the server returns the full updated report, but the Reports-tab
  // UI only needs these two fields to flip the badge from "+ Add to Training" to "✓ Good/Bad
  // Example", so we patch the row locally instead of re-fetching the entire list (which can run
  // to hundreds of rows). Errors surface in `reportsError`, the Reports-tab banner — not the
  // Manage-tab or Users-tab channels.
  const handleAddToTraining = async (reportId, label) => {
    try {
      await api.patch(`/admin/reports/${reportId}/training`, { trainingLabel: label });
      setReports((prev) =>
        prev.map((entry) =>
          entry._id === reportId
            ? { ...entry, addedToTraining: true, trainingLabel: label }
            : entry
        )
      );
      setOpenTrainingMenu(null);
    } catch (error) {
      setReportsError(error.response?.data?.message || 'Failed to add report to training');
    }
  };

  // --- Team handler functions ---
  const handleCreateTeam = async (e) => {
    e.preventDefault();
    setTeamError('');

    if (!newTeamName.trim()) {
      setTeamError('Team name is required');
      return;
    }

    setTeamCreating(true);
    try {
      const res = await api.post('/admin/teams', { name: newTeamName });
      setTeams(prev => [res.data, ...prev]);
      setNewTeamName('');
      setShowCreateTeamModal(false);
    } catch (err) {
      setTeamError(err.response?.data?.message || 'Failed to create team');
    } finally {
      setTeamCreating(false);
    }
  };

  const handleOpenAddMembers = () => {
    const team = teams.find(t => t._id === manageTeamId);
    const existingIds = (team?.members || []).map(m => m._id || m);
    setSelectedMemberIds(existingIds);
    setAddMemberSearch('');
    setShowAddMembers(true);
  };

  const toggleMemberSelection = (userId) => {
    setSelectedMemberIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleAddMembers = async () => {
    setAddingMembers(true);
    try {
      const res = await api.patch(`/admin/teams/${manageTeamId}/members`, { memberIds: selectedMemberIds });
      setTeams(prev => prev.map(t => t._id === manageTeamId ? res.data : t));
      setShowAddMembers(false);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to add members');
    } finally {
      setAddingMembers(false);
    }
  };

  const handleRemoveMember = async (userId) => {
    try {
      const res = await api.delete(`/admin/teams/${manageTeamId}/members/${userId}`);
      setTeams(prev => prev.map(t => t._id === manageTeamId ? res.data : t));
      setConfirmRemoveMember(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to remove member');
    }
  };

  const handleOpenAssignLead = () => {
    const team = teams.find(t => t._id === manageTeamId);
    setSelectedLeadId(team?.teamLead?._id || null);
    setConfirmLead(null);
    setShowAssignLead(true);
  };

  const handleConfirmAssignLead = async () => {
    try {
      const res = await api.patch(`/admin/teams/${manageTeamId}/lead`, { userId: confirmLead._id });
      setTeams(prev => prev.map(t => t._id === manageTeamId ? res.data : t));
      setLeadSuccessMessage(`${confirmLead.name} has been successfully assigned as team leader`);
      setTimeout(() => setLeadSuccessMessage(''), 4000);
      setConfirmLead(null);
      setShowAssignLead(false);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to assign team lead');
    }
  };

  const fetchTeamStats = async (range = teamFilterRange, userId = teamFilterUser, result = teamFilterResult) => {
    setTeamStatsLoading(true);
    try {
      const params = new URLSearchParams();
      if (range && range !== 'all') params.append('range', range);
      if (userId) params.append('user', userId);
      if (result) params.append('result', result);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await api.get(`/admin/teams/${manageTeamId}/stats${qs}`);
      setTeamStats(res.data);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to load team analytics');
      setShowTeamAnalytics(false);
    } finally {
      setTeamStatsLoading(false);
    }
  };

  const handleReportDownload = async (reportId, filename) => {
    try {
      const response = await api.get(`/reports/${reportId}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      const sanitised = filename.replace(/\.pdf$/i, '');
      link.setAttribute('download', `QC_Report_${sanitised}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to download report');
    }
  };

  const handleReportDelete = async (reportId) => {
    if (!window.confirm('Are you sure you want to delete this report?')) return;
    try {
      await api.delete(`/reports/${reportId}`);
      // Re-fetch team stats if viewing team analytics
      if (showTeamAnalytics) fetchTeamStats();
      // Re-fetch user profile analytics if viewing individual stats
      if (filterUser) {
        const res = await api.get(`/admin/users/${filterUser}/profile-analytics`);
        setUserProfileAnalytics(res.data);
      }
      if (teamFilterUser) {
        const res = await api.get(`/admin/users/${teamFilterUser}/profile-analytics`);
        setTeamUserProfileAnalytics(res.data);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete report');
    }
  };

  const handleOpenTeamAnalytics = async () => {
    setTeamFilterRange('all');
    setTeamFilterUser('');
    setTeamFilterResult('');
    setShowTeamAnalytics(true);
    fetchTeamStats('all', '', '');
  };

  const handleDeleteTeam = async () => {
    try {
      await api.delete(`/admin/teams/${manageTeamId}`);
      setTeams(prev => prev.filter(t => t._id !== manageTeamId));
      setConfirmDeleteTeam(false);
      setManageTeamId(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete team');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <Header />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Admin Dashboard</h1>
            <p className="text-gray-600 dark:text-gray-300">Manage users and monitor system analytics</p>
          </div>

          {activeTab === 'users' && (
            <button
              type="button"
              onClick={openCreateUserModal}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
            >
              Create User
            </button>
          )}
        </div>

        <div className="mb-8 border-b border-gray-200 dark:border-gray-700">
          <div className="flex gap-8 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`border-b-2 pb-4 text-sm font-semibold transition ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* overview tab active */}
        {activeTab === 'overview' && (
          <>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <p className="text-green-700 text-sm">
                <span className="font-semibold">Local AI Processing - Client Data Protected</span>
                <br />
                All AI processing is performed locally on your servers. Your confidential client
                data never leaves your infrastructure.
              </p>
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-4 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Filter className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-semibold text-gray-700 dark:text-white">Filter Analytics</h3>
                {(filterRange !== 'all' || filterTeam || filterUser || filterResult) && (
                  <button
                    onClick={() => { setFilterRange('all'); setFilterTeam(''); setFilterUser(''); setFilterResult(''); }}
                    className="ml-auto text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-white mb-1">Date Range</label>
                  <select
                    value={filterRange}
                    onChange={(e) => setFilterRange(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-white 
                    focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="all">All Time</option>
                    <option value="7">Last 7 Days</option>
                    <option value="30">Last 30 Days</option>
                    <option value="90">Last 90 Days</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-white mb-1">Team</label>
                  <select
                    value={filterTeam}
                    onChange={(e) => { setFilterTeam(e.target.value); setFilterUser(''); }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">All Teams</option>
                    {teams.map(t => (
                      <option key={t._id} value={t._id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-white mb-1">User</label>
                  <select
                    value={filterUser}
                    onChange={(e) => setFilterUser(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">All Users</option>
                    {(filterTeam
                      ? users.filter(u => {
                          const selectedTeam = teams.find(t => t._id === filterTeam);
                          return selectedTeam?.members?.some(m => (typeof m === 'object' ? m._id : m) === u._id);
                        })
                      : users
                    ).map(u => (
                      <option key={u._id} value={u._id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-white mb-1">Result</label>
                  <select
                    value={filterResult}
                    onChange={(e) => setFilterResult(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">All Results</option>
                    <option value="good">Passed</option>
                    <option value="bad">Failed</option>
                    <option value="uncertain">Uncertain</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Active filter summary */}
            {(filterRange !== 'all' || filterTeam || filterUser || filterResult) && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-2.5 mb-4 flex items-center gap-2 flex-wrap text-sm">
                <span className="text-indigo-700 font-medium">Showing:</span>
                {filterRange !== 'all' && (
                  <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-medium">
                    Last {filterRange} days
                  </span>
                )}
                {filterTeam && (
                  <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-medium">
                    Team: {teams.find(t => t._id === filterTeam)?.name || 'Unknown'}
                  </span>
                )}
                {filterUser && (
                  <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-medium">
                    User: {users.find(u => u._id === filterUser)?.name || 'Unknown'}
                  </span>
                )}
                {filterResult && (
                  <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-medium">
                    Result: {filterResult === 'good' ? 'Passed' : filterResult === 'bad' ? 'Failed' : 'Uncertain'}
                  </span>
                )}
              </div>
            )}

            {filterUser ? (
              <>
                {/* Quality breakdown - passed/failed/uncertain only */}
                {dashboardStats.qualityBreakdown && (
                  <div className="grid grid-cols-3 gap-4 mb-8">
                    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-4 border-l-4 border-green-500">
                      <p className="text-2xl font-bold text-green-600">{dashboardStats.qualityBreakdown.passed}</p>
                      <p className="text-sm text-gray-500">Passed</p>
                    </div>
                    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-4 border-l-4 border-red-500">
                      <p className="text-2xl font-bold text-red-600">{dashboardStats.qualityBreakdown.failed}</p>
                      <p className="text-sm text-gray-500">Failed</p>
                    </div>
                    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-4 border-l-4 border-amber-500">
                      <p className="text-2xl font-bold text-amber-600">{dashboardStats.qualityBreakdown.uncertain}</p>
                      <p className="text-sm text-gray-500">Uncertain</p>
                    </div>
                  </div>
                )}

                {/* Individual User Profile Stats */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-8">
                  {renderUserProfileStats(userProfileAnalytics, userProfileLoading)}
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                  {stats.map((stat) => (
                    <div key={stat.label} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                      <div className="flex items-center">
                        <div className={`${stat.color} p-3 rounded-lg`}>
                          <stat.icon className="w-6 h-6 text-white" />
                        </div>
                        <div className="ml-4">
                          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Quality breakdown */}
                {dashboardStats.qualityBreakdown && (
                  <div className="grid grid-cols-3 gap-4 mb-8">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border-l-4 border-green-500">
                      <p className="text-2xl font-bold text-green-600 dark:text-green-400">{dashboardStats.qualityBreakdown.passed}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Passed</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border-l-4 border-red-500">
                      <p className="text-2xl font-bold text-red-600 dark:text-red-400">{dashboardStats.qualityBreakdown.failed}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Failed</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border-l-4 border-amber-500">
                      <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{dashboardStats.qualityBreakdown.uncertain}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Uncertain</p>
                    </div>
                  </div>
                )}

                {loadingReports ? (
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-8 text-sm text-gray-500 dark:text-gray-400">
                    Loading analytics...
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-6">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Most Common Errors</h2>
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={barData}>
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey="errors" fill="#6366f1" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-6">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Error Type Distribution</h2>
                        <ResponsiveContainer width="100%" height={200}>
                          <PieChart>
                            <Pie data={dashboardStats.errorBreakdown} dataKey="value" nameKey="name" outerRadius={80}>
                              {dashboardStats.errorBreakdown.map((_, index) => (
                                <Cell key={index} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-6 mb-8">
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Time Savings Analysis</h2>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {timeSavingsCards.map((item) => (
                          <div key={item.label} className={`${item.bg} rounded-lg p-6 text-center`}>
                            <p className={`text-3xl font-bold ${item.text}`}>{item.value}</p>
                            <p className="text-sm text-gray-500 mt-1">{item.label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            {reportsError && <p className="mb-4 text-sm text-red-600">{reportsError}</p>}

            {successMessage && (
              <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Welcome, {user?.name}!
                </h2>
                <p className="text-sm text-green-600">{successMessage}</p>
              </div>
            )}
          </>
        )}

        {/* ── when ANALYTICS TAB ACTIVE ── */}
        {activeTab === 'analytics' && (
          <section>
            {/* Filters */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Analytics Filters</h2>
              <div className="grid grid-cols-1 md:grid-cols-5 lg:grid-cols-6 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Level</label>
                  <select
                    value={analyticsLevel}
                    onChange={(e) => {
                      setAnalyticsLevel(e.target.value);
                      setAnalyticsTeamId('');
                      setAnalyticsCompareTeamId('');
                      setAnalyticsUserId('');
                      setAnalyticsCompareUserId('');
                      setAnalyticsComparisonEnabled(false);
                    }}
                    className="w-full dark:bg-gray-800 text-gray-700 dark:text-gray-200 border 
                    border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="company">Company-wide</option>
                    <option value="team">By Team</option>
                    <option value="user">By User</option>
                  </select>
                </div>

                {analyticsLevel === 'team' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Select Team</label>
                    <select
                      value={analyticsTeamId}
                      onChange={(e) => {
                        const nextValue = e.target.value;
                        setAnalyticsTeamId(nextValue);
                        if (nextValue && nextValue === analyticsCompareTeamId) {
                          setAnalyticsCompareTeamId('');
                        }
                      }}
                      className="w-full dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">All Teams</option>
                      {teams.map((team) => (
                        <option key={team._id} value={team._id}>{team.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {analyticsLevel === 'user' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Select User</label>
                    <select
                      value={analyticsUserId}
                      onChange={(e) => {
                        const nextValue = e.target.value;
                        setAnalyticsUserId(nextValue);
                        if (nextValue && nextValue === analyticsCompareUserId) {
                          setAnalyticsCompareUserId('');
                        }
                      }}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800"
                    >
                      <option value="">Select a user...</option>
                      {users.map((u) => (
                        <option key={u._id} value={u._id}>{u.name} ({u.email})</option>
                      ))}
                    </select>
                  </div>
                )}

                {analyticsLevel === 'team' && analyticsComparisonEnabled && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Compare With Team</label>
                    <select
                      value={analyticsCompareTeamId}
                      onChange={(e) => setAnalyticsCompareTeamId(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800"
                    >
                      <option value="">Select a team...</option>
                      {teams
                        .filter((team) => team._id !== analyticsTeamId)
                        .map((team) => (
                          <option key={team._id} value={team._id}>{team.name}</option>
                        ))}
                    </select>
                  </div>
                )}

                {analyticsLevel === 'user' && analyticsComparisonEnabled && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Compare With User</label>
                    <select
                      value={analyticsCompareUserId}
                      onChange={(e) => setAnalyticsCompareUserId(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800"
                    >
                      <option value="">Select a user...</option>
                      {users
                        .filter((u) => u._id !== analyticsUserId)
                        .map((u) => (
                          <option key={u._id} value={u._id}>{u.name} ({u.email})</option>
                        ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Time Range</label>
                  <select
                    value={analyticsRange}
                    onChange={(e) => setAnalyticsRange(e.target.value)}
                    className="w-full dark:bg-gray-800 text-gray-700 dark:text-gray-200 border 
                    border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 90 days</option>
                    <option value="all">All time</option>
                  </select>
                </div>

                <div className="flex items-end gap-2">
                  {analyticsLevel !== 'company' && (
                    <button
                      type="button"
                      onClick={() => {
                        const enabled = !analyticsComparisonEnabled;
                        setAnalyticsComparisonEnabled(enabled);
                        if (!enabled) {
                          setAnalyticsCompareTeamId('');
                          setAnalyticsCompareUserId('');
                        }
                      }}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                        analyticsComparisonEnabled
                          ? 'bg-indigo-700 text-white'
                          : 'bg-indigo-600 text-white hover:bg-indigo-700'
                      }`}
                    >
                      {analyticsComparisonEnabled ? 'Hide Comparison' : 'Compare'}
                    </button>
                  )}
                  <button
                    onClick={fetchAnalytics}
                    disabled={loadingAnalytics}
                    className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {loadingAnalytics ? 'Loading...' : 'Refresh'}
                  </button>
                </div>
              </div>
            </div>

            {analyticsError && (
              <div className="mb-4 px-4 py-3 bg-red-100 text-red-800 rounded-lg text-sm">
                {analyticsError}
              </div>
            )}

            {comparisonSelectionIncomplete && (
              <div className="mb-4 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-lg text-sm">
                Select a second {analyticsLevel === 'team' ? 'team' : 'user'} to load comparison analytics.
              </div>
            )}

            {loadingAnalytics && !analyticsData ? (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-8 text-center text-gray-500 dark:text-gray-400">
                Loading analytics...
              </div>
            ) : analyticsData ? (
              <>
                {analyticsComparisonActive ? (
                  <>
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <h3 className="text-xl font-bold text-gray-900 dark:text-white">Analytics Comparison</h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {analyticsRange === 'all' ? 'All time' : `Last ${analyticsRange} days`}
                          </p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full lg:w-auto">
                          <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Primary</p>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">{comparisonPrimaryScope?.scopeLabel}</p>
                            {comparisonPrimaryScope?.scopeDetails?.teamName && (
                              <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">Members: {comparisonPrimaryScope.scopeDetails.memberCount}</p>
                            )}
                            {comparisonPrimaryScope?.scopeDetails?.userEmail && (
                              <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{comparisonPrimaryScope.scopeDetails.userEmail}</p>
                            )}
                          </div>
                          <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-green-700">Secondary</p>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">{comparisonSecondaryScope?.scopeLabel}</p>
                            {comparisonSecondaryScope?.scopeDetails?.teamName && (
                              <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">Members: {comparisonSecondaryScope.scopeDetails.memberCount}</p>
                            )}
                            {comparisonSecondaryScope?.scopeDetails?.userEmail && (
                              <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{comparisonSecondaryScope.scopeDetails.userEmail}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {(comparisonPrimaryHasNoReports || comparisonSecondaryHasNoReports || comparisonPrimaryHasNoAnalysed || comparisonSecondaryHasNoAnalysed) && (
                      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 mb-6">
                        <div className="space-y-2 text-sm">
                          {comparisonPrimaryHasNoReports && (
                            <p className="text-indigo-700">
                              {comparisonPrimaryScope?.scopeLabel} has no reports in this range.
                            </p>
                          )}
                          {comparisonSecondaryHasNoReports && (
                            <p className="text-green-700">
                              {comparisonSecondaryScope?.scopeLabel} has no reports in this range.
                            </p>
                          )}
                          {!comparisonPrimaryHasNoReports && comparisonPrimaryHasNoAnalysed && (
                            <p className="text-indigo-700">
                              {comparisonPrimaryScope?.scopeLabel} has reports in this range, but none have been analysed yet.
                            </p>
                          )}
                          {!comparisonSecondaryHasNoReports && comparisonSecondaryHasNoAnalysed && (
                            <p className="text-green-700">
                              {comparisonSecondaryScope?.scopeLabel} has reports in this range, but none have been analysed yet.
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
                      {comparisonSummaryCards.map(([label, primaryValue, secondaryValue]) => (
                        <div key={label} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
                          <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
                          <div className="mt-4 space-y-3">
                            <div className="flex items-center justify-between rounded-lg bg-indigo-50 dark:bg-indigo-900/20 px-3 py-2">
                              <span className="text-sm font-medium text-indigo-700 truncate mr-3">{comparisonPrimaryScope?.scopeLabel}</span>
                              <span className="text-lg font-bold text-indigo-700">{primaryValue}</span>
                            </div>
                            <div className="flex items-center justify-between rounded-lg bg-green-50 dark:bg-green-900/20 px-3 py-2">
                              <span className="text-sm font-medium text-green-700 truncate mr-3">{comparisonSecondaryScope?.scopeLabel}</span>
                              <span className="text-lg font-bold text-green-700">{secondaryValue}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                        <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Reports Over Time</h4>
                        {comparisonReportsChartData.length > 0 ? (
                          <ResponsiveContainer width="100%" height={240}>
                            <LineChart data={comparisonReportsChartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                              <XAxis
                                type="number"
                                dataKey="pointIndex"
                                domain={['dataMin', 'dataMax']}
                                allowDecimals={false}
                                tick={{ fontSize: 10 }}
                                minTickGap={12}
                                tickFormatter={(value) => comparisonReportsChartData[value]?.periodLabel || ''}
                              />
                              <YAxis tick={{ fontSize: 12 }} />
                              <Tooltip labelFormatter={(label, payload) => payload?.[0]?.payload?.periodLabel || label} />
                              <Legend />
                              <Line type="linear" dataKey="primaryValue" name={comparisonPrimaryScope?.scopeLabel || 'Primary'} stroke={comparisonColours.primary} strokeWidth={3} isAnimationActive={false} connectNulls dot={false} />
                              <Line type="linear" dataKey="secondaryValue" name={comparisonSecondaryScope?.scopeLabel || 'Secondary'} stroke={comparisonColours.secondary} strokeWidth={3} isAnimationActive={false} connectNulls dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-[240px] flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">No report trend data available yet.</div>
                        )}
                      </div>

                      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                        <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Pass Rate Over Time</h4>
                        {comparisonPassRateChartData.length > 0 ? (
                          <ResponsiveContainer width="100%" height={240}>
                            <LineChart data={comparisonPassRateChartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                              <XAxis
                                type="number"
                                dataKey="pointIndex"
                                domain={['dataMin', 'dataMax']}
                                allowDecimals={false}
                                tick={{ fontSize: 10 }}
                                minTickGap={12}
                                tickFormatter={(value) => comparisonPassRateChartData[value]?.periodLabel || ''}
                              />
                              <YAxis domain={[0, 105]} tick={{ fontSize: 12 }} />
                              <Tooltip formatter={(value) => [`${value}%`, 'Pass Rate']} labelFormatter={(label, payload) => payload?.[0]?.payload?.periodLabel || label} />
                              <Legend />
                              <Line type="linear" dataKey="primaryValue" name={comparisonPrimaryScope?.scopeLabel || 'Primary'} stroke={comparisonColours.primary} strokeWidth={3} isAnimationActive={false} connectNulls dot={false} />
                              <Line type="linear" dataKey="secondaryValue" name={comparisonSecondaryScope?.scopeLabel || 'Secondary'} stroke={comparisonColours.secondary} strokeWidth={3} isAnimationActive={false} connectNulls dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-[240px] flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">No pass rate trend available yet.</div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                        <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quality Score Trend</h4>
                        {comparisonQualityScoreChartData.length > 0 ? (
                          <ResponsiveContainer width="100%" height={240}>
                            <LineChart data={comparisonQualityScoreChartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                              <XAxis
                                type="number"
                                dataKey="pointIndex"
                                domain={['dataMin', 'dataMax']}
                                allowDecimals={false}
                                tick={{ fontSize: 10 }}
                                minTickGap={12}
                                tickFormatter={(value) => comparisonQualityScoreChartData[value]?.pointLabel || ''}
                              />
                              <YAxis domain={[0, Math.max(comparisonQualityScoreMaxValue, 105)]} tick={{ fontSize: 12 }} />
                              <Tooltip
                                formatter={(value, name, entry) => {
                                  const point = entry?.payload;
                                  const seriesLabel = name === (comparisonPrimaryScope?.scopeLabel || 'Primary')
                                    ? `${name}${point?.primaryDate ? ` (${point.primaryDate})` : ''}`
                                    : `${name}${point?.secondaryDate ? ` (${point.secondaryDate})` : ''}`;
                                  return [`${value}`, seriesLabel];
                                }}
                                labelFormatter={(label, payload) => payload?.[0]?.payload?.pointLabel || label}
                              />
                              <Legend />
                              <Line type="linear" dataKey="primaryValue" name={comparisonPrimaryScope?.scopeLabel || 'Primary'} stroke={comparisonColours.primary} strokeWidth={3} isAnimationActive={false} connectNulls dot={false} />
                              <Line type="linear" dataKey="secondaryValue" name={comparisonSecondaryScope?.scopeLabel || 'Secondary'} stroke={comparisonColours.secondary} strokeWidth={3} isAnimationActive={false} connectNulls dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-[240px] flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">No quality score trend available yet.</div>
                        )}
                      </div>

                      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                        <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Most Common Error Types</h4>
                        {comparisonErrorTypeChartData.length > 0 ? (
                          <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={comparisonErrorTypeChartData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                              <YAxis />
                              <Tooltip />
                              <Legend />
                              <Bar dataKey="primaryValue" name={comparisonPrimaryScope?.scopeLabel || 'Primary'} fill={comparisonColours.primary} />
                              <Bar dataKey="secondaryValue" name={comparisonSecondaryScope?.scopeLabel || 'Secondary'} fill={comparisonColours.secondary} />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-[240px] flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">No error type comparison data available yet.</div>
                        )}
                      </div>
                    </div>

                    <div className="mb-6">
                      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
                        <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Top Common Errors</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm font-semibold text-indigo-700 mb-3">{comparisonPrimaryScope?.scopeLabel}</p>
                            {comparisonPrimaryScope?.topErrors?.length > 0 ? (
                              <div className="space-y-2">
                                {comparisonPrimaryScope.topErrors.slice(0, 5).map((error, idx) => (
                                  <div key={`primary-${idx}`} className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[80%]">{error.message}</span>
                                    <span className="text-sm font-semibold text-indigo-600">{error.count}</span>
                                  </div>
                                ))}
                              </div>
                            ) : <p className="text-sm text-gray-400 dark:text-gray-500">No errors found</p>}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-green-700 mb-3">{comparisonSecondaryScope?.scopeLabel}</p>
                            {comparisonSecondaryScope?.topErrors?.length > 0 ? (
                              <div className="space-y-2">
                                {comparisonSecondaryScope.topErrors.slice(0, 5).map((error, idx) => (
                                  <div key={`secondary-${idx}`} className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[80%]">{error.message}</span>
                                    <span className="text-sm font-semibold text-green-600">{error.count}</span>
                                  </div>
                                ))}
                              </div>
                            ) : <p className="text-sm text-gray-400 dark:text-gray-500">No errors found</p>}
                          </div>
                        </div>
                      </div>

                      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                        <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Recent Reports</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm font-semibold text-indigo-700 mb-3">{comparisonPrimaryScope?.scopeLabel}</p>
                            {comparisonPrimaryScope?.recentReports?.length > 0 ? (
                              <div className="space-y-2">
                                {comparisonPrimaryScope.recentReports.slice(0, 5).map((report) => (
                                  <div key={`primary-report-${report._id}`} className="rounded-lg bg-gray-50 dark:bg-gray-700/50 px-3 py-2">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{report.filename}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                      {report.errorCount} errors · {formatDate(report.createdAt)}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            ) : <p className="text-sm text-gray-400 dark:text-gray-500">No recent reports</p>}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-green-700 mb-3">{comparisonSecondaryScope?.scopeLabel}</p>
                            {comparisonSecondaryScope?.recentReports?.length > 0 ? (
                              <div className="space-y-2">
                                {comparisonSecondaryScope.recentReports.slice(0, 5).map((report) => (
                                  <div key={`secondary-report-${report._id}`} className="rounded-lg bg-gray-50 dark:bg-gray-700/50 px-3 py-2">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{report.filename}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                      {report.errorCount} errors · {formatDate(report.createdAt)}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            ) : <p className="text-sm text-gray-400 dark:text-gray-500">No recent reports</p>}
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                {/* Scope Label */}
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-gray-900">{analyticsData.scopeLabel}</h3>
                  <p className="text-sm text-gray-500">
                    {analyticsRange === 'all' ? 'All time' : `Last ${analyticsRange} days`}
                  </p>
                </div>

                {/* Summary Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
                    <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{analyticsData.summary.totalReports}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Total Reports</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">{analyticsData.summary.analyzedReports}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Analyzed</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
                    <p className="text-2xl font-bold text-red-500 dark:text-red-400">{analyticsData.summary.totalErrors}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Total Errors</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
                    <p className="text-2xl font-bold text-amber-500 dark:text-amber-400">{analyticsData.summary.averageErrorsPerReport}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Avg Errors/Report</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
                    <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{analyticsData.summary.passRate}%</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Pass Rate</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
                    <p className="text-2xl font-bold text-teal-600 dark:text-teal-400">{formatMinutes(analyticsData.summary.totalTimeSaved)}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Time Saved</p>
                  </div>
                </div>

                {/* Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                  {/* Error Breakdown */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Error Breakdown</h4>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={analyticsData.errorBreakdown}>
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="value" fill="#6366f1" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Quality Distribution */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quality Distribution</h4>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Passed', value: analyticsData.qualityBreakdown.good },
                            { name: 'Failed', value: analyticsData.qualityBreakdown.bad },
                            { name: 'Uncertain', value: analyticsData.qualityBreakdown.uncertain },
                          ]}
                          dataKey="value"
                          nameKey="name"
                          outerRadius={80}
                          label={({ name, value }) => value > 0 ? `${name}: ${value}` : ''}
                        >
                          <Cell fill="#10b981" />
                          <Cell fill="#ef4444" />
                          <Cell fill="#f59e0b" />
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Trend Chart */}
                {analyticsData.trendData && analyticsData.trendData.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Reports Over Time</h4>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={analyticsData.trendData}>
                        <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="reports" fill="#6366f1" name="Reports" />
                        <Bar dataKey="passed" fill="#10b981" name="Passed" />
                        <Bar dataKey="failed" fill="#ef4444" name="Failed" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Pass Rate Over Time</h4>
                    {adminPassRateChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart
                          data={adminPassRateChartData}
                          margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                          <XAxis
                            type="number"
                            dataKey="pointIndex"
                            domain={['dataMin', 'dataMax']}
                            allowDecimals={false}
                            tick={{ fontSize: 10 }}
                            minTickGap={12}
                            tickFormatter={(value) => adminPassRateChartData[value]?.periodLabel || ''}
                          />
                          <YAxis domain={[0, 105]} tick={{ fontSize: 12 }} />
                          <Tooltip
                            formatter={(value, name) => {
                              if (name === 'Pass Rate') return [`${value}%`, name];
                              return [value, name];
                            }}
                            labelFormatter={(label, payload) => {
                              const point = payload?.[0]?.payload;
                              if (!point) return label;
                              return `${point.periodLabel} - ${point.passedCount}/${point.analyzedCount} passed`;
                            }}
                          />
                          <Line
                            type="linear"
                            dataKey="passRate"
                            name="Pass Rate"
                            stroke="#10b981"
                            strokeWidth={3}
                            isAnimationActive={false}
                            connectNulls
                            dot={false}
                            activeDot={{ r: 6 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[220px] flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
                        No pass rate trend available yet.
                      </div>
                    )}
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quality Score Trend</h4>
                    {adminQualityScoreChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart
                          data={adminQualityScoreChartData}
                          margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                          <XAxis
                            type="number"
                            dataKey="pointIndex"
                            domain={['dataMin', 'dataMax']}
                            allowDecimals={false}
                            tick={{ fontSize: 10 }}
                            minTickGap={12}
                            tickFormatter={(value) => adminQualityScoreChartData[value]?.label || ''}
                          />
                          <YAxis domain={[0, Math.max(adminQualityScoreMaxValue, 105)]} tick={{ fontSize: 12 }} />
                          <Tooltip
                            formatter={(value) => [`${value}`, 'Quality Score']}
                            labelFormatter={(label, payload) => {
                              const point = payload?.[0]?.payload;
                              return point ? `${point.fullLabel} - ${point.date}` : label;
                            }}
                          />
                          <Line
                            type="linear"
                            dataKey="score"
                            name="Quality Score"
                            stroke="#6366f1"
                            strokeWidth={3}
                            isAnimationActive={false}
                            connectNulls
                            dot={false}
                            activeDot={{ r: 6 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[220px] flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
                        No quality score trend available yet.
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Most Common Error Types</h4>
                    {adminCommonErrorTypeChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={adminCommonErrorTypeChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis />
                          <Tooltip formatter={(value) => [`${value}`, 'Errors']} />
                          <Bar dataKey="errors" name="Errors" radius={[6, 6, 0, 0]}>
                            {adminCommonErrorTypeChartData.map((entry) => (
                              <Cell key={entry.name} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[220px] flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
                        No common error type data available yet.
                      </div>
                    )}
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Recurring Checklist Failures</h4>
                    {adminChecklistFailureChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart
                          data={adminChecklistFailureChartData}
                          layout="vertical"
                          margin={{ top: 10, right: 20, left: 20, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                          <XAxis type="number" tick={{ fontSize: 12 }} />
                          <YAxis dataKey="shortLabel" type="category" tick={{ fontSize: 11 }} width={70} />
                          <Tooltip
                            formatter={(value) => [`${value}`, 'Occurrences']}
                            labelFormatter={(label, payload) => payload?.[0]?.payload?.fullLabel || label}
                          />
                          <Bar dataKey="count" fill="#6366f1" radius={[0, 6, 6, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[220px] flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
                        No recurring checklist failures found.
                      </div>
                    )}
                  </div>
                </div>

                {/* Time Savings */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Time Savings Analysis</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-purple-100 dark:bg-purple-900/30 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{formatMinutes(analyticsData.summary.manualTime)}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manual Review Time</p>
                    </div>
                    <div className="bg-green-100 dark:bg-green-900/30 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-green-600 dark:text-green-400">{formatMinutes(analyticsData.summary.aiTime)}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">AI Review Time</p>
                    </div>
                    <div className="bg-purple-100 dark:bg-purple-900/30 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{analyticsData.summary.timeSavedPercent}%</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Time Saved</p>
                    </div>
                  </div>
                </div>

                {/* Two Column: Top Errors & User Leaderboard */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                  {/* Top Errors */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Top Common Errors</h4>
                    {analyticsData.topErrors && analyticsData.topErrors.length > 0 ? (
                      <div className="space-y-2">
                        {analyticsData.topErrors.slice(0, 5).map((error, idx) => (
                          <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                            <span className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[80%]">{error.message}</span>
                            <span className="text-sm font-semibold text-red-600 dark:text-red-400">{error.count}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">No errors found</p>
                    )}
                  </div>

                  {/* User Leaderboard */}
                  {analyticsLevel === 'company' && analyticsData.userLeaderboard && analyticsData.userLeaderboard.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Top Users by Reports</h4>
                      <div className="space-y-2">
                        {analyticsData.userLeaderboard.slice(0, 5).map((u, idx) => (
                          <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">{u.userName}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{u.reportCount} reports · {u.passRate}% pass rate</p>
                            </div>
                            <button
                              onClick={() => {
                                setAnalyticsLevel('user');
                                setAnalyticsUserId(u.odId);
                              }}
                              className="text-xs text-indigo-600 hover:underline"
                            >
                              View
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Team Members (when viewing team) */}
                  {analyticsLevel === 'team' && analyticsData.scopeDetails && (
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Team Info</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        <span className="font-medium">Team:</span> {analyticsData.scopeDetails.teamName}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        <span className="font-medium">Members:</span> {analyticsData.scopeDetails.memberCount}
                      </p>
                    </div>
                  )}

                  {/* User Info (when viewing user) */}
                  {analyticsLevel === 'user' && analyticsData.scopeDetails && (
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">User Info</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        <span className="font-medium">Name:</span> {analyticsData.scopeDetails.userName}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        <span className="font-medium">Email:</span> {analyticsData.scopeDetails.userEmail}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        <span className="font-medium">Role:</span> {analyticsData.scopeDetails.userRole?.replace('_', ' ')}
                      </p>
                    </div>
                  )}
                </div>

                {/* Recent Reports */}
                {analyticsData.recentReports && analyticsData.recentReports.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Recent Reports</h4>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-700 text-left text-gray-600 dark:text-gray-300">
                            <th className="px-4 py-3 font-semibold">Filename</th>
                            <th className="px-4 py-3 font-semibold">Status</th>
                            <th className="px-4 py-3 font-semibold">Errors</th>
                            <th className="px-4 py-3 font-semibold">Result</th>
                            <th className="px-4 py-3 font-semibold">Analyzed By</th>
                            <th className="px-4 py-3 font-semibold">Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analyticsData.recentReports.map((report) => (
                            <tr key={report._id} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                              <td className="px-4 py-3 text-gray-900 dark:text-white truncate max-w-[200px]">{report.filename}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                                  report.status === 'analyzed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                  report.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                }`}>
                                  {report.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{report.errorCount}</td>
                              <td className="px-4 py-3">
                                {report.qualityLabel ? (
                                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                                    report.qualityLabel === 'good' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                    report.qualityLabel === 'bad' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                  }`}>
                                    {report.qualityLabel}
                                  </span>
                                ) : '-'}
                              </td>
                              <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{report.analyzedBy}</td>
                              <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{formatDate(report.createdAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                  </>
                )}
              </>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-8 text-center text-gray-500 dark:text-gray-400">
                Select filters and click Refresh to load analytics
              </div>
            )}
          </section>
        )}

        {/* USERS tab active */}
        {activeTab === 'users' && (
          <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">User Management</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Search your existing users and review their roles and account status.
                </p>
              </div>

              <label className="relative block w-full md:max-w-xs">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search users..."
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-3 pl-11 pr-4 text-sm text-gray-700 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </label>
            </div>

            {errorMessage && <p className="mb-4 text-sm text-red-600">{errorMessage}</p>}
            {successMessage && <p className="mb-4 text-sm text-green-600">{successMessage}</p>}

            {loadingUsers ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading users...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-850 text-left text-gray-600">
                      <th className="px-4 py-4 font-semibold">User</th>
                      <th className="px-4 py-4 font-semibold">Email</th>
                      <th className="px-4 py-4 font-semibold">Role</th>
                      <th className="px-4 py-4 font-semibold">Joined</th>
                      <th className="px-4 py-4 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((entry) => (
                      <tr key={entry._id} className="border-b border-gray-100 last:border-b-0">
                        <td className="px-4 py-5 text-gray-900 dark:text-white">{entry.name}</td>
                        <td className="px-4 py-5 text-gray-600 dark:text-gray-300">{entry.email}</td>
                        <td className="px-4 py-5 capitalize text-gray-600 dark:text-gray-300">
                          {entry.role?.replace('_', ' ')}
                        </td>
                        <td className="px-4 py-5 text-gray-600 dark:text-gray-300">{formatDate(entry.createdAt)}</td>
                        <td className="px-4 py-5">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                              entry.status === 'active'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-200 text-gray-700'
                            }`}
                          >
                            {entry.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {!filteredUsers.length && (
                  <p className="px-4 py-6 text-sm text-gray-500">No users match your search.</p>
                )}
              </div>
            )}
          </section>
        )}

        {activeTab === 'manage' && (
          <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">Manage Users</h2>
                <p className="text-sm text-gray-500 dark:text-400 mt-1">
                  Handle account support actions such as password resets and deletions from one place.
                </p>
              </div>

              <label className="relative block w-full md:max-w-xs">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search users..."
                  className="w-full dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700bg-white py-3 pl-11 pr-4 text-sm text-gray-700 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </label>
            </div>

            <div className="mb-6 flex gap-3 border-b border-gray-200 dark:border-gray-700pb-4">
              <button
                type="button"
                onClick={() => setManageView('users')}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  manageView === 'users'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 hover:text-gray-700'
                }`}
              >
                User Actions
              </button>
              <button
                type="button"
                onClick={() => setManageView('requests')}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  manageView === 'requests'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 hover:text-gray-700'
                }`}
              >
                Password Reset Requests
              </button>
            </div>

            {requestsMessage && <p className="mb-4 text-sm text-green-600">{requestsMessage}</p>}
            {requestsError && <p className="mb-4 text-sm text-red-600">{requestsError}</p>}

            {manageView === 'users' && loadingUsers ? (
              <p className="text-sm text-gray-500">Loading users...</p>
            ) : manageView === 'requests' && loadingRequests ? (
              <p className="text-sm text-gray-500">Loading password reset requests...</p>
            ) : (
              <div className="overflow-x-auto">
                {manageView === 'users' ? (
                  <>
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-left text-gray-600">
                          <th className="px-4 py-4 font-semibold">User</th>
                          <th className="px-4 py-4 font-semibold">Email</th>
                          <th className="px-4 py-4 font-semibold">Role</th>
                          <th className="px-4 py-4 font-semibold">Status</th>
                          <th className="px-4 py-4 font-semibold">Reset Password</th>
                          <th className="px-4 py-4 font-semibold">Delete User</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.map((entry) => (
                          <tr key={entry._id} className="border-b border-gray-100 last:border-b-0">
                            <td className="px-4 py-5 text-gray-900 dark:text-white">{entry.name}</td>
                            <td className="px-4 py-5 text-gray-600 dark:text-gray-300">{entry.email}</td>
                            <td className="px-4 py-5 capitalize text-gray-600 dark:text-gray-300">
                              {entry.role?.replace('_', ' ')}
                            </td>
                            <td className="px-4 py-5">
                              <span
                                className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold capitalize ${getStatusOutlineClass(
                                  entry.status
                                )}`}
                              >
                                {entry.status || 'unknown'}
                              </span>
                            </td>
                            <td className="px-4 py-5">
                              <button
                                type="button"
                                onClick={() => handleResetPassword(entry._id)}
                                disabled={resettingUserId === entry._id || deletingUserId === entry._id}
                                className="inline-flex items-center gap-2 rounded-lg border border-amber-300 px-4 py-2 text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <KeyRound className="h-4 w-4" />
                                {resettingUserId === entry._id ? 'Resetting...' : 'Reset Password'}
                              </button>
                            </td>

                            <td className="px-4 py-5">
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(entry._id, entry.name)}
                                disabled={deletingUserId === entry._id || resettingUserId === entry._id}
                                className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <Trash2 className="h-4 w-4" />
                                {deletingUserId === entry._id ? 'Deleting...' : 'Delete User'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {!filteredUsers.length && (
                      <p className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">
                        No users match your search.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-left text-gray-600">
                          <th className="px-4 py-4 font-semibold">User</th>
                          <th className="px-4 py-4 font-semibold">Email</th>
                          <th className="px-4 py-4 font-semibold">Role</th>
                          <th className="px-4 py-4 font-semibold">Requested At</th>
                          <th className="px-4 py-4 font-semibold">Status</th>
                          <th className="px-4 py-4 font-semibold">Reset Password</th>
                          <th className="px-4 py-4 font-semibold">Reject</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/*
                          `searchTerm` is intentionally shared with the User Actions view so that
                          switching between sub-tabs preserves the admin's query. Matching is done
                          inline (not via `filteredUsers`) because the shape here is request-wrapped.
                        */}
                        {passwordResetRequests
                          .filter((request) => {
                            const query = searchTerm.trim().toLowerCase();

                            if (!query) {
                              return true;
                            }

                            return (
                              request.user?.name?.toLowerCase().includes(query) ||
                              request.user?.email?.toLowerCase().includes(query) ||
                              request.user?.role?.toLowerCase().includes(query) ||
                              request.status?.toLowerCase().includes(query)
                            );
                          })
                          .map((request) => (
                            <tr key={request._id} className="border-b border-gray-100 last:border-b-0">
                              <td className="px-4 py-5 text-gray-900">{request.user?.name}</td>
                              <td className="px-4 py-5 text-gray-600">{request.user?.email}</td>
                              <td className="px-4 py-5 capitalize text-gray-600">
                                {request.user?.role?.replace('_', ' ')}
                              </td>
                              <td className="px-4 py-5 text-gray-600">
                                {formatDate(request.requestedAt)}
                              </td>
                              <td className="px-4 py-5">
                                <span
                                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold capitalize ${getStatusOutlineClass(
                                    request.status
                                  )}`}
                                >
                                  {request.status || 'unknown'}
                                </span>
                              </td>
                              <td className="px-4 py-5">
                                <button
                                  type="button"
                                  onClick={() => handleCompleteRequest(request._id)}
                                  disabled={resettingUserId === request.user?._id}
                                  className="inline-flex items-center gap-2 rounded-lg border border-amber-300 px-4 py-2 text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <KeyRound className="h-4 w-4" />
                                  {resettingUserId === request.user?._id ? 'Resetting...' : 'Reset Password'}
                                </button>
                              </td>
                              <td className="px-4 py-5">
                                <button
                                  type="button"
                                  onClick={() => handleRejectRequest(request._id)}
                                  className="inline-flex items-center rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition hover:bg-gray-50"
                                >
                                  Reject
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>

                    {!passwordResetRequests.length && (
                      <p className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">
                        No password reset requests found.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </section>
        )}

        {activeTab === 'reports' && (
          <section>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Analysed Reports</h2>
              <div className="flex items-center gap-3">
                {filteredReports.some(r => r.errors?.length > 0) && (
                  <button
                    onClick={() => {
                      const allExpanded = filteredReports.every(r => expandedReports[r._id]);
                      const next = {};
                      filteredReports.forEach(r => { next[r._id] = !allExpanded; });
                      setExpandedReports(next);
                    }}
                    className="text-sm text-indigo-600 border border-indigo-200 rounded-lg px-3 py-2 hover:bg-indigo-50"
                  >
                    {filteredReports.every(r => expandedReports[r._id]) ? 'Collapse All' : 'Expand All'}
                  </button>
                )}
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-sm">🔍</span>
                  <input
                    type="text"
                    placeholder="Search reports..."
                    value={reportSearch}
                    onChange={(e) => setReportSearch(e.target.value)}
                    className="dark:bg-gray-800 border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>

            {reportsError && <p className="mb-4 text-sm text-red-600">{reportsError}</p>}

            {loadingReports ? (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 text-sm text-gray-500 dark:text-gray-400">
                Loading reports...
              </div>
            ) : (
              <div className="space-y-4">
                {filteredReports.map((report) => (
                  <div key={report._id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 hover:border-indigo-400 transition-colors">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-indigo-600 text-lg">📄</span>
                          <p className="font-bold text-gray-900 dark:text-white text-base">{report.filename}</p>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                          Analyzed by <span className="font-semibold text-gray-700 dark:text-gray-200">{report.analyzedBy?.name ?? 'Unknown'}</span> on{' '}
                          {formatDate(report.analyzedAt || report.createdAt)}
                        </p>
                        <p className="text-sm mb-3">
                          <span className="text-red-500 font-medium">{report.errorCount || 0} errors found</span>
                          <span className="text-gray-400 mx-2">•</span>
                          <span className="text-green-600 font-medium">{formatMinutes(report.estimatedTimeSavedMinutes ?? report.timeSaved ?? 0)} saved</span>
                        </p>

                        {report.errors?.length > 0 && (
                          <div className="border-t border-gray-100 pt-3">
                            <button
                              onClick={() => setExpandedReports(prev => ({ ...prev, [report._id]: !prev[report._id] }))}
                              className="flex items-center gap-1 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-indigo-600 transition-colors mb-2"
                            >
                              {expandedReports[report._id]
                                ? <ChevronDown className="w-4 h-4" />
                                : <ChevronRight className="w-4 h-4" />
                              }
                              Errors Detected ({report.errors.length})
                            </button>
                            {expandedReports[report._id] && (
                              <div className="space-y-1 ml-5">
                                {report.errors.map((error, index) => (
                                  <div key={error._id || index} className="flex items-center gap-3">
                                    <span className="text-xs px-2 py-0.5 rounded font-medium min-w-[80px] text-center bg-gray-100 text-gray-700">
                                      {error.type}
                                    </span>
                                    <span className="text-sm text-gray-600">{error.message}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/*
                        Admin-only guard mirrors the backend contract on PATCH /admin/reports/:id/training
                        (the route is `authorize('admin')`). Team leaders can still see the Reports
                        tab to review analysis output, but cannot add reports to the training set —
                        that's a data-integrity decision reserved for admins.
                      */}
                      {user?.role === 'admin' && (
                        <div className="relative ml-4">
                          <button
                            onClick={() => setOpenTrainingMenu(openTrainingMenu === report._id ? null : report._id)}
                            className={`text-sm border rounded-lg px-3 py-1.5 whitespace-nowrap ${
                              report.addedToTraining
                                ? 'text-green-600 border-green-200 bg-green-50  hover:bg-green-100'
                                : 'text-indigo-600 border-indigo-200 bg-indigo-50 hover:bg-indigo-100'
                            }`}
                          >
                            {report.addedToTraining
                              ? `✓ ${report.trainingLabel === 'good' ? 'Good' : 'Bad'} Example`
                              : '+ Add to Training'}
                          </button>

                          {openTrainingMenu === report._id && (
                            <div className="absolute right-0 top-10 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700rounded-lg shadow-lg p-3 z-10 w-52">
                              <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Add as training example:</p>
                              <button
                                onClick={() => handleAddToTraining(report._id, 'good')}
                                className="w-full text-left text-sm font-medium text-green-600 bg-green-50 hover:bg-green-100 rounded px-3 py-2 mb-1"
                              >
                                ✓ Good Example
                              </button>
                              <button
                                onClick={() => handleAddToTraining(report._id, 'bad')}
                                className="w-full text-left text-sm font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded px-3 py-2"
                              >
                                ✗ Bad Example
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'training' && (
          <section>
            {/* Training Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-4">
                <p className="text-2xl font-bold text-green-600">{trainingStats.goodExamples}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Good Examples</p>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-4">
                <p className="text-2xl font-bold text-red-500">{trainingStats.badExamples}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Bad Examples</p>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-4">
                <p className="text-2xl font-bold text-indigo-600">{trainingStats.trainedExamples}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 ">Trained</p>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-4">
                <p className="text-2xl font-bold text-amber-500">{trainingStats.pendingExamples}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 ">Pending</p>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-4">
                <p className="text-2xl font-bold text-indigo-600">{trainingStats.templates ?? 0}</p>
                <p className="text-sm text-gray-500">Templates</p>
              </div>
            </div>

            {/* Upload Section */}
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Upload Training Example</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Upload a <span className="text-green-600 font-medium">good</span> or <span className="text-red-500 font-medium">bad</span> example to train the AI quality model, or upload a <span className="text-indigo-600 font-medium">Report Template</span> to teach the system what a completed report should look like.
              </p>
              <form onSubmit={handleTrainingUpload}>
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition ${
                    dragActive
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-300 hover:border-indigo-400'
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('training-file-input').click()}
                >
                  <input
                    id="training-file-input"
                    type="file"
                    accept=".pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {trainingFile ? (
                    <div className="text-indigo-600">
                      <FileText className="w-10 h-10 mx-auto mb-2" />
                      <p className="font-medium">{trainingFile.name}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {(trainingFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  ) : (
                    <div className="text-gray-500 dark:text-gray-400">
                      <FileText className="w-10 h-10 mx-auto mb-2 text-gray-400" />
                      <p className="font-medium">Drop a PDF here or click to upload</p>
                      <p className="text-sm">Maximum file size: 120MB</p>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-center gap-4">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Type:</label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="trainingType"
                        value="good"
                        checked={trainingType === 'good'}
                        onChange={(e) => setTrainingType(e.target.value)}
                        className="text-green-600 focus:ring-green-500"
                      />
                      <span className="text-sm text-green-600 font-medium">Good Example</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="trainingType"
                        value="bad"
                        checked={trainingType === 'bad'}
                        onChange={(e) => setTrainingType(e.target.value)}
                        className="text-red-500 focus:ring-red-500"
                      />
                      <span className="text-sm text-red-500 font-medium">Bad Example</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="trainingType"
                        value="template"
                        checked={trainingType === 'template'}
                        onChange={(e) => setTrainingType(e.target.value)}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-indigo-600 font-medium">Report Template</span>
                    </label>
                  </div>
                  <button
                    type="submit"
                    disabled={!trainingFile || uploadingTraining}
                    className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {uploadingTraining ? 'Uploading...' : 'Upload'}
                  </button>
                </div>
              </form>
            </div>

            {/* Messages */}
            {trainingMessage && (
              <div className="mb-4 px-4 py-3 bg-green-100 text-green-800 rounded-lg text-sm">
                {trainingMessage}
              </div>
            )}
            {trainingError && (
              <div className="mb-4 px-4 py-3 bg-red-100 text-red-800 rounded-lg text-sm">
                {trainingError}
              </div>
            )}

            {/* Training Examples List */}
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Training Examples</h2>
                <button
                  onClick={handleSyncTraining}
                  disabled={syncingTraining}
                  className="text-sm font-medium text-indigo-600 border border-indigo-200 rounded-lg px-4 py-2 hover:bg-indigo-50 disabled:opacity-50"
                >
                  {syncingTraining ? 'Syncing...' : 'Sync from Reports'}
                </button>
              </div>

              {loadingTraining ? (
                <p className="text-gray-500 dark:text-gray-400 text-sm">Loading training examples...</p>
              ) : trainingExamples.length === 0 ? (
                <p className="text-gray-400 dark:text-gray-300 text-sm text-center py-8">
                  No training examples yet. Upload PDFs above or label reports in the Reports tab.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-gray-600">
                        <th className="px-4 py-3 font-semibold">Filename</th>
                        <th className="px-4 py-3 font-semibold">Type</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold">Uploaded</th>
                        <th className="px-4 py-3 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trainingExamples.map((example) => (
                        <tr
                          key={example._id}
                          className={`border-b border-gray-100 dark:border-gray-800 last:border-b-0 ${example.isActive ? 'bg-green-50 dark:bg-green-900/10' : ''}`}
                        >
                          <td className="px-4 py-4 text-gray-900 dark:text-white">
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-gray-400" />
                              <span className="truncate max-w-[200px]">{example.filename}</span>
                              {example.isActive && (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 rounded-full px-2 py-0.5">
                                  <CheckCircle className="w-3 h-3" /> Active
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                example.type === 'good'
                                  ? 'bg-green-100 text-green-700'
                                  : example.type === 'bad'
                                  ? 'bg-red-100 text-red-700'
                                  : example.type === 'template'
                                  ? 'bg-indigo-100 text-indigo-700'
                                  : 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {example.type === 'template' ? 'Report Template' : example.type}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                example.status === 'trained'
                                  ? 'bg-indigo-100 text-indigo-700'
                                  : example.status === 'processing'
                                  ? 'bg-amber-100 text-amber-700'
                                  : example.status === 'failed'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {example.status}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-gray-600">
                            {formatDate(example.createdAt)}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              {example.type === 'template' && !example.isActive && example.status === 'trained' && (
                                <button
                                  onClick={() => handleActivateTemplate(example._id)}
                                  disabled={activatingTemplateId === example._id}
                                  className="inline-flex items-center gap-1 text-green-600 hover:text-green-800 disabled:opacity-50 text-sm font-medium"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                  {activatingTemplateId === example._id ? 'Activating...' : 'Set as Active'}
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteTrainingExample(example._id)}
                                disabled={deletingExampleId === example._id}
                                className="inline-flex items-center gap-1 text-red-600 hover:text-red-800 disabled:opacity-50"
                              >
                                <Trash2 className="w-4 h-4" />
                                {deletingExampleId === example._id ? 'Deleting...' : 'Delete'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── TEAMS TAB ── */}
        {activeTab === 'teams' && (
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-6">
            {/* Show a success message after assigning a team lead */}
            {leadSuccessMessage && (
              <div className="mb-4 px-4 py-3 bg-green-100 text-green-800 rounded-lg text-sm font-medium">
                {leadSuccessMessage}
              </div>
            )}
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Teams</h2>
              {/* Reset form state before opening the create modal */}
              <button
                onClick={() => { setTeamError(''); setNewTeamName(''); setShowCreateTeamModal(true); }}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
              >
                + Create Team
              </button>
            </div>

            {/* Empty state when no teams exist yet */}
            {teams.length === 0 ? (
              <p className="text-gray-600 dark:text-gray-300 text-sm text-center py-8">No teams created yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 bg-gray-50">
                    <th className="pb-3 pt-3 px-2">TEAM NAME</th>
                    <th className="pb-3 pt-3 px-2">CREATED</th>
                    <th className="pb-3 pt-3 px-2">WARNING</th>
                    <th className="pb-3 pt-3 px-2">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map(t => (
                    <tr key={t._id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-4 px-2 text-gray-900 font-medium">{t.name}</td>
                      <td className="py-4 px-2 text-gray-500">
                        {new Date(t.createdAt).toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'short', year: 'numeric'
                        })}
                      </td>
                      {/* Warn the admin if a team has no lead assigned */}
                      <td className="py-4 px-2">
                        {!t.teamLead && (
                          <span className="text-xs text-red-500 font-medium">No team lead assigned</span>
                        )}
                      </td>
                      <td className="py-4 px-2">
                        {/* Toggle the manage panel for this row; clicking again closes it */}
                        <button
                          onClick={() => setManageTeamId(manageTeamId === t._id ? null : t._id)}
                          className="text-sm text-indigo-600 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50"
                        >
                          Manage Team
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Manage Team Modal — action picker for the selected team */}
            {manageTeamId && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 w-full max-w-sm">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    {teams.find(t => t._id === manageTeamId)?.name}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Choose an action for this team</p>
                  <div className="flex flex-col gap-2">
                    <button onClick={handleOpenAddMembers} className="w-full text-sm font-medium px-4 py-2.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                      Add Members
                    </button>
                    <button onClick={() => setShowViewMembers(true)} className="w-full text-sm font-medium px-4 py-2.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                      View Members
                    </button>
                    <button onClick={handleOpenAssignLead} className="w-full text-sm font-medium px-4 py-2.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                      Assign Team Lead
                    </button>
                    <button onClick={handleOpenTeamAnalytics} className="w-full text-sm font-medium px-4 py-2.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                      View Analytics
                    </button>
                    <button onClick={() => setConfirmDeleteTeam(true)} className="w-full text-sm font-medium px-4 py-2.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                      Delete Team
                    </button>
                  </div>
                  <button
                    onClick={() => setManageTeamId(null)}
                    className="mt-4 w-full text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Close
                  </button>
                </div>

                {/* Confirm Delete Team — extra confirmation before permanently removing the team */}
                {confirmDeleteTeam && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 w-full max-w-sm">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Delete Team</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mb-5">
                        Are you sure you want to delete <span className="font-semibold">{teams.find(t => t._id === manageTeamId)?.name}</span>? This will remove the team and all its member associations. This action cannot be undone.
                      </p>
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => setConfirmDeleteTeam(false)}
                          className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleDeleteTeam}
                          className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Add Members Overlay — searchable checklist of all users not yet in this team */}
            {showAddMembers && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 w-full max-w-md max-h-[80vh] flex flex-col">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">Add Members</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    {teams.find(t => t._id === manageTeamId)?.name}
                  </p>
                  {/* Live search filters the user list as you type */}
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={addMemberSearch}
                    onChange={(e) => setAddMemberSearch(e.target.value)}
                    autoFocus
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                    {users
                      .filter(u =>
                        u.name?.toLowerCase().includes(addMemberSearch.toLowerCase()) ||
                        u.email?.toLowerCase().includes(addMemberSearch.toLowerCase())
                      )
                      .map(u => {
                        const isSelected = selectedMemberIds.includes(u._id);
                        return (
                          <label
                            key={u._id}
                            className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleMemberSelection(u._id)}
                              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <div>
                              <p className="text-sm font-medium text-gray-900">{u.name}</p>
                              <p className="text-xs text-gray-500">{u.email}</p>
                            </div>
                          </label>
                        );
                      })}
                  </div>
                  <div className="flex justify-between items-center mt-4">
                    <button
                      onClick={() => setShowAddMembers(false)}
                      className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleAddMembers}
                      disabled={addingMembers}
                      className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {addingMembers ? 'Adding...' : 'Add'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* View Members Overlay — lists current members with their role badge and a remove option */}
            {showViewMembers && manageTeamId && (() => {
              const team = teams.find(t => t._id === manageTeamId);
              const members = team?.members || [];
              return (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 w-full max-w-md max-h-[80vh] flex flex-col">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">Team Members</h3>
                    <p className="text-sm text-gray-500 mb-4">{team?.name}</p>
                    {members.length === 0 ? (
                      <p className="text-gray-400 text-sm text-center py-8">No members in this team yet.</p>
                    ) : (
                      <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                        {members.map(m => (
                          <div key={m._id} className="flex items-center gap-3 px-4 py-3">
                            {/* Avatar using the first letter of the member's name */}
                            <div className="bg-indigo-100 text-indigo-600 rounded-full h-8 w-8 flex items-center justify-center text-sm font-semibold">
                              {m.name?.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">{m.name}</p>
                              <p className="text-xs text-gray-500">{m.email}</p>
                            </div>
                            {/* Highlight team leaders with a green badge */}
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              m.role === 'team_leader'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {m.role === 'team_leader' ? 'Team Leader' : 'User'}
                            </span>
                            <button
                              onClick={() => setConfirmRemoveMember(m)}
                              className="text-xs text-red-500 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => { setShowViewMembers(false); setConfirmRemoveMember(null); }}
                      className="mt-4 px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Back
                    </button>
                  </div>

                  {/* Confirm Remove Member — second step to prevent accidental removals */}
                  {confirmRemoveMember && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]">
                      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 w-full max-w-sm">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Remove Member</h3>
                        <p className="text-sm text-gray-600 mb-5">
                          Are you sure you want to remove <span className="font-semibold">{confirmRemoveMember.name}</span> from this team? This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-3">
                          <button
                            onClick={() => setConfirmRemoveMember(null)}
                            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleRemoveMember(confirmRemoveMember._id)}
                            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Assign Team Lead Overlay — radio list so only one member can be selected as lead */}
            {showAssignLead && manageTeamId && (() => {
              const team = teams.find(t => t._id === manageTeamId);
              const members = team?.members || [];
              return (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 w-full max-w-md max-h-[80vh] flex flex-col">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">Assign Team Lead</h3>
                    <p className="text-sm text-gray-500 mb-4">{team?.name}</p>
                    {members.length === 0 ? (
                      <p className="text-gray-400 text-sm text-center py-8">No members in this team. Add members first.</p>
                    ) : (
                      <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                        {members.map(m => {
                          const isSelected = selectedLeadId === m._id;
                          const isCurrentLead = team?.teamLead?._id === m._id;
                          return (
                            <label
                              key={m._id}
                              className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 ${isSelected ? 'bg-indigo-50' : ''}`}
                            >
                              <input
                                type="radio"
                                name="teamLead"
                                checked={isSelected}
                                onChange={() => setSelectedLeadId(m._id)}
                                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                              />
                              <div className="bg-indigo-100 text-indigo-600 rounded-full h-8 w-8 flex items-center justify-center text-sm font-semibold">
                                {m.name?.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-medium text-gray-900">{m.name}</p>
                                <p className="text-xs text-gray-500">{m.email}</p>
                              </div>
                              {/* Badge to make it obvious who is already the lead */}
                              {isCurrentLead && (
                                <span className="text-xs text-indigo-600 font-medium bg-indigo-100 px-2 py-0.5 rounded-full">Current Lead</span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    )}
                    <div className="flex justify-between items-center mt-4">
                      <button
                        onClick={() => setShowAssignLead(false)}
                        className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Back
                      </button>
                      {members.length > 0 && (
                        <button
                          onClick={() => {
                            const member = members.find(m => m._id === selectedLeadId);
                            if (!member) return alert('Please select a member');
                            setConfirmLead(member);
                          }}
                          className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
                        >
                          Assign
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Confirm Assign Lead — one last check before changing the lead role */}
                  {confirmLead && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]">
                      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 w-full max-w-sm">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirm Team Lead</h3>
                        <p className="text-sm text-gray-600 mb-5">
                          Are you sure you want to assign <span className="font-semibold">{confirmLead.name}</span> as the team lead for <span className="font-semibold">{team?.name}</span>?
                        </p>
                        <div className="flex justify-end gap-3">
                          <button
                            onClick={() => setConfirmLead(null)}
                            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleConfirmAssignLead}
                            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                          >
                            Confirm
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Team Analytics Overlay — detailed stats panel for the selected team */}
            {showTeamAnalytics && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                  <div className="flex justify-between items-start mb-5">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Team Analytics</h3>
                      <p className="text-sm text-gray-500">
                        {teams.find(t => t._id === manageTeamId)?.name}
                        {/* Show the team lead's name next to the team name if one is set */}
                        {teamStats?.teamLead && (
                          <span className="ml-2 text-xs text-indigo-600 font-medium">Lead: {teamStats.teamLead.name}</span>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => { setShowTeamAnalytics(false); setTeamStats(null); }}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Jump to individual stats button — only visible once a member filter is active and their data has loaded */}
                  {teamFilterUser && !teamUserProfileLoading && teamUserProfileAnalytics && (
                    <button
                      onClick={() => document.getElementById('team-user-profile-stats')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                      className="flex items-center gap-2 mx-auto mt-4 mb-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium transition-colors border border-indigo-200"
                    >
                      <span>View Individual Statistics for {(() => {
                        const currentTeam = teams.find(t => t._id === manageTeamId);
                        const member = currentTeam?.members?.find(m => (typeof m === 'object' ? m._id : m) === teamFilterUser);
                        return typeof member === 'object' ? member.name : 'selected member';
                      })()}</span>
                      <ArrowDown className="w-4 h-4 animate-bounce" />
                    </button>
                  )}

                  {/* Team Analytics Filters — date range, member, and result type */}
                  <div className="bg-gray-50 rounded-lg p-4 mb-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Filter className="w-4 h-4 text-indigo-600" />
                      <h4 className="text-sm font-semibold text-gray-700">Filter Analytics</h4>
                      {/* Only show the clear button when at least one filter is active */}
                      {(teamFilterRange !== 'all' || teamFilterUser || teamFilterResult) && (
                        <button
                          onClick={() => { setTeamFilterRange('all'); setTeamFilterUser(''); setTeamFilterResult(''); fetchTeamStats('all', '', ''); }}
                          className="ml-auto text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          Clear all filters
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Date Range</label>
                        <select
                          value={teamFilterRange}
                          onChange={(e) => { setTeamFilterRange(e.target.value); fetchTeamStats(e.target.value, teamFilterUser, teamFilterResult); }}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                          <option value="all">All Time</option>
                          <option value="7">Last 7 Days</option>
                          <option value="30">Last 30 Days</option>
                          <option value="90">Last 90 Days</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Member</label>
                        <select
                          value={teamFilterUser}
                          onChange={(e) => { setTeamFilterUser(e.target.value); fetchTeamStats(teamFilterRange, e.target.value, teamFilterResult); }}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                          <option value="">All Members</option>
                          {/* Populate options from the current team's member list */}
                          {(() => {
                            const currentTeam = teams.find(t => t._id === manageTeamId);
                            return (currentTeam?.members || []).map(m => {
                              const member = typeof m === 'object' ? m : null;
                              return member ? (
                                <option key={member._id} value={member._id}>{member.name}</option>
                              ) : null;
                            });
                          })()}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Result</label>
                        <select
                          value={teamFilterResult}
                          onChange={(e) => { setTeamFilterResult(e.target.value); fetchTeamStats(teamFilterRange, teamFilterUser, e.target.value); }}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                          <option value="">All Results</option>
                          <option value="good">Passed</option>
                          <option value="bad">Failed</option>
                          <option value="uncertain">Uncertain</option>
                        </select>
                      </div>
                    </div>
                    {/* Active filter pills — shows a summary of what filters are currently applied */}
                    {(teamFilterRange !== 'all' || teamFilterUser || teamFilterResult) && (
                      <div className="flex items-center gap-2 flex-wrap mt-3 text-sm">
                        <span className="text-indigo-700 font-medium text-xs">Showing:</span>
                        {teamFilterRange !== 'all' && (
                          <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-medium">
                            Last {teamFilterRange} days
                          </span>
                        )}
                        {teamFilterUser && (
                          <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-medium">
                            Member: {(() => {
                              const currentTeam = teams.find(t => t._id === manageTeamId);
                              const member = currentTeam?.members?.find(m => (typeof m === 'object' ? m._id : m) === teamFilterUser);
                              return typeof member === 'object' ? member.name : 'Unknown';
                            })()}
                          </span>
                        )}
                        {teamFilterResult && (
                          <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-medium">
                            Result: {teamFilterResult === 'good' ? 'Passed' : teamFilterResult === 'bad' ? 'Failed' : 'Uncertain'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {teamStatsLoading ? (
                    <p className="text-gray-400 text-sm text-center py-8 animate-pulse">Loading analytics...</p>
                  ) : teamStats ? (
                    <>
                      {/* Top-level stat cards: members, reports, errors, time saved */}
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl p-4">
                          <div className="flex items-center">
                            <div className="bg-blue-500 p-2.5 rounded-lg">
                              <Users className="w-5 h-5 text-white" />
                            </div>
                            <div className="ml-3">
                              <p className="text-xl font-bold text-gray-900 dark:text-white">{teamStats.totalMembers}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">Members</p>
                            </div>
                          </div>
                        </div>
                        <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl p-4">
                          <div className="flex items-center">
                            <div className="bg-green-500 p-2.5 rounded-lg">
                              <FileText className="w-5 h-5 text-white" />
                            </div>
                            <div className="ml-3">
                              <p className="text-xl font-bold text-gray-900 dark:text-white">{teamStats.totalReports}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">Reports</p>
                            </div>
                          </div>
                        </div>
                        <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl p-4">
                          <div className="flex items-center">
                            <div className="bg-red-500 p-2.5 rounded-lg">
                              <AlertTriangle className="w-5 h-5 text-white" />
                            </div>
                            <div className="ml-3">
                              <p className="text-xl font-bold text-gray-900 dark:text-white">{teamStats.totalErrors}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">Errors Found</p>
                            </div>
                          </div>
                        </div>
                        <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl p-4">
                          <div className="flex items-center">
                            <div className="bg-amber-500 p-2.5 rounded-lg">
                              <Clock className="w-5 h-5 text-white" />
                            </div>
                            <div className="ml-3">
                              <p className="text-xl font-bold text-gray-900 dark:text-white">{formatMinutes(teamStats.timeSaved)}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">Time Saved</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Quality Assessment Breakdown — passed/failed/uncertain/pending counts */}
                      {teamStats.qualityBreakdown && (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                            <p className="text-2xl font-bold text-green-600">{teamStats.qualityBreakdown.passed}</p>
                            <p className="text-xs text-gray-500 mt-1">Passed</p>
                          </div>
                          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                            <p className="text-2xl font-bold text-red-600">{teamStats.qualityBreakdown.failed}</p>
                            <p className="text-xs text-gray-500 mt-1">Failed</p>
                          </div>
                          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                            <p className="text-2xl font-bold text-amber-600">{teamStats.qualityBreakdown.uncertain}</p>
                            <p className="text-xs text-gray-500 mt-1">Uncertain</p>
                          </div>
                          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
                            <p className="text-2xl font-bold text-gray-600">{teamStats.qualityBreakdown.pending}</p>
                            <p className="text-xs text-gray-500 mt-1">Pending</p>
                          </div>
                        </div>
                      )}

                      {/* Charts — bar chart for most common errors, pie chart for error type distribution */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                        <div className="border border-gray-200 rounded-xl p-4">
                          <h4 className="text-sm font-semibold text-gray-900 mb-3">Most Common Errors</h4>
                          <ResponsiveContainer width="100%" height={180}>
                            <BarChart data={teamStats.errorBreakdown.map(e => ({ name: e.name, errors: e.value }))}>
                              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                              <YAxis />
                              <Tooltip />
                              <Bar dataKey="errors" fill="#6366f1" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="border border-gray-200 rounded-xl p-4">
                          <h4 className="text-sm font-semibold text-gray-900 mb-3">Error Type Distribution</h4>
                          <ResponsiveContainer width="100%" height={180}>
                            <PieChart>
                              <Pie data={teamStats.errorBreakdown} dataKey="value" nameKey="name" outerRadius={65} label={({ name, value }) => `${name}: ${value}`}>
                                {teamStats.errorBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                              </Pie>
                              <Tooltip />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Time savings — compares manual review time vs AI review time */}
                      <div className="border border-gray-200 rounded-xl p-4 mb-6">
                        <h4 className="text-sm font-semibold text-gray-900 mb-3">Time Savings Analysis</h4>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-purple-100 rounded-lg p-4 text-center">
                            <p className="text-2xl font-bold text-indigo-600">{formatMinutes(teamStats.manualTime)}</p>
                            <p className="text-xs text-gray-500 mt-1">Manual Review Time</p>
                          </div>
                          <div className="bg-green-100 rounded-lg p-4 text-center">
                            <p className="text-2xl font-bold text-green-600">{formatMinutes(teamStats.aiTime)}</p>
                            <p className="text-xs text-gray-500 mt-1">AI Review Time</p>
                          </div>
                          <div className="bg-purple-100 rounded-lg p-4 text-center">
                            <p className="text-2xl font-bold text-purple-600">{teamStats.timeSavedPercent}%</p>
                            <p className="text-xs text-gray-500 mt-1">Time Saved</p>
                          </div>
                        </div>
                      </div>

                      {/* Member Breakdown — per-member report and error counts in a table */}
                      {teamStats.memberBreakdown?.length > 0 && (
                        <div className="border border-gray-200 rounded-xl p-4 mb-6">
                          <h4 className="text-sm font-semibold text-gray-900 mb-3">Member Breakdown</h4>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-gray-500 bg-gray-50">
                                <th className="pb-2 pt-2 px-3">Member</th>
                                <th className="pb-2 pt-2 px-3 text-center">Reports</th>
                                <th className="pb-2 pt-2 px-3 text-center">Errors</th>
                                <th className="pb-2 pt-2 px-3 text-center">Passed</th>
                                <th className="pb-2 pt-2 px-3 text-center">Failed</th>
                              </tr>
                            </thead>
                            <tbody>
                              {teamStats.memberBreakdown.map(m => (
                                <tr key={m._id} className="border-t border-gray-100 hover:bg-gray-50">
                                  <td className="py-2.5 px-3">
                                    <p className="font-medium text-gray-900">{m.name}</p>
                                    <p className="text-xs text-gray-400">{m.email}</p>
                                  </td>
                                  <td className="py-2.5 px-3 text-center text-gray-700">{m.reportsCount}</td>
                                  <td className="py-2.5 px-3 text-center text-red-600 font-medium">{m.errorsFound}</td>
                                  <td className="py-2.5 px-3 text-center text-green-600 font-medium">{m.passed}</td>
                                  <td className="py-2.5 px-3 text-center text-red-600 font-medium">{m.failed}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Recent Reports — latest reports submitted by team members with view/download/delete actions */}
                      {teamStats.recentReports?.length > 0 && (
                        <div className="border border-gray-200 rounded-xl p-4">
                          <h4 className="text-sm font-semibold text-gray-900 mb-3">Recent Reports</h4>
                          <div className="space-y-2">
                            {teamStats.recentReports.map(r => (
                              <div key={r._id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">{r.filename}</p>
                                  <p className="text-xs text-gray-400">
                                    by {r.analyzedBy} — {new Date(r.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                  </p>
                                </div>
                                <div className="flex items-center gap-3 ml-4">
                                  <span className="text-xs text-red-500 font-medium">{r.errorCount} errors</span>
                                  {r.result === 'good' && (
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-green-100 text-green-700">Passed</span>
                                  )}
                                  {r.result === 'bad' && (
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-red-100 text-red-700">Failed</span>
                                  )}
                                  {r.result === 'uncertain' && (
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-700">Uncertain</span>
                                  )}
                                  {/* Fall back to the raw status string if no result has been set yet */}
                                  {!r.result && (
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-500">{r.status}</span>
                                  )}
                                  <Link
                                    to={`/report/${r._id}`}
                                    className="text-indigo-600 hover:text-indigo-900"
                                    title="View Report"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Link>
                                  <button
                                    onClick={() => handleReportDownload(r._id, r.filename)}
                                    className="text-gray-600 hover:text-gray-900"
                                    title="Download Summary"
                                  >
                                    <Download className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleReportDelete(r._id)}
                                    className="text-red-600 hover:text-red-900"
                                    title="Delete Report"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Individual Member Profile Stats — rendered when a specific member is selected in the filter */}
                      {teamFilterUser && (
                        <div id="team-user-profile-stats" className="border border-gray-200 rounded-xl p-4 mt-4">
                          {renderUserProfileStats(teamUserProfileAnalytics, teamUserProfileLoading)}
                        </div>
                      )}

                      {/* Empty state — shown when the team exists but no reports have been submitted yet */}
                      {teamStats.totalReports === 0 && !teamFilterUser && (
                        <div className="bg-gray-50 rounded-xl p-8 text-center">
                          <p className="text-gray-400 text-sm">No reports have been submitted by members of this team yet.</p>
                        </div>
                      )}
                    </>
                  ) : null}

                  <button
                    onClick={() => { setShowTeamAnalytics(false); setTeamStats(null); }}
                    className="mt-4 px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Back
                  </button>
                </div>
              </div>
            )}

            {/* Create Team Modal — simple form to give the new team a name */}
            {showCreateTeamModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 w-full max-w-md">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Create a New Team</h3>
                  <form onSubmit={handleCreateTeam}>
                    <input
                      type="text"
                      placeholder="Enter team name..."
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      autoFocus
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    {teamError && (
                      <p className="text-red-500 text-sm mb-3">{teamError}</p>
                    )}
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setShowCreateTeamModal(false)}
                        className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={teamCreating}
                        className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {teamCreating ? 'Creating...' : 'Create'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SECURITY TAB ── */}
        {activeTab === 'security' && (
          <section className="space-y-6">
            {/* Audit log table — records every significant action taken in the app */}
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-indigo-600" />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Audit Log</h2>
                </div>
                <div className="flex items-center gap-2">
                  {/* Filter dropdown — changing it resets to page 1 so you don't land on an empty page */}
                  <select
                    value={auditFilter}
                    onChange={(e) => { setAuditFilter(e.target.value); setAuditPage(1); }}
                    className="text-sm border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">All events</option>
                    <option value="login_success">Successful logins</option>
                    <option value="login_failed">Failed logins</option>
                    <option value="login_inactive">Inactive account blocks</option>
                    <option value="account_locked">Account lockouts</option>
                    <option value="login_blocked_lockout">Blocked — locked account</option>
                    <option value="report_deleted">Report deletions</option>
                    <option value="training_upload">Training uploads</option>
                    <option value="training_deleted">Training deletions</option>
                    <option value="team_created">Team created</option>
                    <option value="team_deleted">Team deleted</option>
                    <option value="team_member_added">Member added</option>
                    <option value="team_member_removed">Member removed</option>
                    <option value="team_lead_assigned">Team lead assigned</option>
                  </select>
                  {/* Manual refresh in case new events came in while the page is open */}
                  <button
                    onClick={() => fetchAuditLogs(auditFilter, auditPage)}
                    className="text-sm border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              {/* Loading spinner while the first page of logs is being fetched */}
              {auditLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                </div>
              ) : auditLogs.length === 0 ? (
                // Empty state — shown when the filter returns no matching events
                <p className="text-center text-gray-400 text-sm py-10">No log entries found.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-800 text-left text-gray-600 dark:text-gray-300">
                          <th className="px-4 py-3 font-semibold">Event</th>
                          <th className="px-4 py-3 font-semibold">User / Email</th>
                          <th className="px-4 py-3 font-semibold">IP Address</th>
                          <th className="px-4 py-3 font-semibold">Details</th>
                          <th className="px-4 py-3 font-semibold">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditLogs.map((log) => (
                          <tr key={log._id} className="border-b border-gray-100 dark:border-gray-800 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            {/* Event type badge — colour coded so you can spot security issues at a glance */}
                            <td className="px-4 py-3">
                              {log.action === 'login_success' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                                  <LogIn className="w-3 h-3" /> Login success
                                </span>
                              )}
                              {log.action === 'login_failed' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                                  <XCircle className="w-3 h-3" /> Login failed
                                </span>
                              )}
                              {log.action === 'login_inactive' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                                  <AlertTriangle className="w-3 h-3" /> Inactive account
                                </span>
                              )}
                              {log.action === 'account_locked' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-200 text-red-800">
                                  <KeyRound className="w-3 h-3" /> Account locked
                                </span>
                              )}
                              {log.action === 'login_blocked_lockout' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">
                                  <KeyRound className="w-3 h-3" /> Blocked — locked
                                </span>
                              )}
                              {log.action === 'report_deleted' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                                  <Trash2 className="w-3 h-3" /> Report deleted
                                </span>
                              )}
                              {log.action === 'training_upload' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
                                  <FileText className="w-3 h-3" /> Training upload
                                </span>
                              )}
                              {log.action === 'training_deleted' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                                  <Trash2 className="w-3 h-3" /> Training deleted
                                </span>
                              )}
                              {log.action === 'team_created' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                                  <Users className="w-3 h-3" /> Team created
                                </span>
                              )}
                              {log.action === 'team_deleted' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                                  <Users className="w-3 h-3" /> Team deleted
                                </span>
                              )}
                              {log.action === 'team_member_added' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                                  <Users className="w-3 h-3" /> Member added
                                </span>
                              )}
                              {log.action === 'team_member_removed' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                                  <Users className="w-3 h-3" /> Member removed
                                </span>
                              )}
                              {log.action === 'team_lead_assigned' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
                                  <Users className="w-3 h-3" /> Lead assigned
                                </span>
                              )}
                            </td>
                            {/* User cell — shows full name + email if the user account still exists, otherwise just the email */}
                            <td className="px-4 py-3">
                              {log.userId?.name ? (
                                <div>
                                  <p className="font-medium text-gray-900 dark:text-white">{log.userId.name}</p>
                                  <p className="text-xs text-gray-500">{log.email}</p>
                                </div>
                              ) : (
                                <span className="text-gray-500">{log.email || '—'}</span>
                              )}
                            </td>
                            {/* IP address in monospace so it's easy to scan for repeated offenders */}
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-300 font-mono text-xs">
                              {log.ip || '—'}
                            </td>
                            {/* Details cell — different fields are relevant depending on the event type,
                                so we render only the ones that are actually present */}
                            <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                              {log.details?.filename && (
                                <span className="font-medium text-gray-700 dark:text-gray-300">{log.details.filename}</span>
                              )}
                              {log.details?.type && (
                                <span className="ml-1 text-indigo-500">({log.details.type})</span>
                              )}
                              {log.details?.reason && !log.details?.filename && (
                                <span>{log.details.reason}</span>
                              )}
                              {log.details?.role && !log.details?.filename && (
                                <span>{log.details.role}</span>
                              )}
                              {log.details?.deletedBy && (
                                <span className="ml-1 text-gray-400">by {log.details.deletedBy}</span>
                              )}
                              {log.details?.teamName && !log.details?.filename && (
                                <span className="font-medium text-gray-700 dark:text-gray-300">{log.details.teamName}</span>
                              )}
                              {/* Arrow shows who the new lead is when a lead was assigned */}
                              {log.details?.newLeadName && (
                                <span className="ml-1 text-indigo-600">→ {log.details.newLeadName}</span>
                              )}
                              {log.details?.removedUserEmail && (
                                <span className="ml-1 text-gray-500">{log.details.removedUserEmail}</span>
                              )}
                              {/* Member count for add-members events */}
                              {log.details?.count > 0 && (
                                <span className="ml-1 text-gray-400">({log.details.count} member{log.details.count !== 1 ? 's' : ''})</span>
                              )}
                              {/* Member count specifically for team deletions */}
                              {log.details?.memberCount !== undefined && log.action === 'team_deleted' && (
                                <span className="ml-1 text-gray-400">({log.details.memberCount} member{log.details.memberCount !== 1 ? 's' : ''})</span>
                              )}
                              {/* Failed attempt counter — helps spot brute-force attempts */}
                              {log.details?.failedAttempts > 0 && (
                                <span className="ml-1 text-red-500">({log.details.failedAttempts}/5 attempts)</span>
                              )}
                              {/* Lockout expiry time */}
                              {log.details?.lockedUntil && (
                                <span className="ml-1 text-red-600 font-medium">
                                  — until {new Date(log.details.lockedUntil).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                              {/* Minutes remaining shown for accounts still within a lockout window */}
                              {log.details?.minutesLeft && (
                                <span className="ml-1 text-orange-600">({log.details.minutesLeft}m remaining)</span>
                              )}
                              {/* Fall back to a dash if none of the detail fields are populated */}
                              {!log.details?.filename && !log.details?.reason && !log.details?.role && '—'}
                            </td>
                            <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
                              {new Date(log.createdAt).toLocaleString('en-GB', {
                                day: '2-digit', month: 'short', year: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination — only rendered when there is more than one page of results */}
                  {auditTotalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                      <p className="text-sm text-gray-500">Page {auditPage} of {auditTotalPages}</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                          disabled={auditPage === 1}
                          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
                        >
                          Previous
                        </button>
                        <button
                          onClick={() => setAuditPage((p) => Math.min(auditTotalPages, p + 1))}
                          disabled={auditPage === auditTotalPages}
                          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        )}

      </main>

      {showCreateUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-800 shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Create New User</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Add the user details below and assign their role.
                </p>
              </div>

              <button
                type="button"
                onClick={closeCreateUserModal}
                disabled={submitting}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Close create user modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4 px-6 py-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-300 px-4 py-2"
                  placeholder="Jane Smith"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-300 px-4 py-2"
                  placeholder="jane@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2"
                >
                  <option value="user">User</option>
                  <option value="team_leader">Team Leader</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {errorMessage && (
                <p className="text-sm text-red-600">{errorMessage}</p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeCreateUserModal}
                  disabled={submitting}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
};

export default AdminDashboard;
