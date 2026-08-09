import { useEffect, useRef } from 'react';
import env from '@/config/env';
import AdBanner from '@/components/AdBanner';
import { MOCK_ADS } from '@/lib/mockAds';

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

type AdFormat = 'auto' | 'fluid' | 'rectangle' | 'vertical' | 'horizontal';

interface GoogleAdProps {
  slot?: string;
  format?: AdFormat;
  responsive?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Resolves the real AdSense slot ID from env, falling back to the pub ID's
 * placeholder when not configured. Slot IDs are read from `VITE_ADSENSE_*`.
 */
function getSlot(slot: string | undefined, fallback: string): string {
  return slot || env.VITE_ADSENSE_FEED_SLOT || env.VITE_ADSENSE_BANNER_SLOT || env.VITE_ADSENSE_SIDEBAR_SLOT || fallback;
}

/**
 * Renders a single Google AdSense ad unit.
 *
 * Usage:
 *   <GoogleAd slot="1234567890" format="auto" responsive />
 *
 * Slot IDs for this app (ca-pub-8502434495835950) are configured via env:
 *   VITE_ADSENSE_FEED_SLOT    — in-feed banner
 *   VITE_ADSENSE_BANNER_SLOT  — horizontal banner
 *   VITE_ADSENSE_SIDEBAR_SLOT — vertical/sidebar unit
 */
export default function GoogleAd({
  slot,
  format = 'auto',
  responsive = true,
  className = '',
  style,
}: GoogleAdProps) {
  const adRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);

  useEffect(() => {
    if (pushed.current) return;
    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
      pushed.current = true;
    } catch {
      // AdSense not loaded yet — silently ignore
    }
  }, []);

  const resolvedSlot = getSlot(slot, 'AD_PENDING');

  return (
    <ins
      ref={adRef}
      className={`adsbygoogle ${className}`}
      style={{ display: 'block', ...style }}
      data-ad-client="ca-pub-8502434495835950"
      data-ad-slot={resolvedSlot}
      data-ad-format={format}
      data-full-width-responsive={responsive ? 'true' : 'false'}
    />
  );
}

/**
 * Pre-configured ad placements. When a real AdSense slot hasn't been set yet,
 * these gracefully fall back to the built-in mock/featured ad banners so the
 * feed still looks complete and monetization-ready.
 */
export function FeedAd({ className }: { className?: string }) {
  const slot = env.VITE_ADSENSE_FEED_SLOT;
  if (!slot) {
    return <AdBanner {...MOCK_ADS[0]} variant="feed" className={className} />;
  }
  return (
    <GoogleAd
      slot={slot}
      format="fluid"
      responsive
      className={className}
      style={{ minHeight: 100 }}
    />
  );
}

export function BannerAd({ className }: { className?: string }) {
  const slot = env.VITE_ADSENSE_BANNER_SLOT;
  if (!slot) {
    return <AdBanner {...MOCK_ADS[1]} variant="compact" className={className} />;
  }
  return (
    <GoogleAd
      slot={slot}
      format="horizontal"
      responsive
      className={className}
      style={{ minHeight: 60 }}
    />
  );
}

export function SidebarAd({ className }: { className?: string }) {
  const slot = env.VITE_ADSENSE_SIDEBAR_SLOT;
  if (!slot) {
    return <AdBanner {...MOCK_ADS[2]} variant="compact" className={className} />;
  }
  return (
    <GoogleAd
      slot={slot}
      format="vertical"
      responsive
      className={className}
      style={{ minHeight: 250 }}
    />
  );
}
