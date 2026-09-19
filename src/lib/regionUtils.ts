// ─────────────────────────────────────────────────────────────────────────────
// Region & locale utilities for GaGa Chat
//
// Centralises everything related to regional formatting so that dates, times
// and numbers are rendered consistently across the whole app and respect the
// user's chosen language + region instead of the browser default.
// ─────────────────────────────────────────────────────────────────────────────
import type { ThemeSettings } from '@/types';
import type { LangCode } from '@/lib/i18n';

export interface RegionOption {
  /** ISO 3166-1 alpha-2 country code, or 'auto'. */
  code: string;
  /** English display name. */
  label: string;
  /** Flag emoji for quick visual scanning. */
  flag: string;
  /** BCP-47 locale used for Intl formatting. */
  locale: string;
  /** Region default clock. */
  timeFormat: '12h' | '24h';
  /** Region default date ordering. */
  dateFormat: 'MDY' | 'DMY' | 'YMD';
  /** Region default first day of week (0 = Sunday, 1 = Monday, 6 = Saturday). */
  firstDayOfWeek: 0 | 1 | 6;
  /** Region default number grouping. */
  numberFormat: 'western' | 'indian';
}

/**
 * Curated list of regions covering GaGa Chat's primary markets plus the major
 * global locales. Kept intentionally small so the picker stays usable.
 */
export const REGIONS: RegionOption[] = [
  { code: 'auto', label: 'Automatic (device)', flag: '🌐', locale: '', timeFormat: '12h', dateFormat: 'MDY', firstDayOfWeek: 0, numberFormat: 'western' },
  { code: 'US', label: 'United States', flag: '🇺🇸', locale: 'en-US', timeFormat: '12h', dateFormat: 'MDY', firstDayOfWeek: 0, numberFormat: 'western' },
  { code: 'GB', label: 'United Kingdom', flag: '🇬🇧', locale: 'en-GB', timeFormat: '24h', dateFormat: 'DMY', firstDayOfWeek: 1, numberFormat: 'western' },
  { code: 'BD', label: 'Bangladesh', flag: '🇧🇩', locale: 'bn-BD', timeFormat: '12h', dateFormat: 'DMY', firstDayOfWeek: 0, numberFormat: 'indian' },
  { code: 'IN', label: 'India', flag: '🇮🇳', locale: 'en-IN', timeFormat: '12h', dateFormat: 'DMY', firstDayOfWeek: 0, numberFormat: 'indian' },
  { code: 'PK', label: 'Pakistan', flag: '🇵🇰', locale: 'en-PK', timeFormat: '12h', dateFormat: 'DMY', firstDayOfWeek: 0, numberFormat: 'indian' },
  { code: 'AE', label: 'United Arab Emirates', flag: '🇦🇪', locale: 'ar-AE', timeFormat: '12h', dateFormat: 'DMY', firstDayOfWeek: 6, numberFormat: 'western' },
  { code: 'SA', label: 'Saudi Arabia', flag: '🇸🇦', locale: 'ar-SA', timeFormat: '12h', dateFormat: 'DMY', firstDayOfWeek: 0, numberFormat: 'western' },
  { code: 'ES', label: 'Spain', flag: '🇪🇸', locale: 'es-ES', timeFormat: '24h', dateFormat: 'DMY', firstDayOfWeek: 1, numberFormat: 'western' },
  { code: 'MX', label: 'Mexico', flag: '🇲🇽', locale: 'es-MX', timeFormat: '12h', dateFormat: 'DMY', firstDayOfWeek: 0, numberFormat: 'western' },
  { code: 'FR', label: 'France', flag: '🇫🇷', locale: 'fr-FR', timeFormat: '24h', dateFormat: 'DMY', firstDayOfWeek: 1, numberFormat: 'western' },
  { code: 'DE', label: 'Germany', flag: '🇩🇪', locale: 'de-DE', timeFormat: '24h', dateFormat: 'DMY', firstDayOfWeek: 1, numberFormat: 'western' },
  { code: 'IT', label: 'Italy', flag: '🇮🇹', locale: 'it-IT', timeFormat: '24h', dateFormat: 'DMY', firstDayOfWeek: 1, numberFormat: 'western' },
  { code: 'BR', label: 'Brazil', flag: '🇧🇷', locale: 'pt-BR', timeFormat: '24h', dateFormat: 'DMY', firstDayOfWeek: 0, numberFormat: 'western' },
  { code: 'CN', label: 'China', flag: '🇨🇳', locale: 'zh-CN', timeFormat: '24h', dateFormat: 'YMD', firstDayOfWeek: 1, numberFormat: 'western' },
  { code: 'JP', label: 'Japan', flag: '🇯🇵', locale: 'ja-JP', timeFormat: '24h', dateFormat: 'YMD', firstDayOfWeek: 0, numberFormat: 'western' },
  { code: 'KR', label: 'South Korea', flag: '🇰🇷', locale: 'ko-KR', timeFormat: '12h', dateFormat: 'YMD', firstDayOfWeek: 0, numberFormat: 'western' },
  { code: 'ID', label: 'Indonesia', flag: '🇮🇩', locale: 'id-ID', timeFormat: '24h', dateFormat: 'DMY', firstDayOfWeek: 0, numberFormat: 'western' },
  { code: 'NG', label: 'Nigeria', flag: '🇳🇬', locale: 'en-NG', timeFormat: '12h', dateFormat: 'DMY', firstDayOfWeek: 1, numberFormat: 'western' },
  { code: 'ZA', label: 'South Africa', flag: '🇿🇦', locale: 'en-ZA', timeFormat: '24h', dateFormat: 'YMD', firstDayOfWeek: 0, numberFormat: 'western' },
  { code: 'AU', label: 'Australia', flag: '🇦🇺', locale: 'en-AU', timeFormat: '12h', dateFormat: 'DMY', firstDayOfWeek: 1, numberFormat: 'western' },
  { code: 'CA', label: 'Canada', flag: '🇨🇦', locale: 'en-CA', timeFormat: '12h', dateFormat: 'YMD', firstDayOfWeek: 0, numberFormat: 'western' },
  { code: 'RU', label: 'Russia', flag: '🇷🇺', locale: 'ru-RU', timeFormat: '24h', dateFormat: 'DMY', firstDayOfWeek: 1, numberFormat: 'western' },
  { code: 'TR', label: 'Türkiye', flag: '🇹🇷', locale: 'tr-TR', timeFormat: '24h', dateFormat: 'DMY', firstDayOfWeek: 1, numberFormat: 'western' },
];

/** Language → best-guess default region, used when region is 'auto'. */
const LANGUAGE_DEFAULT_REGION: Record<LangCode, string> = {
  en: 'US',
  bn: 'BD',
  es: 'ES',
  fr: 'FR',
  ar: 'AE',
  zh: 'CN',
};

export function getRegionOption(code: string): RegionOption {
  return REGIONS.find((r) => r.code === code) ?? REGIONS[0];
}

/**
 * Resolve the effective region option for the current settings. When the user
 * has chosen 'auto' we fall back to a region that matches their language, and
 * finally to the device locale.
 */
export function resolveRegion(settings: Pick<ThemeSettings, 'region' | 'language'>): RegionOption {
  if (settings.region && settings.region !== 'auto') {
    return getRegionOption(settings.region);
  }
  const langRegion = LANGUAGE_DEFAULT_REGION[settings.language as LangCode];
  if (langRegion) return getRegionOption(langRegion);
  return REGIONS[0];
}

/**
 * Build the BCP-47 locale string used for Intl formatting. Combines the app
 * language with the resolved region so e.g. English + Bangladesh renders
 * "en-BD" (English words, Bangladeshi conventions).
 */
export function getLocale(settings: Pick<ThemeSettings, 'region' | 'language'>): string {
  const region = resolveRegion(settings);
  if (region.code === 'auto') {
    // Let the browser decide, but still honour the app language.
    return settings.language || 'en';
  }
  return `${settings.language || 'en'}-${region.code}`;
}

/** Effective clock format (user override → region default). */
export function getTimeFormat(settings: Pick<ThemeSettings, 'region' | 'language' | 'timeFormat'>): '12h' | '24h' {
  if (settings.timeFormat === '12h' || settings.timeFormat === '24h') return settings.timeFormat;
  return resolveRegion(settings).timeFormat;
}

/** Effective date ordering (user override → region default). */
export function getDateFormat(settings: Pick<ThemeSettings, 'region' | 'language' | 'dateFormat'>): 'MDY' | 'DMY' | 'YMD' {
  if (settings.dateFormat && settings.dateFormat !== 'auto') return settings.dateFormat;
  return resolveRegion(settings).dateFormat;
}

/** Effective first day of week (user override → region default). */
export function getFirstDayOfWeek(settings: Pick<ThemeSettings, 'region' | 'language' | 'firstDayOfWeek'>): 0 | 1 | 6 {
  if (settings.firstDayOfWeek === 0 || settings.firstDayOfWeek === 1 || settings.firstDayOfWeek === 6) {
    return settings.firstDayOfWeek;
  }
  return resolveRegion(settings).firstDayOfWeek;
}

/** Effective number grouping (user override → region default). */
export function getNumberFormat(settings: Pick<ThemeSettings, 'region' | 'language' | 'numberFormat'>): 'western' | 'indian' {
  if (settings.numberFormat === 'western' || settings.numberFormat === 'indian') return settings.numberFormat;
  return resolveRegion(settings).numberFormat;
}

// ── Active settings bridge ───────────────────────────────────────────────────
// Pure modules (e.g. timeUtils) can't read the Zustand store directly without
// risking circular imports, so we keep a lightweight snapshot here that a React
// hook keeps in sync with the settings store.

type RegionSettings = Pick<
  ThemeSettings,
  'region' | 'language' | 'timeFormat' | 'dateFormat' | 'firstDayOfWeek' | 'numberFormat' | 'showTimezone'
>;

const FALLBACK_SETTINGS: RegionSettings = {
  region: 'auto',
  language: 'en',
  timeFormat: '12h',
  dateFormat: 'auto',
  firstDayOfWeek: 0,
  numberFormat: 'auto',
  showTimezone: false,
};

let activeSettings: RegionSettings = { ...FALLBACK_SETTINGS };

export function setActiveRegionSettings(settings: Partial<RegionSettings>): void {
  activeSettings = { ...FALLBACK_SETTINGS, ...settings };
}

export function getActiveRegionSettings(): RegionSettings {
  return activeSettings;
}

// ── Formatting helpers ───────────────────────────────────────────────────────

/** Format a time using the resolved locale + 12/24h preference. */
export function formatTimeOfDay(
  date: Date,
  settings: Pick<ThemeSettings, 'region' | 'language' | 'timeFormat'>,
): string {
  const locale = getLocale(settings);
  const hour12 = getTimeFormat(settings) === '12h';
  try {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12 });
  } catch {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12 });
  }
}

/** Format a date using the resolved locale + ordering preference. */
export function formatDateBySettings(
  date: Date,
  settings: Pick<ThemeSettings, 'region' | 'language' | 'dateFormat'>,
  opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' },
): string {
  const locale = getLocale(settings);
  try {
    return date.toLocaleDateString(locale, opts);
  } catch {
    return date.toLocaleDateString(undefined, opts);
  }
}

/** Format a number using the resolved locale + grouping preference. */
export function formatNumberBySettings(
  value: number,
  settings: Pick<ThemeSettings, 'region' | 'language' | 'numberFormat'>,
  opts: Intl.NumberFormatOptions = {},
): string {
  const grouping = getNumberFormat(settings);
  if (grouping === 'indian') {
    // Indian grouping: 12,34,567 — Intl supports this via the en-IN locale.
    try {
      return new Intl.NumberFormat('en-IN', opts).format(value);
    } catch {
      return String(value);
    }
  }
  const locale = getLocale(settings);
  try {
    return new Intl.NumberFormat(locale, opts).format(value);
  } catch {
    return new Intl.NumberFormat(undefined, opts).format(value);
  }
}

/** Localised weekday names ordered from the configured first day of week. */
export function getWeekdayNames(
  settings: Pick<ThemeSettings, 'region' | 'language' | 'firstDayOfWeek'>,
  style: 'long' | 'short' | 'narrow' = 'short',
): string[] {
  const locale = getLocale(settings);
  const first = getFirstDayOfWeek(settings);
  const names: string[] = [];
  // 2024-01-07 is a Sunday — a stable reference week.
  for (let i = 0; i < 7; i++) {
    const d = new Date(2024, 0, 7 + ((first + i) % 7));
    try {
      names.push(d.toLocaleDateString(locale, { weekday: style }));
    } catch {
      names.push(d.toLocaleDateString(undefined, { weekday: style }));
    }
  }
  return names;
}

/** Human-readable timezone label, e.g. "GMT+6". */
export function getTimezoneLabel(date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZoneName: 'shortOffset' }).formatToParts(date);
    const tz = parts.find((p) => p.type === 'timeZoneName')?.value;
    return tz ?? '';
  } catch {
    const offset = -date.getTimezoneOffset() / 60;
    const sign = offset >= 0 ? '+' : '-';
    return `GMT${sign}${Math.abs(offset)}`;
  }
}

/** A short preview string used in the settings UI, e.g. "14:30 · 31/12/2024". */
export function getFormatPreview(
  settings: Pick<ThemeSettings, 'region' | 'language' | 'timeFormat' | 'dateFormat'>,
): string {
  const sample = new Date(2024, 11, 31, 14, 30);
  return `${formatTimeOfDay(sample, settings)} · ${formatDateBySettings(sample, settings)}`;
}
