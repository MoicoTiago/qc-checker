import { useState, useEffect, useRef } from 'react';
import { Upload, FileText, Trash2, Clock, AlertCircle, CheckCircle, Loader2, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import api from '../services/api';
import { useLanguage } from '../context/LanguageContext';

const REPORT_REFRESH_INTERVAL_MS = 4000;

const Dashboard = () => {
  const fileInputRef = useRef(null);
  
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { t } = useLanguage();

  const MAX_PDF_SIZE_MB = 120;
  const MAX_PDF_SIZE_BYTES = MAX_PDF_SIZE_MB * 1024 * 1024;

  useEffect(() => {
    fetchReports();
  }, []);

  useEffect(() => {
    if (!reports.some((report) => ['pending', 'processing'].includes(report.status))) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      fetchReports({ silent: true });
    }, REPORT_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [reports]);

  const fetchReports = async ({ silent = false } = {}) => {
    try {
      const response = await api.get('/reports');
      setReports(response.data);
    } catch (err) {
      console.error('Error fetching reports:', err);
    } finally {
      if (!silent) {
        setLoading(false);
      }
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
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = async (file) => {
    setError('');
    setSuccess('');

    if (file.type !== 'application/pdf') {
      setError(t('dashboard.uploadPdf'));
      return;
    }

    if (file.size > MAX_PDF_SIZE_BYTES) {
      setError(t('dashboard.fileTooLarge', { size: MAX_PDF_SIZE_MB }));
      return;
    }


    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('pdf', file);

    try {
      const response = await api.post('/reports', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(progress);
        },
      });

      setSuccess(t('dashboard.uploadSuccess', { name: file.name }));
      setReports((currentReports) => [response.data, ...currentReports]);
      fetchReports({ silent: true });
    } catch (err) {
      setError(err.response?.data?.message || t('dashboard.uploadFailed'));
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDownload = async (reportId, filename) => {
    try {
      const response = await api.get(`/reports/${reportId}/download`, {
        responseType: 'blob',
      });
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
      setError(err.response?.data?.message || t('dashboard.downloadFailed'));
    }
  };

  const handleDelete = async (reportId) => {
    if (!window.confirm(t('dashboard.deleteConfirm'))) {
      return;
    }

    try {
      await api.delete(`/reports/${reportId}`);
      setReports(reports.filter((r) => r._id !== reportId));
      setSuccess(t('dashboard.deleteSuccess'));
    } catch (err) {
      setError(err.response?.data?.message || t('dashboard.deleteFailed'));
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending: { color: 'bg-yellow-100 text-yellow-800', icon: Clock, text: t('dashboard.pending') },
      processing: { color: 'bg-blue-100 text-blue-800', icon: Loader2, text: t('dashboard.processing') },
      analyzed: { color: 'bg-green-100 text-green-800', icon: CheckCircle, text: t('dashboard.analyzed') },
      failed: { color: 'bg-red-100 text-red-800', icon: AlertCircle, text: t('dashboard.failed') },
    };
    
    const badge = badges[status] || badges.pending;
    const Icon = badge.icon;
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
        <Icon className={`w-3 h-3 mr-1 ${status === 'processing' ? 'animate-spin' : ''}`} />
        {badge.text}
      </span>
    );
  };

  const getQualityBadge = (report) => {
    if (report.status !== 'analyzed') {
      return <span className="text-sm text-gray-400">{t('dashboard.pending')}</span>;
    }

    const label = report.qualityAssessment?.label;
    const badges = {
      good: { text: t('dashboard.passed'), color: 'bg-green-100 text-green-800' },
      bad: { text: t('dashboard.failed'), color: 'bg-red-100 text-red-800' },
      uncertain: { text: t('dashboard.uncertain'), color: 'bg-amber-100 text-amber-800' },
    };

    const badge = badges[label] || { text: t('dashboard.uncertain'), color: 'bg-gray-100 text-gray-700' };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
        {badge.text}
      </span>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <Header />
      
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('dashboard.title')}</h1>
          <p className="text-gray-600 dark:text-gray-300">{t('dashboard.subtitle')}</p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center">
            <AlertCircle className="w-5 h-5 mr-2" />
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg flex items-center">
            <CheckCircle className="w-5 h-5 mr-2" />
            {success}
          </div>
        )}

        <div
          className={`bg-white dark:bg-gray-900 rounded-xl shadow-sm border-2 border-dashed p-12 transition-colors ${
            dragActive
              ? 'border-indigo-500 bg-indigo-50'
              : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <div className="flex flex-col items-center justify-center text-center">
            {uploading ? (
              <>
                <Loader2 className="w-12 h-12 text-indigo-600 mb-4 animate-spin" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  {t('dashboard.uploading')}
                </h3>
                <div className="w-64 bg-gray-200 rounded-full h-2.5 mb-2">
                  <div
                    className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{uploadProgress}%</p>
              </>
            ) : (
              <>
                <Upload className={`w-12 h-12 mb-4 ${dragActive ? 'text-indigo-600' : 'text-gray-400'}`} />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100mb-2">
                  {dragActive ? t('dashboard.dropHere') : t('dashboard.uploadReport')}
                </h3>
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                  {t('dashboard.dragDrop')}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileInput}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors font-semibold cursor-pointer"
                >
                  {t('dashboard.chooseFile')}
                </label>
                <p className="text-xs text-gray-400 mt-4">
                  {t('dashboard.pdfOnly')}
                </p>
              </>
            )}
          </div>
        </div>

        <div className="mt-8 ">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('dashboard.yourReports')}</h2>
          
          {loading ? (
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-8 text-center">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-2" />
              <p className="text-gray-500 dark:text-gray-400">{t('dashboard.loadingReports')}</p>
            </div>
          ) : reports.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-8 text-center">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">{t('dashboard.noReports')}</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t('dashboard.report')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t('dashboard.status')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t('dashboard.errors')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t('dashboard.result')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t('dashboard.date')}
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t('dashboard.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200">
                  {reports.map((report) => (
                    <tr key={report._id} className="bg-white dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <FileText className="w-8 h-8 text-red-500 mr-3" />
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {report.filename}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {formatFileSize(report.fileSize)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(report.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {report.status === 'analyzed' ? (
                          <span className={`text-sm font-medium ${report.errorCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {report.errorCount} {report.errorCount === 1 ? t('dashboard.error') : t('dashboard.errorsPlural')}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getQualityBadge(report)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(report.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <Link
                          to={`/report/${report._id}`}
                          className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 mr-4"
                        >
                          {t('dashboard.view')}
                        </Link>
                        <button
                          onClick={() => handleDownload(report._id, report.filename)}
                          className="text-gray-600 hover:text-gray-900 dark:text-gray-100 mr-4"
                          title="Download Report"
                        >
                          <Download className="w-4 h-4 inline" />
                        </button>
                        <button
                          onClick={() => handleDelete(report._id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 className="w-4 h-4 inline" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Dashboard;
