import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import Header from '../components/Header';
import Footer from '../components/Footer';
import getDefaultRouteByRole from '../utils/getDefaultRouteByRole';

const Login = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login, isAuthenticated, user } = useAuth();
  const { t } = useLanguage();
  
  const [isAdmin, setIsAdmin] = useState(searchParams.get('admin') === 'true');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setIsAdmin(searchParams.get('admin') === 'true');
  }, [searchParams]);

  if (isAuthenticated && !user?.mustChangePassword) {
    const redirectPath = getDefaultRouteByRole(user?.role);
    return <Navigate to={redirectPath} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const userData = await login(email, password);
      
      if (userData.mustChangePassword) {
        navigate('/change-password');
      } else {
        navigate(getDefaultRouteByRole(userData.role));
      }
    } catch (err) {
      setError(err.response?.data?.message || t('login.invalidCredentials'));
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
            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center">
              <Building2 className="w-8 h-8 text-indigo-600" />
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">
            {isAdmin ? t('login.adminTitle') : t('login.userTitle')}
          </h2>
          <p className="text-center text-gray-600 mb-6">
            {isAdmin 
              ? t('login.adminSubtitle')
              : t('login.userSubtitle')}
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('login.emailLabel')}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                placeholder={isAdmin ? t('login.adminEmailPlaceholder') : t('login.emailPlaceholder')}
                required
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('login.passwordLabel')}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                placeholder={t('login.passwordPlaceholder')}
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t('login.signingIn') : t('login.signIn')}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => setIsAdmin(!isAdmin)}
              className="text-sm text-indigo-600 hover:text-indigo-700"
            >
              {isAdmin ? t('login.switchToUser') : t('login.switchToAdmin')}
            </button>
          </div>

          <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-600">
            <p className="font-semibold mb-1">{t('login.defaultCredentials')}</p>
            <p>{t('login.defaultEmail')}</p>
            <p>{t('login.defaultPassword')}</p>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Login;
