import { useEffect } from 'react';
import { useIsMounted } from './use-mobile';

export function useDocumentTitle(title: string) {
  const isMounted = useIsMounted();
  useEffect(() => {
    if (!isMounted) return;
    const previousTitle = document.title;
    document.title = title;
    return () => {
      document.title = previousTitle;
    };
  }, [title, isMounted]);
}

export function usePageTitle(title: string, suffix = " | GaGaChat") {
  useDocumentTitle(`${title}${suffix}`);
}