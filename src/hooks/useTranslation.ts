import { useState, useEffect, useCallback } from 'react';
import { getLanguage, setLanguage, t, type LangCode } from '@/lib/i18n';

export function useTranslation() {
  const [lang, setLang] = useState<LangCode>(getLanguage());

  const changeLang = useCallback((newLang: LangCode) => {
    setLanguage(newLang);
    setLang(newLang);
    window.dispatchEvent(new Event('gaga-language-changed'));
  }, []);

  useEffect(() => {
    const handler = () => setLang(getLanguage());
    window.addEventListener('gaga-language-changed', handler);
    return () => window.removeEventListener('gaga-language-changed', handler);
  }, []);

  return { lang, t, setLang: changeLang };
}
