import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

type AdFormat = 'auto' | 'fluid' | 'rectangle' | 'vertical' | 'horizontal';

interface GoogleAdProps {
  slot: string;
  format?: AdFormat;
  responsive?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Renders a single Google AdSense ad unit.
 *
 * Usage:
 *   <GoogleAd slot="1234567890" format="auto" responsive />
 *
 * Slot IDs for this app (ca-pub-8502434495835950):
 *   Feed banner     — create in AdSense dashboard → Ad units → Display ads
 *   In-feed         — create in AdSense dashboard → Ad units → In-feed ads
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

  return (
    <ins
      ref={adRef}
      className={`adsbygoogle ${className}`}
      style={{ display: 'block', ...style }}
      data-ad-client="ca-pub-8502434495835950"
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive={responsive ? 'true' : 'false'}
    />
  );
}

/**
 * Pre-configured ad placements — add your real slot IDs from the AdSense dashboard.
 * Go to: https://www.google.com/adsense → Ads → By ad unit → Create new ad unit
 */
export function FeedAd({ className }: { className?: string }) {
  return (
    <GoogleAd
      slot="YOUR_FEED_AD_SLOT_ID"
      format="fluid"
      responsive
      className={className}
      style={{ minHeight: 100 }}
    />
  );
}

export function BannerAd({ className }: { className?: string }) {
  return (
    <GoogleAd
      slot="YOUR_BANNER_AD_SLOT_ID"
      format="horizontal"
      responsive
      className={className}
      style={{ minHeight: 60 }}
    />
  );
}

export function SidebarAd({ className }: { className?: string }) {
  return (
    <GoogleAd
      slot="YOUR_SIDEBAR_AD_SLOT_ID"
      format="vertical"
      responsive
      className={className}
      style={{ minHeight: 250 }}
    />
  );
}
