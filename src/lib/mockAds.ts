import type { AdBannerProps } from '@/components/AdBanner';

export const MOCK_ADS: Omit<AdBannerProps, 'onDismiss' | 'onClick'>[] = [
  {
    id: 'ad_1',
    title: 'Upgrade to GaGa Premium',
    description: 'Get verified, go ad-free, and unlock creator tools.',
    imageUrl: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=600&auto=format&fit=crop',
    linkUrl: '/premium',
    ctaText: 'Learn More',
    sponsorName: 'GaGa Chat',
    sponsorLogo: '',
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
    variant: 'compact',
  },
];
