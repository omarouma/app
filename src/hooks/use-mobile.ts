import { useState, useEffect } from 'react';

export function useIsMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);
  const isMounted = useIsMounted();

  useEffect(() => {
    if (!isMounted) return;
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    setIsMobile(mql.matches);

    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [breakpoint, isMounted]);

  return isMobile;
}