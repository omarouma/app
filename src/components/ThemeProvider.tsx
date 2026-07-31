import { useEffect } from 'react';
import { useUserSettings } from '@/store/useSettingsStore';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useUserSettings();

  useEffect(() => {
    const root = document.documentElement;
    const isDark = settings.theme === 'dark' || settings.theme === 'midnight' || settings.theme === 'oled';
    
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Apply OLED-specific optimizations
    if (settings.theme === 'oled') {
      root.style.setProperty('--background', '0 0% 0%');
    } else {
      root.style.removeProperty('--background');
    }
  }, [settings.theme]);

  // Listen for system color scheme changes (only when theme is set to 'light' or 'dark' auto)
  useEffect(() => {
    if (settings.theme !== 'light' && settings.theme !== 'dark') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      // Only auto-switch if user hasn't explicitly set a non-auto theme
      // For now, we respect the explicit setting but update a CSS class for system preference
      if (e.matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };
    // Apply initial state
    if (mediaQuery.matches) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [settings.theme]);

  // Listen for prefers-reduced-motion
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        document.documentElement.classList.add('reduce-motion');
        document.documentElement.style.setProperty('--animation-duration', '0.01ms');
      } else {
        document.documentElement.classList.remove('reduce-motion');
        document.documentElement.style.removeProperty('--animation-duration');
      }
    };
    // Apply initial state
    if (mediaQuery.matches || settings.accessibility?.reducedMotion) {
      document.documentElement.classList.add('reduce-motion');
      document.documentElement.style.setProperty('--animation-duration', '0.01ms');
    }
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [settings.accessibility?.reducedMotion]);

  return <>{children}</>;
}
