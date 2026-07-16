/**
 * @file LanguageContext.jsx
 *
 * React context providing app-wide internationalisation (English / Welsh).
 * Exposes `language` (current locale code: "en" | "cy"),
 * `toggleLanguage()` to switch between locales, and `t(key, replacements)`
 * for looking up translated strings with optional `{{placeholder}}`
 * interpolation. Language preference is persisted in localStorage.
 */
import { createContext, useContext, useState, useCallback } from 'react';
import en from '../translations/en';
import cy from '../translations/cy';

const translations = { en, cy };

const LanguageContext = createContext(null);

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState(() => {
    return localStorage.getItem('language') || 'en';
  });

  const toggleLanguage = useCallback(() => {
    setLanguage((prev) => {
      const next = prev === 'en' ? 'cy' : 'en';
      localStorage.setItem('language', next);
      return next;
    });
  }, []);

  const t = useCallback(
    (key, replacements) => {
      const keys = key.split('.');
      let value = translations[language];
      for (const k of keys) {
        if (value == null) break;
        value = value[k];
      }
      if (value == null) {
        let fallback = translations.en;
        for (const k of keys) {
          if (fallback == null) break;
          fallback = fallback[k];
        }
        value = fallback ?? key;
      }
      if (typeof value === 'string' && replacements) {
        return Object.entries(replacements).reduce(
          (str, [k, v]) => str.replace(new RegExp(`{{${k}}}`, 'g'), v),
          value
        );
      }
      return value;
    },
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export default LanguageContext;
