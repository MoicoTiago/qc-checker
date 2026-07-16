import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  BarChart3,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  Loader2,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const formatMinutes = (value) => {
  const minutes = Number(value) || 0;
  const roundedMinutes = Math.round(minutes);

  if (roundedMinutes < 60) {
    return `${roundedMinutes} min`;
  }

  const hours = roundedMinutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
};

const Profile = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState('');
  const [expandedReports, setExpandedReports] = useState({});
  const [selectedScope, setSelectedScope] = useState('all');

  // Re-fetches on every scope change rather than slicing a single "all time" payload client-side.
  // The server pre-computes bucketed trend data (pass rate, per-period aggregates) sized to the
  // scope, so filtering in the browser would produce misaligned buckets and incorrect averages.
  useEffect(() => {
    const fetchProfileAnalytics = async () => {
      setAnalyticsLoading(true);
      setAnalyticsError('');

      try {
        const response = await api.get('/reports/profile-analytics', {
          params: { scope: selectedScope },
        });
        setAnalytics(response.data);
      } catch (error) {
        setAnalyticsError(
          error.response?.data?.message || 'Failed to load profile analytics'
        );
      } finally {
        setAnalyticsLoading(false);
      }
    };

    fetchProfileAnalytics();
  }, [selectedScope]);

  const handleRequestPasswordReset = async () => {
    setSubmitting(true);
    setSuccessMessage('');
    setErrorMessage('');

    try {
      const response = await api.post('/password-reset-requests');
      setSuccessMessage(response.data.message);
    } catch (error) {
      setErrorMessage(
        error.response?.data?.message || 'Failed to submit password reset request'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const summaryCards = analytics
    ? [
        {
          label: t('profile.totalReports'),
          value: analytics.summary?.totalReports ?? 0,
          icon: FileText,
        },
        {
          label: t('profile.analysedReports'),
          value: analytics.summary?.analyzedReports ?? 0,
          icon: CheckCircle,
        },
        {
          label: t('profile.totalErrors'),
          value: analytics.summary?.totalErrors ?? 0,
          icon: AlertCircle,
        },
        {
          label: t('profile.averageErrors'),
          value: analytics.summary?.averageErrorsPerReport ?? 0,
          icon: BarChart3,
        },
        {
          label: t('profile.timeSaved'),
          value: formatMinutes(analytics.summary?.totalTimeSaved),
          icon: Clock,
        },
      ]
    : [];

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
      processing: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
      analyzed: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
      failed: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
    };

    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          badges[status] || 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
        }`}
      >
        {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown'}
      </span>
    );
  };

  // Surface "Pending" off the workflow status rather than `qualityLabel` because the label is
  // `null` until analysis completes; showing the status keeps the badge meaningful even for
  // reports stuck in `processing`/`failed` states where a label would never arrive.
  const getQualityBadge = (report) => {
    if (report.status !== 'analyzed') {
      return <span className="text-sm text-gray-400">{t('dashboard.pending')}</span>;
    }

    const badges = {
      good: { text: t('dashboard.passed'), color: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' },
      bad: { text: t('dashboard.failed'), color: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' },
      uncertain: { text: t('dashboard.uncertain'), color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300' },
    };

    const badge = badges[report.qualityLabel] || {
      text: t('dashboard.uncertain'),
      color: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
        {badge.text}
      </span>
    );
  };

  const toggleReport = (reportId) => {
    setExpandedReports((current) => ({
      ...current,
      [reportId]: !current[reportId],
    }));
  };

  const errorSummaryCards = [
    {
      key: 'placeholder',
      label: t('profile.placeholder'),
      valueClass: 'text-orange-600 dark:text-orange-400',
      cardClass: 'bg-orange-50 dark:bg-orange-900/30',
    },
    {
      key: 'consistency',
      label: t('profile.consistency'),
      valueClass: 'text-blue-600 dark:text-blue-400',
      cardClass: 'bg-blue-50 dark:bg-blue-900/30',
    },
    {
      key: 'compliance',
      label: t('profile.compliance'),
      valueClass: 'text-red-600 dark:text-red-400',
      cardClass: 'bg-red-50 dark:bg-red-900/30',
    },
    {
      key: 'formatting',
      label: t('profile.formatting'),
      valueClass: 'text-purple-600 dark:text-purple-400',
      cardClass: 'bg-purple-50 dark:bg-purple-900/30',
    },
    {
      key: 'missing_data',
      label: t('profile.missing_data'),
      valueClass: 'text-green-600 dark:text-green-400',
      cardClass: 'bg-green-50 dark:bg-green-900/30',
    },
  ];

  // Quality scores are already percentages (0–100), so the chart's Y-axis domain should stay
  // anchored at 100 even when every datapoint is well below it. The axis consumer clamps via
  // `Math.max(qualityScoreMaxValue, 100)` so a single low score doesn't collapse the scale.
  const passRateMaxValue = 100;
  const qualityScoreMaxValue = analytics?.qualityScoreTrend?.reduce((max, report) => {
    return Math.max(max, report.qualityScore || 0);
  }, 0) ?? 0;
  const errorTypeLabelMap = {
    placeholder: 'Placeholder',
    consistency: 'Consistency',
    compliance: 'Compliance',
    formatting: 'Formatting',
    missing_data: 'Missing Data',
  };
  const errorTypeColors = ['#F97316', '#2563EB', '#DC2626', '#9333EA', '#16A34A'];
  const commonErrorTypeChartData = analytics?.mostCommonErrorTypes?.map((item, index) => ({
    name: errorTypeLabelMap[item.type] || item.type,
    errors: item.count,
    reportsAffected: item.reportsAffected,
    fill: errorTypeColors[index % errorTypeColors.length],
  })) || [];
  const checklistChartData = analytics?.checklistFailureBreakdown?.map((item, index) => ({
    shortLabel: item.message.length > 28 ? `${item.message.slice(0, 28)}...` : item.message,
    fullLabel: item.message,
    count: item.count,
  })) || [];
  const qualityScoreChartData = analytics?.qualityScoreTrend?.map((report) => ({
    label: report.filename.length > 18 ? `${report.filename.slice(0, 18)}...` : report.filename,
    fullLabel: report.filename,
    score: report.qualityScore,
    date: formatDate(report.createdAt),
  })) || [];
  const passRateChartData = analytics?.passFailRateTrends || [];
  const averageErrorTypeBreakdown = errorSummaryCards.map((card) => {
    const totalForType = analytics?.errorBreakdown?.[card.key] ?? 0;
    const analyzedReports = analytics?.summary?.analyzedReports ?? 0;

    return {
      ...card,
      average: analyzedReports > 0 ? Number((totalForType / analyzedReports).toFixed(2)) : 0,
    };
  });
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <Header />

      <main className="flex-1 max-w-6xl mx-auto px-4 py-8 w-full">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('profile.title')}</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            {t('profile.subtitle')}
          </p>

          <div className="mt-6 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <p><strong>{t('profile.name')}</strong> {user?.name}</p>
            <p><strong>{t('profile.email')}</strong> {user?.email}</p>
            <p><strong>{t('profile.role')}</strong> {user?.role}</p>
          </div>

          <div className="mt-8">
            <button
              type="button"
              onClick={handleRequestPasswordReset}
              disabled={submitting}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? t('profile.submitting') : t('profile.requestPasswordReset')}
            </button>
          </div>

          {successMessage && <p className="mt-4 text-sm text-green-600">{successMessage}</p>}
          {errorMessage && <p className="mt-4 text-sm text-red-600">{errorMessage}</p>}
        </div>

        <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-6 mt-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('profile.reportAnalytics')}</h2>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                {t('profile.analyticsSummary')}
              </p>
            </div>
            <div className="w-full sm:w-56">
              <label htmlFor="analytics-scope" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('profile.timeRange')}
              </label>
              {/*
                These values are a contract with the backend — `reportController.getProfileAnalyticsScopeConfig`
                whitelists exactly `'week' | 'month' | 'all'` and silently falls back to `'all'` for
                anything else. Adding a new option here requires a matching backend case.
              */}
              <select
                id="analytics-scope"
                value={selectedScope}
                onChange={(event) => setSelectedScope(event.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-900"
              >
                <option value="week">{t('profile.week')}</option>
                <option value="month">{t('profile.month')}</option>
                <option value="all">{t('profile.allTime')}</option>
              </select>
            </div>
          </div>

          {analyticsLoading ? (
            <div className="py-10 flex items-center justify-center text-gray-500 dark:text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin mr-3 text-indigo-600" />
              {t('profile.loadingAnalytics')}
            </div>
          ) : analyticsError ? (
            <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 flex items-center">
              <AlertCircle className="w-5 h-5 mr-2" />
              {analyticsError}
            </div>
          ) : analytics?.summary?.totalReports === 0 ? (
            <div className="mt-6 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-8 text-center">
              <FileText className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('profile.noAnalyticsTitle')}</h3>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                {t('profile.noAnalyticsDescription')}
              </p>
              <Link
                to="/dashboard"
                className="inline-flex items-center mt-5 rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
              >
                {t('profile.goToDashboard')}
              </Link>
            </div>
          ) : (
            <div className="mt-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                {summaryCards.map((card) => {
                  const Icon = card.icon;

                  return (
                    <div key={card.label} className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4 border border-gray-100 dark:border-gray-700">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-500 dark:text-gray-400">{card.label}</p>
                        <Icon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-3">{card.value}</p>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400">{t('profile.failedReports')}</p>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-white mt-2">
                    {analytics.summary?.failedReports ?? 0}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400">{t('profile.passedReviews')}</p>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-white mt-2">
                    {analytics.qualityBreakdown?.good ?? 0}
                  </p>
                </div>
              </div>

              <div className="mt-8">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('profile.avgErrorsPerReport')}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {t('profile.avgErrorsDescription')}
                </p>

                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 mt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                    {averageErrorTypeBreakdown.map((item) => (
                      <div
                        key={item.key}
                        className={`rounded-xl px-4 py-4 text-center border border-transparent ${item.cardClass}`}
                      >
                        <p className={`text-2xl font-bold ${item.valueClass}`}>{item.average}</p>
                        <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{item.label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                    <div className="rounded-xl bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 p-4">
                      <p className="text-sm text-gray-500 dark:text-gray-400">{t('profile.analysedReports')}</p>
                      <p className="text-2xl font-semibold text-gray-900 dark:text-white mt-2">
                        {analytics.summary?.analyzedReports ?? 0}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 p-4">
                      <p className="text-sm text-gray-500 dark:text-gray-400">{t('profile.overallAverageErrors')}</p>
                      <p className="text-2xl font-semibold text-gray-900 dark:text-white mt-2">
                        {analytics.summary?.averageErrorsPerReport ?? 0}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('profile.passRateOverTime')}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {t('profile.passRateDescription')}
                </p>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                  {t('profile.passRateExplanation')}
                </p>

                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 mt-4">
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={passRateChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis dataKey="periodLabel" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, passRateMaxValue]} tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(value, name, item) => {
                          if (name === 'Pass Rate') {
                            return [`${value}%`, name];
                          }
                          return [value, name];
                        }}
                        labelFormatter={(label, payload) => {
                          const point = payload?.[0]?.payload;
                          if (!point) return label;
                          return `${label} - ${point.passedCount}/${point.analyzedCount} passed`;
                        }}
                        contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="passRate"
                        name="Pass Rate"
                        stroke="#16A34A"
                        strokeWidth={3}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="mt-8">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('profile.qualityScoreTrend')}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {t('profile.qualityScoreDescription')}
                </p>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                  {t('profile.qualityScoreExplanation')}
                </p>

                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 mt-4">
                  {analytics.qualityScoreTrend?.length ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={qualityScoreChartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis domain={[0, Math.max(qualityScoreMaxValue, 100)]} tick={{ fontSize: 12 }} />
                        {/*
                          labelFormatter reaches into payload[0].payload.fullLabel because the
                          X-axis tick uses a truncated filename (see `label` mapping above); the
                          tooltip must display the untruncated one for readability. Same pattern
                          is reused on the checklist-failures chart below.
                        */}
                        <Tooltip
                          formatter={(value) => [`${value}`, 'Quality Score']}
                          labelFormatter={(label, payload) => {
                            const point = payload?.[0]?.payload;
                            return point ? `${point.fullLabel} - ${point.date}` : label;
                          }}
                          contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }}
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="score"
                          name="Quality Score"
                          stroke="#10B981"
                          strokeWidth={3}
                          dot={{ r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('profile.noQualityScores')}</p>
                  )}
                </div>
              </div>

              <div className="mt-8">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('profile.mostCommonErrorTypes')}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {t('profile.mostCommonDescription')}
                </p>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                  {t('profile.mostCommonExplanation')}
                </p>

                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 mt-4">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={commonErrorTypeChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(value) => [`${value}`, 'Errors']}
                        contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }}
                      />
                      <Bar dataKey="errors" name="Errors" radius={[6, 6, 0, 0]}>
                        {commonErrorTypeChartData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="mt-8">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('profile.topChecklistFailures')}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {t('profile.topChecklistDescription')}
                </p>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                  {t('profile.topChecklistExplanation')}
                </p>

                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 mt-4">
                  {analytics.checklistFailureBreakdown?.length ? (
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart
                        data={checklistChartData}
                        layout="vertical"
                        margin={{ top: 10, right: 30, left: 20, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                        <XAxis type="number" tick={{ fontSize: 12 }} />
                        <YAxis dataKey="shortLabel" type="category" tick={{ fontSize: 12 }} width={55} />
                        <Tooltip
                          formatter={(value) => [`${value}`, 'Occurrences']}
                          labelFormatter={(label, payload) => payload?.[0]?.payload?.fullLabel || label}
                          contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }}
                        />
                        <Bar dataKey="count" fill="#6366F1" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('profile.noChecklistFailures')}</p>
                  )}
                </div>
              </div>

              <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('profile.recentReports')}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {t('profile.recentReportsDescription')}
                    </p>
                  </div>
                  <Link
                    to="/dashboard"
                    className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                  >
                    {t('profile.viewAll')}
                  </Link>
                </div>

                {analytics.recentReports?.length ? (
                  <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-xl">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {t('dashboard.report')}
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {t('dashboard.status')}
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {t('dashboard.errors')}
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {t('dashboard.result')}
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {t('dashboard.date')}
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {t('dashboard.actions')}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                        {analytics.recentReports.map((report) => {
                          const isExpanded = expandedReports[report._id] ?? false;

                          return (
                            <Fragment key={report._id}>
                              <tr className="bg-white dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                                <td className="px-4 py-4 text-sm font-medium text-gray-900 dark:text-white">
                                  <button
                                    type="button"
                                    onClick={() => toggleReport(report._id)}
                                    className="inline-flex items-center text-left hover:text-indigo-700 dark:hover:text-indigo-400"
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="w-4 h-4 mr-2 text-gray-500 dark:text-gray-400" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4 mr-2 text-gray-500 dark:text-gray-400" />
                                    )}
                                    <span>{report.filename}</span>
                                  </button>
                                </td>
                                <td className="px-4 py-4 whitespace-nowrap">
                                  {getStatusBadge(report.status)}
                                </td>
                                <td className="px-4 py-4 whitespace-nowrap text-sm">
                                  {report.status === 'analyzed' ? (
                                    <span
                                      className={`font-medium ${
                                        report.errorCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                                      }`}
                                    >
                                      {report.errorCount} {report.errorCount === 1 ? t('dashboard.error') : t('dashboard.errorsPlural')}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400 dark:text-gray-500">-</span>
                                  )}
                                </td>
                                <td className="px-4 py-4 whitespace-nowrap">
                                  {getQualityBadge(report)}
                                </td>
                                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                  {formatDate(report.createdAt)}
                                </td>
                                <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                                  <Link
                                    to={`/report/${report._id}`}
                                    className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300"
                                  >
                                    {t('profile.view')}
                                  </Link>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr className="bg-gray-50 dark:bg-gray-800">
                                  <td colSpan="6" className="px-4 py-5">
                                    <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-4">
                                      <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                                        {t('profile.errorSummaryTitle')}
                                      </h4>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 mt-4">
                                        {errorSummaryCards.map((card) => (
                                          <div
                                            key={card.key}
                                            className={`rounded-xl px-4 py-4 text-center ${card.cardClass}`}
                                          >
                                            <p className={`text-2xl font-bold ${card.valueClass}`}>
                                              {report.errorSummary?.[card.key] ?? 0}
                                            </p>
                                            <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{card.label}</p>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-6 text-center text-gray-500 dark:text-gray-400">
                    {t('profile.noRecentReports')}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Profile;
