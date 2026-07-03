// Video API configuration - add your API keys to enable external video sources
// Get free API keys from:
// - YouTube: https://console.cloud.google.com/apis/credentials
// - Pexels: https://www.pexels.com/api/

export const VIDEO_API_CONFIG = {
  // YouTube Data API v3 - 10,000 quota units/day (search costs 100 units)
  YOUTUBE_API_KEY: (import.meta as any).env?.VITE_YOUTUBE_API_KEY || '',
  // Pexels API - 200 requests/hour free tier
  PEXELS_API_KEY: (import.meta as any).env?.VITE_PEXELS_API_KEY || '',
  // Enable/disable external sources
  ENABLE_YOUTUBE: true,
  ENABLE_PEXELS: true,
};

export function hasYouTubeKey(): boolean {
  return VIDEO_API_CONFIG.YOUTUBE_API_KEY.length > 0;
}

export function hasPexelsKey(): boolean {
  return VIDEO_API_CONFIG.PEXELS_API_KEY.length > 0;
}

export function hasAnyVideoKey(): boolean {
  return hasYouTubeKey() || hasPexelsKey();
}

// Category to search keyword mapping for YouTube
export const CATEGORY_KEYWORDS: Record<string, string> = {
  Funny: 'funny videos comedy short',
  Music: 'music video song viral',
  Sports: 'sports highlights amazing',
  Food: 'food recipe cooking delicious',
  Travel: 'travel vlog adventure beautiful places',
  Dance: 'dance choreography viral trend',
  Tech: 'tech review gadget amazing',
  Beauty: 'beauty makeup tutorial glow',
  Gaming: 'gaming gameplay epic moments',
  Education: 'educational learning interesting facts',
  Nature: 'nature wildlife scenery beautiful',
  Lifestyle: 'lifestyle vlog daily routine',
};

export function getCategoryKeyword(category: string): string {
  return CATEGORY_KEYWORDS[category] || category;
}
