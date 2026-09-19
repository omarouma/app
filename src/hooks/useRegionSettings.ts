import { useEffect } from 'react';
import { useUserSettings } from '@/store/useSettingsStore';
import { setActiveRegionSettings, getLocale, resolveRegion } from '@/lib/regionUtils';
import { setLanguage, type LangCode } from '@/lib/i18n';

/**
 * Keeps the pure region-formatting bridge (`regionUtils`) in sync with the
 * persisted settings store, and applies the resolved locale + text direction to
 * the document root so the whole app (including native WebView) reflects the
 * user's language and region choices.
 *
 * Mount this once near the app root.
 */
export function useRegionSettingsSync(): void {
  const settings = useUserSettings((s) => s.settings);

  useEffect(() => {
    const { region, language, timeFormat, dateFormat, firstDayOfWeek, numberFormat, showTimezone } = settings;

    // 1. Push the snapshot into the pure formatting bridge.
    setActiveRegionSettings({
      region,
      language,
      timeFormat,
      dateFormat,
      firstDayOfWeek,
      numberFormat,
      showTimezone,
    });

    // 2. Make sure the i18n layer agrees with the persisted language.
    setLanguage(language as LangCode);

    // 3. Apply locale + direction to <html>.
    if (typeof document !== 'undefined') {
      const locale = getLocale({ region, language });
      document.documentElement.lang = locale || language || 'en';
      document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
      document.documentElement.dataset.region = resolveRegion({ region, language }).code;
    }
  }, [settings]);
}
