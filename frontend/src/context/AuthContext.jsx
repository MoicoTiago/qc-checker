import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

const defaultPreferences = {
  theme: 'light',
  highContrast: false,
  fontSize: 100,
  colorblindMode: 'none',
  reducedMotion: false,
  notifications: {
    teamAssignment: true,
    teamRemoval: true,
    reportComplete: true,
    weeklySummary: false,
  },
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState(() => {
    const saved = localStorage.getItem('preferences');
    return saved ? JSON.parse(saved) : defaultPreferences;
  });

  const applyAccessibilitySettings = (prefs) => {
    const root = document.documentElement;

    if (prefs.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    if (prefs.highContrast) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }

    const size = prefs.fontSize || 100;
    root.style.setProperty('--font-scale', size / 100);

    root.classList.remove('colorblind-protanopia', 'colorblind-deuteranopia', 'colorblind-tritanopia', 'colorblind-achromatopsia');
    if (prefs.colorblindMode && prefs.colorblindMode !== 'none') {
      root.classList.add(`colorblind-${prefs.colorblindMode}`);
    }

    if (prefs.reducedMotion) {
      root.classList.add('reduced-motion');
    } else {
      root.classList.remove('reduced-motion');
    }
  };

  useEffect(() => {
    applyAccessibilitySettings(preferences);
    localStorage.setItem('preferences', JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        try {
          const response = await api.get('/auth/me');
          setUser(response.data);

          try {
            const prefsResponse = await api.get('/auth/preferences');
            if (prefsResponse.data && Object.keys(prefsResponse.data).length > 0) {
              const serverPrefs = { ...defaultPreferences, ...prefsResponse.data };
              setPreferences(serverPrefs);
            }
          } catch (prefsError) {
            console.log('Using local preferences');
          }
        } catch (error) {
          console.error('Auth initialization error:', error);
          localStorage.removeItem('token');
          setToken(null);
          setUser(null);
        }
      }
      setLoading(false);
    };

    initAuth();
  }, [token]);

  const login = async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    const { token: newToken, preferences: userPrefs, ...userData } = response.data;

    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(userData);

    if (userPrefs && Object.keys(userPrefs).length > 0) {
      setPreferences({ ...defaultPreferences, ...userPrefs });
    }

    return userData;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  const changePassword = async (currentPassword, newPassword) => {
    await api.put('/auth/change-password', { currentPassword, newPassword });
    setUser({ ...user, mustChangePassword: false });
  };

  const updateUser = (updatedData) => {
    setUser({ ...user, ...updatedData });
  };

  const updatePreferences = async (newPrefs) => {
    const merged = { ...preferences, ...newPrefs };
    setPreferences(merged);

    if (token) {
      try {
        await api.put('/auth/preferences', newPrefs);
      } catch (error) {
        console.error('Failed to save preferences to server:', error);
      }
    }
  };

  const value = {
    user,
    token,
    loading,
    login,
    logout,
    changePassword,
    updateUser,
    preferences,
    updatePreferences,
    isAuthenticated: !!token && !!user,
    isAdmin: user?.role === 'admin',
    isTeamLeader: user?.role === 'team_leader',
    isUser: user?.role === 'user',
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
