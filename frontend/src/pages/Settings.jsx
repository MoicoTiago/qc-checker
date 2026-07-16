import { useState } from 'react';
import {
  Moon,
  Sun,
  Contrast,
  Type,
  Sparkles,
  User,
  Bell,
  Shield,
  Download,
  Trash2,
  Save,
  AlertTriangle,
  Check,
  Eye,
} from 'lucide-react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import api from '../services/api';

const Settings = () => {
  const { user, preferences, updatePreferences, updateUser, logout } = useAuth();
  const { t } = useLanguage();

  const [activeSection, setActiveSection] = useState('account');

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');

  const [theme, setTheme] = useState(preferences.theme || 'light');
  const [highContrast, setHighContrast] = useState(preferences.highContrast || false);
  const [fontSize, setFontSize] = useState(preferences.fontSize || 100);
  const [colorblindMode, setColorblindMode] = useState(preferences.colorblindMode || 'none');
  const [reducedMotion, setReducedMotion] = useState(preferences.reducedMotion || false);
  const [displaySaving, setDisplaySaving] = useState(false);
  const [displayMessage, setDisplayMessage] = useState('');

  const [notifications, setNotifications] = useState(preferences.notifications || {
    teamAssignment: true,
    teamRemoval: true,
    reportComplete: true,
    weeklySummary: false,
  });
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifMessage, setNotifMessage] = useState('');

  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');

  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const sections = [
    { id: 'account', label: t('settings.account'), icon: User },
    { id: 'display', label: t('settings.displayAccessibility'), icon: Sun },
    { id: 'notifications', label: t('settings.notifications'), icon: Bell },
    { id: 'data', label: t('settings.dataPrivacy'), icon: Shield },
  ];

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMessage('');
    setProfileError('');

    try {
      const response = await api.put('/auth/profile', { name, email });
      updateUser(response.data.user);
      setProfileMessage(t('settings.profileUpdated'));
    } catch (error) {
      setProfileError(error.response?.data?.message || t('settings.profileFailed'));
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSaveDisplay = async () => {
    setDisplaySaving(true);
    setDisplayMessage('');

    const newPrefs = { theme, highContrast, fontSize, colorblindMode, reducedMotion };
    await updatePreferences(newPrefs);

    setDisplayMessage(t('settings.displaySaved'));
    setDisplaySaving(false);
    setTimeout(() => setDisplayMessage(''), 3000);
  };

  const handleSaveNotifications = async () => {
    setNotifSaving(true);
    setNotifMessage('');

    await updatePreferences({ notifications });

    setNotifMessage(t('settings.notifSaved'));
    setNotifSaving(false);
    setTimeout(() => setNotifMessage(''), 3000);
  };

  const handleExportData = async () => {
    setExporting(true);
    setExportMessage('');

    try {
      const response = await api.get('/auth/export');
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `qc-checker-export-${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setExportMessage(t('settings.dataExported'));
    } catch (error) {
      setExportMessage(t('settings.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmEmail !== user?.email) {
      setDeleteError(t('settings.emailMismatch'));
      return;
    }

    setDeleting(true);
    setDeleteError('');

    try {
      await api.delete('/auth/account', { data: { confirmEmail: deleteConfirmEmail } });
      logout();
    } catch (error) {
      setDeleteError(error.response?.data?.message || t('settings.deleteFailed'));
      setDeleting(false);
    }
  };

  const toggleClasses = (enabled) =>
    `relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
      enabled ? 'bg-indigo-600' : 'bg-gray-300'
    }`;

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <Header />

      <main className="flex-1 max-w-5xl mx-auto px-4 py-8 w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('settings.title')}</h1>
          <p className="text-gray-600 dark:text-gray-300 mt-1">
            {t('settings.subtitle')}
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-6">
          {/* Sidebar */}
          <div className="w-full md:w-56 flex-shrink-0">
            <nav className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-2 space-y-1">
              {sections.map((section) => {
                const Icon = section.icon;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left text-sm font-medium transition ${
                      activeSection === section.id
                        ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
                        : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {section.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1">
            {/* Account Section */}
            {activeSection === 'account' && (
              <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
                  {t('settings.accountInfo')}
                </h2>

                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('settings.displayName')}
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('settings.emailAddress')}
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">{t('settings.roleLabel')}</span>
                        <span className="ml-2 text-gray-900 dark:text-white capitalize">
                          {user?.role?.replace('_', ' ')}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">{t('settings.statusLabel')}</span>
                        <span className="ml-2 text-gray-900 dark:text-white capitalize">
                          {user?.status}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">{t('settings.memberSince')}</span>
                        <span className="ml-2 text-gray-900 dark:text-white">
                          {formatDate(user?.createdAt)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">{t('settings.lastLogin')}</span>
                        <span className="ml-2 text-gray-900 dark:text-white">
                          {formatDate(user?.lastLogin)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {profileMessage && (
                    <p className="text-sm text-green-600 flex items-center gap-2">
                      <Check className="w-4 h-4" /> {profileMessage}
                    </p>
                  )}
                  {profileError && (
                    <p className="text-sm text-red-600">{profileError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={profileSaving}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {profileSaving ? t('settings.saving') : t('settings.saveChanges')}
                  </button>
                </form>
              </div>
            )}

            {/* Display & Accessibility Section */}
            {activeSection === 'display' && (
              <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-6 space-y-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('settings.displayAccessibility')}
                </h2>

                {/* Theme */}
                <div className="flex items-start justify-between gap-4 pb-6 border-b border-gray-200 dark:border-gray-700">
                  <div>
                    <div className="flex items-center gap-2">
                      <Moon className="w-5 h-5 text-indigo-600" />
                      <h3 className="font-medium text-gray-900 dark:text-white">{t('settings.theme')}</h3>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {t('settings.themeDescription')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setTheme('light')}
                      className={`px-4 py-2 rounded-lg border text-sm font-medium ${
                        theme === 'light'
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600'
                      }`}
                    >
                      <Sun className="w-4 h-4 inline mr-1" /> {t('settings.light')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme('dark')}
                      className={`px-4 py-2 rounded-lg border text-sm font-medium ${
                        theme === 'dark'
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600'
                      }`}
                    >
                      <Moon className="w-4 h-4 inline mr-1" /> {t('settings.dark')}
                    </button>
                  </div>
                </div>

                {/* High Contrast */}
                <div className="flex items-start justify-between gap-4 pb-6 border-b border-gray-200 dark:border-gray-700">
                  <div>
                    <div className="flex items-center gap-2">
                      <Contrast className="w-5 h-5 text-indigo-600" />
                      <h3 className="font-medium text-gray-900 dark:text-white">{t('settings.highContrast')}</h3>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {t('settings.highContrastDescription')}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={highContrast}
                    onClick={() => setHighContrast(!highContrast)}
                    className={toggleClasses(highContrast)}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${highContrast ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                {/* Colorblind Mode */}
                <div className="pb-6 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2 mb-2">
                    <Eye className="w-5 h-5 text-indigo-600" />
                    <h3 className="font-medium text-gray-900 dark:text-white">{t('settings.colorblindFilter')}</h3>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    {t('settings.colorblindDescription')}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { value: 'none', label: t('settings.none'), desc: t('settings.defaultColors') },
                      { value: 'protanopia', label: t('settings.protanopia'), desc: t('settings.redBlind') },
                      { value: 'deuteranopia', label: t('settings.deuteranopia'), desc: t('settings.greenBlind') },
                      { value: 'tritanopia', label: t('settings.tritanopia'), desc: t('settings.blueBlind') },
                      { value: 'achromatopsia', label: t('settings.grayscale'), desc: t('settings.monochrome') },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setColorblindMode(option.value)}
                        className={`p-3 rounded-lg border text-left transition ${
                          colorblindMode === option.value
                            ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                        }`}
                      >
                        <div className={`text-sm font-medium ${
                          colorblindMode === option.value
                            ? 'text-indigo-700 dark:text-indigo-400'
                            : 'text-gray-900 dark:text-white'
                        }`}>
                          {option.label}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {option.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font Size */}
                <div className="pb-6 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Type className="w-5 h-5 text-indigo-600" />
                        <h3 className="font-medium text-gray-900 dark:text-white">{t('settings.fontSize')}</h3>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {t('settings.fontSizeDescription')}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-semibold text-indigo-600">{fontSize}%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-500 dark:text-gray-400 w-8">80%</span>
                    <input
                      type="range"
                      min="80"
                      max="150"
                      step="5"
                      value={fontSize}
                      onChange={(e) => setFontSize(Number(e.target.value))}
                      className="font-size-slider flex-1 h-2 cursor-pointer"
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400 w-8">150%</span>
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-gray-400 dark:text-gray-500">
                    <span>{t('settings.smaller')}</span>
                    <button
                      type="button"
                      onClick={() => setFontSize(100)}
                      className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                    >
                      {t('settings.resetDefault')}
                    </button>
                    <span>{t('settings.larger')}</span>
                  </div>
                </div>

                {/* Reduced Motion */}
                <div className="flex items-start justify-between gap-4 pb-6 border-b border-gray-200 dark:border-gray-700">
                  <div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-indigo-600" />
                      <h3 className="font-medium text-gray-900 dark:text-white">{t('settings.reducedMotion')}</h3>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {t('settings.reducedMotionDescription')}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={reducedMotion}
                    onClick={() => setReducedMotion(!reducedMotion)}
                    className={toggleClasses(reducedMotion)}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${reducedMotion ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                {displayMessage && (
                  <p className="text-sm text-green-600 flex items-center gap-2">
                    <Check className="w-4 h-4" /> {displayMessage}
                  </p>
                )}

                <button
                  onClick={handleSaveDisplay}
                  disabled={displaySaving}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {displaySaving ? t('settings.savingDisplay') : t('settings.saveDisplaySettings')}
                </button>
              </div>
            )}

            {/* Notifications Section */}
            {activeSection === 'notifications' && (
              <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-6 space-y-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('settings.emailNotifications')}
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t('settings.emailNotificationsDescription')}
                </p>

                <div className="space-y-4">
                  {[
                    { key: 'teamAssignment', label: t('settings.teamAssignment'), desc: t('settings.teamAssignmentDesc') },
                    { key: 'teamRemoval', label: t('settings.teamRemoval'), desc: t('settings.teamRemovalDesc') },
                    { key: 'reportComplete', label: t('settings.reportComplete'), desc: t('settings.reportCompleteDesc') },
                    { key: 'weeklySummary', label: t('settings.weeklySummary'), desc: t('settings.weeklySummaryDesc') },
                  ].map((item) => (
                    <div key={item.key} className="flex items-start justify-between gap-4 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-white">{item.label}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{item.desc}</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={notifications[item.key]}
                        onClick={() => setNotifications({ ...notifications, [item.key]: !notifications[item.key] })}
                        className={toggleClasses(notifications[item.key])}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${notifications[item.key] ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  ))}
                </div>

                {notifMessage && (
                  <p className="text-sm text-green-600 flex items-center gap-2">
                    <Check className="w-4 h-4" /> {notifMessage}
                  </p>
                )}

                <button
                  onClick={handleSaveNotifications}
                  disabled={notifSaving}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {notifSaving ? t('settings.saving') : t('settings.saveNotifPrefs')}
                </button>
              </div>
            )}

            {/* Data & Privacy Section */}
            {activeSection === 'data' && (
              <div className="space-y-6">
                {/* Export Data */}
                <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-6">
                  <div className="flex items-start gap-4">
                    <Download className="w-6 h-6 text-indigo-600 mt-1" />
                    <div className="flex-1">
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {t('settings.exportData')}
                      </h2>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {t('settings.exportDescription')}
                      </p>

                      {exportMessage && (
                        <p className="text-sm text-green-600 mt-3 flex items-center gap-2">
                          <Check className="w-4 h-4" /> {exportMessage}
                        </p>
                      )}

                      <button
                        onClick={handleExportData}
                        disabled={exporting}
                        className="mt-4 flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                      >
                        <Download className="w-4 h-4" />
                        {exporting ? t('settings.exporting') : t('settings.exportButton')}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Delete Account */}
                <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-6 border border-red-200 dark:border-red-900/50">
                  <div className="flex items-start gap-4">
                    <Trash2 className="w-6 h-6 text-red-600 mt-1" />
                    <div className="flex-1">
                      <h2 className="text-lg font-semibold text-red-600">
                        {t('settings.deleteAccount')}
                      </h2>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {t('settings.deleteDescription')}
                      </p>

                      {!showDeleteConfirm ? (
                        <button
                          onClick={() => setShowDeleteConfirm(true)}
                          className="mt-4 flex items-center gap-2 border border-red-300 text-red-600 px-4 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="w-4 h-4" />
                          {t('settings.deleteMyAccount')}
                        </button>
                      ) : (
                        <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                          <div className="flex items-center gap-2 text-red-700 dark:text-red-400 mb-3">
                            <AlertTriangle className="w-5 h-5" />
                            <span className="font-medium">{t('settings.irreversible')}</span>
                          </div>
                          <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                            {t('settings.typeEmail', { email: user?.email })}
                          </p>
                          <input
                            type="email"
                            value={deleteConfirmEmail}
                            onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                            placeholder={t('settings.enterEmail')}
                            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white mb-3"
                          />

                          {deleteError && (
                            <p className="text-sm text-red-600 mb-3">{deleteError}</p>
                          )}

                          <div className="flex gap-3">
                            <button
                              onClick={() => {
                                setShowDeleteConfirm(false);
                                setDeleteConfirmEmail('');
                                setDeleteError('');
                              }}
                              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                              {t('settings.cancel')}
                            </button>
                            <button
                              onClick={handleDeleteAccount}
                              disabled={deleting || deleteConfirmEmail !== user?.email}
                              className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50"
                            >
                              <Trash2 className="w-4 h-4" />
                              {deleting ? t('settings.deleting') : t('settings.permanentlyDelete')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Settings;
