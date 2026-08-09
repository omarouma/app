import type { AdBannerProps } from '@/components/AdBanner';

/**
 * In-app promotion / house ads. These are "promoted" placements shown inside
 * the feed. When no paid AdSense slots are configured, house ads keep the feed
 * monetized and on-brand. Update imageUrl to your own hosted assets for
 * production (e.g. /ads/premium.png served from the public/ folder).
 */
export const MOCK_ADS: Omit<AdBannerProps, 'onDismiss' | 'onClick'>[] = [
  {
    id: 'ad_1',
    title: 'Upgrade to GaGa Premium',
    description: 'Get verified, go ad-free, and unlock creator tools.',
    imageUrl: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=600&auto=format&fit=crop',
    linkUrl: '/premium',
    ctaText: 'Learn More',
    sponsorName: 'GaGa Chat',
    sponsorLogo: '/logo-192.png',
    variant: 'feed',
  },
  {
    id: 'ad_2',
    title: 'Earn Coins Daily',
    description: 'Check in every day and stake your coins for passive income.',
    imageUrl: 'https://images.unsplash.com/photo-1553729459-efe14e60584f?w=600&auto=format&fit=crop',
    linkUrl: '/rewards',
    ctaText: 'Start Earning',
    sponsorName: 'GaGa Rewards',
    sponsorLogo: '/logo-192.png',
    variant: 'feed',
  },
  {
    id: 'ad_3',
    title: 'Creator Tools Launch',
    description: 'New analytics, subscriptions, and tipping are now live.',
    imageUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&auto=format&fit=crop',
    linkUrl: '/premium',
    ctaText: 'Explore',
    sponsorName: 'GaGa Creator',
    sponsorLogo: '/logo-192.png',
    variant: 'compact',
  },
  {
    id: 'ad_4',
    title: 'Invite Friends & Earn',
    description: 'Earn bonus Gaga Coins for every friend you bring to GaGa Chat.',
    imageUrl: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=600&auto=format&fit=crop',
    linkUrl: '/add-friends',
    ctaText: 'Invite Now',
    sponsorName: 'GaGa Referral',
    sponsorLogo: '/logo-192.png',
    variant: 'feed',
  },
  {
    id: 'ad_5',
    title: 'Go Live in Minutes',
    description: 'Stream to your followers with HD quality and earn tips live.',
    imageUrl: 'https://images.unsplash.com/photo-1598550476439-6847785fcea6?w=600&auto=format&fit=crop',
    linkUrl: '/live-streams',
    ctaText: 'Start Streaming',
    sponsorName: 'GaGa Live',
    sponsorLogo: '/logo-192.png',
    variant: 'compact',
  },
];
