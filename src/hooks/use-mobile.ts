import { useState, useEffect } from 'react';

function getMql(breakpoint: number) {
  if (typeof window === 'undefined') return null;
  return window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
}

export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => getMql(breakpoint)?.matches ?? false);

  useEffect(() => {
    const mql = getMql(breakpoint);
    if (!mql) return;
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [breakpoint]);

  return isMobile;
}
