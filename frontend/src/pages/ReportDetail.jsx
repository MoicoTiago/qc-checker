import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  FileText,
  ArrowLeft,
  Clock,
  AlertCircle,
  CheckCircle,
  Loader2,
  AlertTriangle,
  FileWarning,
  Type,
  Database,
  ChevronDown,
  ChevronRight,
  Download,
  Highlighter,
} from 'lucide-react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import api from '../services/api';
import { useLanguage } from '../context/LanguageContext';

const ReportDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [expandedTypes, setExpandedTypes] = useState({});
  const [downloading, setDownloading] = useState(false);
  const [downloadingAnnotated, setDownloadingAnnotated] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    fetchReport();
  }, [id]);

  useEffect(() => {
    setExpandedTypes({});
  }, [report?._id]);

  const fetchReport = async () => {
    try {
      const response = await api.get(`/reports/${id}`);
      setReport(response.data);
    } catch (err) {
      setError(err.response?.data?.message || t('reportDetail.failedToLoad'));
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError('');
    try {
      const response = await api.get(`/reports/${id}/download`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      const sanitised = report.filename.replace(/\.pdf$/i, '');
      link.setAttribute('download', `QC_Report_${sanitised}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err.response?.data?.message || t('reportDetail.failedDownload'));
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadAnnotated = async () => {
    setDownloadingAnnotated(true);
    setDownloadError('');
    try {
      const response = await api.get(`/reports/${id}/download-annotated`, {
        responseType: 'blob',
      });
      
      if (response.data.type === 'application/json') {
        const text = await response.data.text();
        const json = JSON.parse(text);
        throw new Error(json.message || t('reportDetail.failedAnnotated'));
      }
      
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      const sanitised = report.filename.replace(/\.pdf$/i, '');
      link.setAttribute('download', `${sanitised}_ANNOTATED.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      let errorMessage = t('reportDetail.failedAnnotated');
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const json = JSON.parse(text);
          errorMessage = json.message || errorMessage;
        } catch {
          errorMessage = err.message || errorMessage;
        }
      } else if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.message) {
        errorMessage = err.message;
      }
      setDownloadError(errorMessage);
      console.error('Annotated PDF download error:', err);
    } finally {
      setDownloadingAnnotated(false);
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending: { color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300', icon: Clock, text: t('dashboard.pending') },
      processing: { color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300', icon: Loader2, text: t('dashboard.processing') },
      analyzed: { color: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300', icon: CheckCircle, text: t('dashboard.analyzed') },
      failed: { color: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300', icon: AlertCircle, text: t('dashboard.failed') },
    };

    const badge = badges[status] || badges.pending;
    const Icon = badge.icon;

    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${badge.color}`}>
        <Icon className={`w-4 h-4 mr-2 ${status === 'processing' ? 'animate-spin' : ''}`} />
        {badge.text}
      </span>
    );
  };

  const getErrorIcon = (type) => {
    const icons = {
      placeholder: Type,
      consistency: AlertTriangle,
      compliance: FileWarning,
      formatting: FileText,
      missing_data: Database,
    };
    return icons[type] || AlertCircle;
  };

  const getErrorColor = (type) => {
    const colors = {
      placeholder: 'bg-orange-50 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-800',
      consistency: 'bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800',
      compliance: 'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800',
      formatting: 'bg-purple-50 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800',
      missing_data: 'bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800',
    };
    return colors[type] || 'bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700';
  };

  const getSortedErrorsByType = (errors = []) => {
    const typeOrder = {
      placeholder: 0,
      consistency: 1,
      compliance: 2,
      formatting: 3,
      missing_data: 4,
    };

    return [...errors].sort((a, b) => {
      const orderA = typeOrder[a.type] ?? 99;
      const orderB = typeOrder[b.type] ?? 99;

      if (orderA !== orderB) {
        return orderA - orderB;
      }

      return (a.message || '').localeCompare(b.message || '');
    });
  };

  const getErrorTypeLabel = (type) => {
    const labels = {
      placeholder: t('reportDetail.placeholder'),
      consistency: t('reportDetail.consistency'),
      compliance: t('reportDetail.compliance'),
      formatting: t('reportDetail.formatting'),
      missing_data: t('reportDetail.missing_data'),
    };

    return labels[type] || type?.replace('_', ' ') || 'Other';
  };

  const getGroupedErrorsByType = (errors = []) => {
    const grouped = {};

    getSortedErrorsByType(errors).forEach((err) => {
      const key = err?.type || 'other';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(err);
    });

    return grouped;
  };

  const toggleType = (type) => {
    setExpandedTypes((prev) => ({
      ...prev,
      [type]: !prev[type],
    }));
  };

  const setAllTypesExpanded = (errors = [], expanded = false) => {
    const nextState = {};
    Object.keys(getGroupedErrorsByType(errors)).forEach((type) => {
      nextState[type] = expanded;
    });
    setExpandedTypes(nextState);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
        </div>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{t('reportDetail.errorLoadingReport')}</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700"
            >
              {t('reportDetail.backToDashboard')}
            </button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <Header />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <Link
          to="/dashboard"
          className="inline-flex items-center text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('reportDetail.backToDashboard')}
        </Link>

        {downloadError && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6 flex items-center justify-between">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 mr-3 flex-shrink-0" />
              <p className="text-red-700 dark:text-red-300 text-sm">{downloadError}</p>
            </div>
            <button
              onClick={() => setDownloadError('')}
              className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 ml-4 text-lg font-bold flex-shrink-0"
            >
              &times;
            </button>
          </div>
        )}

        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center">
              <FileText className="w-12 h-12 text-red-500 mr-4" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{report.filename}</h1>
                <p className="text-gray-500 dark:text-gray-400">{t('reportDetail.uploadedOn', { date: formatDate(report.createdAt) })}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {getStatusBadge(report.status)}
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {downloading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                {t('reportDetail.downloadReport')}
              </button>
              {report.status === 'analyzed' && report.errorCount > 0 && (
                <button
                  onClick={handleDownloadAnnotated}
                  disabled={downloadingAnnotated}
                  className="inline-flex items-center px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
                  title="Download PDF with error annotations"
                >
                  {downloadingAnnotated ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Highlighter className="w-4 h-4 mr-2" />
                  )}
                  {t('reportDetail.annotatedPdf')}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('reportDetail.statusLabel')}</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white capitalize">{report.status}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('reportDetail.errorsFound')}</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{report.errorCount || 0}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('reportDetail.pages')}</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{report.metadata?.pageCount || '-'}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('reportDetail.timeSaved')}</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{report.timeSaved || 0} {t('reportDetail.min')}</p>
            </div>
          </div>
        </div>

        {report.status === 'processing' && (
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-xl p-6 mb-6">
            <div className="flex items-center">
              <Loader2 className="w-6 h-6 text-blue-600 dark:text-blue-400 animate-spin mr-3" />
              <div>
                <h3 className="font-semibold text-blue-900 dark:text-blue-200">{t('reportDetail.analysisInProgress')}</h3>
                <p className="text-blue-700 dark:text-blue-300">{t('reportDetail.analysisDescription')}</p>
              </div>
            </div>
          </div>
        )}

        {report.status === 'analyzed' && (!report.errors || report.errors.length === 0) && (
          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-xl p-6 mb-6">
            <div className="flex items-center">
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400 mr-4" />
              <div>
                <h3 className="font-semibold text-green-900 dark:text-green-200">{t('reportDetail.noErrorsTitle')}</h3>
                <p className="text-green-700 dark:text-green-300">{t('reportDetail.noErrorsDescription')}</p>
              </div>
            </div>
          </div>
        )}

        {report.errorSummary && report.errorCount > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-6 my-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">{t('reportDetail.errorSummary')}</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center p-4 bg-orange-50 dark:bg-orange-900/30 rounded-lg">
                <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{report.errorSummary.placeholder || 0}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('reportDetail.placeholder')}</p>
              </div>
              <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{report.errorSummary.consistency || 0}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('reportDetail.consistency')}</p>
              </div>
              <div className="text-center p-4 bg-red-50 dark:bg-red-900/30 rounded-lg">
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{report.errorSummary.compliance || 0}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('reportDetail.compliance')}</p>
              </div>
              <div className="text-center p-4 bg-purple-50 dark:bg-purple-900/30 rounded-lg">
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{report.errorSummary.formatting || 0}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('reportDetail.formatting')}</p>
              </div>
              <div className="text-center p-4 bg-green-50 dark:bg-green-900/30 rounded-lg">
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{report.errorSummary.missing_data || 0}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('reportDetail.missing_data')}</p>
              </div>
            </div>
          </div>
        )}

        {report.status === 'analyzed' && report.errors && report.errors.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {t('reportDetail.errorsDetected', { count: report.errors.length })}
              </h2>
              <button
                type="button"
                onClick={() => {
                  const grouped = getGroupedErrorsByType(report.errors);
                  const hasCollapsed = Object.keys(grouped).some(
                    (type) => !(expandedTypes[type] ?? false)
                  );
                  setAllTypesExpanded(report.errors, hasCollapsed);
                }}
                className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
              >
                {Object.keys(getGroupedErrorsByType(report.errors)).some(
                  (type) => !(expandedTypes[type] ?? false)
                )
                  ? t('reportDetail.expandAll')
                  : t('reportDetail.collapseAll')}
              </button>
            </div>

            <div className="space-y-4">
              {Object.entries(getGroupedErrorsByType(report.errors)).map(([type, typeErrors]) => {
                const ErrorIcon = getErrorIcon(type);
                const isExpanded = expandedTypes[type] ?? false;
                const typeColorClass = getErrorColor(type);

                return (
                  <div key={type} className={`border rounded-lg overflow-hidden ${typeColorClass}`}>
                    <button
                      type="button"
                      onClick={() => toggleType(type)}
                      className={`w-full px-4 py-3 transition-colors flex items-center justify-between ${typeColorClass} hover:brightness-95`}
                    >
                      <div className="flex items-center gap-3">
                        <ErrorIcon className="w-4 h-4" />
                        <span className="text-sm font-semibold">{getErrorTypeLabel(type)}</span>
                        <span className="text-xs font-medium bg-white/80 dark:bg-black/30 px-2 py-0.5 rounded-full border border-white/70 dark:border-white/20">
                          {typeErrors.length}
                        </span>
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="p-4 space-y-3">
                        {typeErrors.map((err, index) => {
                          const ItemIcon = getErrorIcon(err.type);
                          return (
                            <div
                              key={err._id || `${type}-${index}`}
                              className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700"
                            >
                              <div className="flex items-start">
                                <ItemIcon className="w-5 h-5 mr-3 mt-0.5" />
                                <div className="flex-1">
                                  <p>{err.message}</p>
                                  {err.location?.section && (
                                    <p className="text-sm mt-2 opacity-75">
                                      {t('reportDetail.location')}: {err.location.section}
                                      {err.location.page && ` - ${t('reportDetail.page')} ${err.location.page}`}
                                    </p>
                                  )}
                                  {err.suggestion && (
                                    <p className="text-sm mt-2 italic">{err.suggestion}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default ReportDetail;
