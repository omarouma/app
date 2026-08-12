import { useCallback, useSyncExternalStore } from 'react';

const noopSubscribe = () => () => {};

/**
 * Returns true after the component has mounted on the client.
 * SSR-safe: server snapshot is false, client snapshot is true.
 */
export function useIsMounted() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function useIsMobile(breakpoint = 768) {
  return useMediaQuery(`(max-width: ${breakpoint - 1}px)`);
}

export function useIsTablet(minWidth = 640, maxWidth = 1023) {
  return useMediaQuery(`(min-width: ${minWidth}px) and (max-width: ${maxWidth}px)`);
}

export function useIsDesktop(minWidth = 1024) {
  return useMediaQuery(`(min-width: ${minWidth}px)`);
}

export function useIsLargeDesktop(minWidth = 1280) {
  return useMediaQuery(`(min-width: ${minWidth}px)`);
}

export function useIsSmallPhone(maxWidth = 480) {
  return useMediaQuery(`(max-width: ${maxWidth}px)`);
}

function useWindowDimension(getValue: () => number): number {
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener('resize', onChange);
    window.addEventListener('orientationchange', onChange);
    return () => {
      window.removeEventListener('resize', onChange);
      window.removeEventListener('orientationchange', onChange);
    };
  }, []);
  return useSyncExternalStore(subscribe, getValue, () => 0);
}

export function useScreenWidth() {
  return useWindowDimension(() => window.innerWidth);
}

export function useViewportHeight() {
  return useWindowDimension(() => window.innerHeight);
}

export function useIsLandscape() {
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener('resize', onChange);
    window.addEventListener('orientationchange', onChange);
    return () => {
      window.removeEventListener('resize', onChange);
      window.removeEventListener('orientationchange', onChange);
    };
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => {
      const orientation = (screen?.orientation as unknown as { type?: string })?.type || '';
      if (orientation) return orientation.includes('landscape');
      return window.innerWidth > window.innerHeight;
    },
    () => false,
  );
}
