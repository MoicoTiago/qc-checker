import { Link } from 'react-router-dom';
import { FileCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

const Header = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const { t, language, toggleLanguage } = useLanguage();

  return (
    <header className="bg-white dark:bg-gray-900 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-4 sm:h-16 sm:py-0">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title={t('lang.toggle')}
            >
              <span className="leading-none">{language === 'en' ? '🏴󠁧󠁢󠁷󠁬󠁳󠁿' : '🏴󠁧󠁢󠁥󠁮󠁧󠁿'}</span>
              <span>{t('lang.toggle')}</span>
            </button>
            <Link to="/dashboard" className="flex items-center space-x-2">
              <FileCheck className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
              <span className="text-xl font-bold text-gray-900 dark:text-white">{t('header.brand')}</span>
            </Link>
          </div>

          <nav className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
            {isAuthenticated ? (
              <>
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  {t('header.welcome', { name: user?.name })}
                </span>
                <Link
                  to="/how-it-works"
                  className="text-sm text-gray-600 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:text-gray-300 dark:hover:text-white dark:focus-visible:ring-offset-gray-900"
                >
                  {t('header.howItWorks')}
                </Link>
                {user?.team && (
                  <Link
                    to="/team"
                    className="text-sm text-gray-600 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:text-gray-300 dark:hover:text-white dark:focus-visible:ring-offset-gray-900"
                  >
                    {t('header.myTeam')}
                  </Link>
                )}
                {user?.role === 'admin' && (
                  <Link
                    to="/admin"
                    className="text-sm text-gray-600 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:text-gray-300 dark:hover:text-white dark:focus-visible:ring-offset-gray-900"
                  >
                    {t('header.dashboard')}
                  </Link>
                )}

                <Link
                  to="/profile"
                  className="text-sm text-gray-600 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:text-gray-300 dark:hover:text-white dark:focus-visible:ring-offset-gray-900"
                >
                  {t('header.profile')}
                </Link>

                <Link 
                  to="/settings" 
                  className="text-sm text-gray-600 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:text-gray-300 dark:hover:text-white dark:focus-visible:ring-offset-gray-900"
                >
                  {t('header.settings')}
                </Link>

                <button
                  onClick={logout}
                  className="text-sm text-gray-600 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:text-gray-300 dark:hover:text-white dark:focus-visible:ring-offset-gray-900"
                >
                  {t('header.logout')}
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/how-it-works"
                  className="text-sm text-gray-600 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:text-gray-300 dark:hover:text-white dark:focus-visible:ring-offset-gray-900"
                >
                  {t('header.howItWorks')}
                </Link>
                <Link
                  to="/login"
                  className="text-sm text-gray-600 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:text-gray-300 dark:hover:text-white dark:focus-visible:ring-offset-gray-900"
                >
                  {t('header.userLogin')}
                </Link>
                <Link
                  to="/login?admin=true"
                  className="text-sm text-gray-600 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:text-gray-300 dark:hover:text-white dark:focus-visible:ring-offset-gray-900"
                >
                  {t('header.adminLogin')}
                </Link>
              </>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;
