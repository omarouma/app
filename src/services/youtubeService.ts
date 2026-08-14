import { z } from 'zod';
import env from '@/config/env';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const API_KEY = env.VITE_YOUTUBE_API_KEY;

// Zod Schemas for API validation
const YouTubeThumbnailSchema = z.object({
  url: z.string(),
  width: z.number(),
  height: z.number(),
});

const YouTubeSnippetSchema = z.object({
  publishedAt: z.string().optional(),
  channelId: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  thumbnails: z.object({
    default: YouTubeThumbnailSchema.optional(),
    medium: YouTubeThumbnailSchema.optional(),
    high: YouTubeThumbnailSchema.optional(),
    standard: YouTubeThumbnailSchema.optional(),
    maxres: YouTubeThumbnailSchema.optional(),
  }).passthrough().optional(),
  channelTitle: z.string().optional(),
});

const YouTubeContentDetailsSchema = z.object({
  duration: z.string().optional(),
}).passthrough();

const YouTubeStatisticsSchema = z.object({
  viewCount: z.string().optional(),
  likeCount: z.string().optional(),
}).passthrough();

// Application's internal representation of a YouTube video
export interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  channelTitle: string;
  channelId: string;
  publishedAt: string;
  viewCount?: string;
  duration?: string;
  likeCount?: string;
}


const CACHE_KEY_TRENDING = 'gaga_youtube_trending';
const CACHE_KEY_PREFIX = 'gaga_youtube_search_';
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
const DEFAULT_REGION = env.VITE_YOUTUBE_REGION || 'US';

// Demo videos as fallback when no API key or API fails
const DEMO_VIDEOS: YouTubeVideo[] = [
  {
    id: 'LXb3EKWsInQ',
    title: 'Costa Rica in 4K - 60fps HDR',
    description: 'Beautiful cinematic footage of Costa Rica.',
    thumbnail: 'https://i.ytimg.com/vi/LXb3EKWsInQ/maxresdefault.jpg',
    channelTitle: 'Jacob + Katie Schwarz',
    channelId: 'UCkJHg...',
    publishedAt: '2023-08-01T00:00:00Z',
  },
  {
    id: 'M7lc1UVf-VE',
    title: 'YouTube Developers - Getting Started',
    description: 'Learn how to get started with the YouTube API.',
    thumbnail: 'https://i.ytimg.com/vi/M7lc1UVf-VE/maxresdefault.jpg',
    channelTitle: 'YouTube Developers',
    channelId: 'UCxZ...',
    publishedAt: '2023-06-15T00:00:00Z',
  },
  {
    id: 'dQw4w9WgXcQ',
    title: 'Rick Astley - Never Gonna Give You Up',
    description: 'The official video for Never Gonna Give You Up.',
    thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
    channelTitle: 'Rick Astley',
    channelId: 'UCuAX...',
    publishedAt: '2009-10-25T00:00:00Z',
  },
  {
    id: '9bZkp7q19f0',
    title: 'PSY - GANGNAM STYLE',
    description: 'The official video for PSY - GANGNAM STYLE.',
    thumbnail: 'https://i.ytimg.com/vi/9bZkp7q19f0/maxresdefault.jpg',
    channelTitle: 'officialpsy',
    channelId: 'UCrD...',
    publishedAt: '2012-07-15T00:00:00Z',
  },
  {
    id: 'kJQP7kiw5Fk',
    title: 'Luis Fonsi - Despacito ft. Daddy Yankee',
    description: 'The official music video for Despacito.',
    thumbnail: 'https://i.ytimg.com/vi/kJQP7kiw5Fk/maxresdefault.jpg',
    channelTitle: 'Luis Fonsi',
    channelId: 'UCxo...',
    publishedAt: '2017-01-12T00:00:00Z',
  },
  {
    id: 'RgKAFK5djSk',
    title: 'Mark Ronson - Uptown Funk ft. Bruno Mars',
    description: 'The official video for Uptown Funk.',
    thumbnail: 'https://i.ytimg.com/vi/RgKAFK5djSk/maxresdefault.jpg',
    channelTitle: 'Mark Ronson',
    channelId: 'UCmf...',
    publishedAt: '2014-11-19T00:00:00Z',
  },
  {
    id: 'OPf0YbXqDm0',
    title: 'Pharrell Williams - Happy',
    description: 'The official video for Happy.',
    thumbnail: 'https://i.ytimg.com/vi/OPf0YbXqDm0/maxresdefault.jpg',
    channelTitle: 'Pharrell Williams',
    channelId: 'UCw...',
    publishedAt: '2013-11-21T00:00:00Z',
  },
  {
    id: 'CevxZvSJLk8',
    title: 'Katy Perry - Roar',
    description: 'The official video for Roar.',
    thumbnail: 'https://i.ytimg.com/vi/CevxZvSJLk8/maxresdefault.jpg',
    channelTitle: 'Katy Perry',
    channelId: 'UCY...',
    publishedAt: '2013-09-05T00:00:00Z',
  },
];

function getCached(key: string): YouTubeVideo[] | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > CACHE_DURATION) return null;
    return data;
  } catch {
    return null;
  }
}

function setCached(key: string, data: YouTubeVideo[]) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
    }
  } catch {
    // ignore
  }
}

function parseYouTubeResponse(items: any[]): YouTubeVideo[] {
  return items.flatMap((item) => {
    const snippet = YouTubeSnippetSchema.safeParse(item?.snippet ?? {});
    const stats = YouTubeStatisticsSchema.safeParse(item?.statistics ?? {});
    const content = YouTubeContentDetailsSchema.safeParse(item?.contentDetails ?? {});

    if (!snippet.success) return [];

    const thumbs = snippet.data.thumbnails ?? {};
    const bestThumb = thumbs.maxres?.url || thumbs.standard?.url || thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || '';
    const normalized = {
      id: item?.id?.videoId || item?.id || '',
      title: snippet.data.title || 'Untitled',
      description: snippet.data.description || '',
      thumbnail: bestThumb,
      channelTitle: snippet.data.channelTitle || 'Unknown',
      channelId: snippet.data.channelId || '',
      publishedAt: snippet.data.publishedAt || '',
      viewCount: stats.success ? stats.data.viewCount : undefined,
      likeCount: stats.success ? stats.data.likeCount : undefined,
      duration: content.success ? content.data.duration : undefined,
    };

    if (!normalized.id) return [];
    return [normalized];
  });
}

/**
 * Fetch trending YouTube videos.
 * Uses the YouTube Data API v3 if a key is available; otherwise falls back to demo data.
 */
export async function fetchTrendingVideos(regionCode = DEFAULT_REGION, maxResults = 20): Promise<YouTubeVideo[]> {
  const cacheKey = `${CACHE_KEY_TRENDING}_${regionCode}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  if (!API_KEY) {
    console.warn('[YouTube] No VITE_YOUTUBE_API_KEY — using demo data.');
    setCached(cacheKey, DEMO_VIDEOS);
    return DEMO_VIDEOS;
  }

  try {
    const url = `${YOUTUBE_API_BASE}/videos?part=snippet,contentDetails,statistics&chart=mostPopular&regionCode=${regionCode}&maxResults=${maxResults}&key=${API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`YouTube API ${res.status}`);
    const data = await res.json();
    const parsed = parseYouTubeResponse(data.items || []);
    const result = parsed.length > 0 ? parsed : DEMO_VIDEOS;
    setCached(cacheKey, result);
    return result;
  } catch (err) {
    console.error('[YouTube] fetchTrendingVideos failed:', err);
    setCached(cacheKey, DEMO_VIDEOS);
    return DEMO_VIDEOS;
  }
}

/**
 * Search YouTube videos by query.
 */
export async function searchYouTube(query: string, maxResults = 20): Promise<YouTubeVideo[]> {
  if (!API_KEY) {
    const q = query.toLowerCase();
    return DEMO_VIDEOS.filter(v => v.title.toLowerCase().includes(q) || v.channelTitle.toLowerCase().includes(q));
  }

  const cacheKey = `${CACHE_KEY_PREFIX}${query}_${maxResults}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const url = `${YOUTUBE_API_BASE}/search?part=snippet&type=video&q=${encodeURIComponent(query)}&maxResults=${maxResults}&key=${API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`YouTube search ${res.status}`);
    const data = await res.json();
    const parsed = parseYouTubeResponse(data.items || []);
    setCached(cacheKey, parsed);
    return parsed;
  } catch (err) {
    console.error('[YouTube] searchYouTube failed:', err);
    const q = query.toLowerCase();
    return DEMO_VIDEOS.filter(v => v.title.toLowerCase().includes(q));
  }
}

/**
 * Extract YouTube video ID from various URL formats.
 */
export function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Find all YouTube video IDs in a text string.
 */
export function findYouTubeIds(text: string): string[] {
  const urlPattern = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=[a-zA-Z0-9_-]{11}|youtu\.be\/[a-zA-Z0-9_-]{11}|youtube\.com\/embed\/[a-zA-Z0-9_-]{11}|youtube\.com\/shorts\/[a-zA-Z0-9_-]{11})/gi;
  const matches = text.match(urlPattern) || [];
  const ids = matches.map(url => extractYouTubeId(url)).filter(Boolean) as string[];
  return [...new Set(ids)];
}

/**
 * Format view count for display (e.g. 1,234,567 -> 1.2M).
 */
export function formatViewCount(count?: string): string {
  if (!count) return '';
  const n = parseInt(count, 10);
  if (isNaN(n)) return count;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

/**
 * Format published date as relative time.
 */
export function formatPublishedAt(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return `${years}y ago`;
  if (months > 0) return `${months}mo ago`;
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

/**
 * Clear the YouTube cache.
 */
export function clearYouTubeCache() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  Object.keys(window.localStorage)
    .filter(k => k.startsWith('gaga_youtube_'))
    .forEach(k => window.localStorage.removeItem(k));
}