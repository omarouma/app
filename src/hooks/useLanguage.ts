
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur'];

export function useLanguage() {
  const { i18n } = useTranslation();
  const [language, setLanguage] = useState(i18n.language);

  useEffect(() => {
    const detectedLanguage = navigator.language.split('-')[0];
    if (i18n.languages.includes(detectedLanguage) && i18n.language !== detectedLanguage) {
      i18n.changeLanguage(detectedLanguage);
    }
    // Track language changes via the i18n event instead of syncing in the effect body
    const handler = (lng: string) => setLanguage(lng);
    i18n.on('languageChanged', handler);
    return () => {
      i18n.off('languageChanged', handler);
    };
  }, [i18n]);

  useEffect(() => {
    if (RTL_LANGUAGES.includes(i18n.language)) {
      document.documentElement.dir = 'rtl';
    } else {
      document.documentElement.dir = 'ltr';
    }
  }, [i18n.language]);

  return language;
}