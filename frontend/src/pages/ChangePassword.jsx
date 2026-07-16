import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import Header from '../components/Header';
import Footer from '../components/Footer';
import getDefaultRouteByRole from '../utils/getDefaultRouteByRole';

const ChangePassword = () => {
  const navigate = useNavigate();
  const { user, changePassword, isAuthenticated } = useAuth();
  const { t } = useLanguage();
  
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!user?.mustChangePassword) {
    const redirectPath = getDefaultRouteByRole(user?.role);
    return <Navigate to={redirectPath} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError(t('changePassword.tooShort'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('changePassword.mismatch'));
      return;
    }

    setLoading(true);

    try {
      await changePassword(null, newPassword);
      navigate(getDefaultRouteByRole(user?.role));
    } catch (err) {
      setError(err.response?.data?.message || t('changePassword.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />
      
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
          <div className="flex items-center justify-center mb-6">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center">
              <KeyRound className="w-8 h-8 text-amber-600" />
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">
            {t('changePassword.title')}
          </h2>
          <p className="text-center text-gray-600 mb-6">
            {t('changePassword.subtitle')}
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('changePassword.newPassword')}
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                placeholder={t('changePassword.newPasswordPlaceholder')}
                required
                disabled={loading}
                minLength={6}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('changePassword.confirmPassword')}
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                placeholder={t('changePassword.confirmPasswordPlaceholder')}
                required
                disabled={loading}
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t('changePassword.settingPassword') : t('changePassword.setPassword')}
            </button>
          </form>

          <div className="mt-4 p-3 bg-amber-50 rounded-lg text-xs text-amber-700">
            <p className="font-semibold mb-1">{t('changePassword.requirements')}</p>
            <p>• {t('changePassword.minLength')}</p>
            <p>• {t('changePassword.strongPassword')}</p>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default ChangePassword;
