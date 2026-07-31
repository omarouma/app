import { useEffect } from 'react';

export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;
    return () => {
      document.title = previousTitle;
    };
  }, [title]);
}

export function usePageTitle(title: string, suffix = " | GaGaChat") {
  useDocumentTitle(`${title}${suffix}`);
}
