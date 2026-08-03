import { VIDEO_API_CONFIG, getCategoryKeyword, hasYouTubeKey, hasPexelsKey } from '@/config/videoApis';
import type { Reel } from '@/types';

// ── Cache ────────────────────────────────────────────────
const CACHE_PREFIX = 'gaga_video_cache_';
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes

function getCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch { return null; }
}

function setCache<T>(key: string, data: T) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ ts: Date.now(), data }));
  } catch { /* ignore */ }
}

// ── YouTube API ──────────────────────────────────────────
export interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  channelTitle: string;
  publishedAt: string;
  duration?: string; // ISO 8601
  viewCount?: string;
}

async function searchYouTube(query: string, maxResults: number): Promise<YouTubeVideo[]> {
  if (!hasYouTubeKey()) return [];
  const cacheKey = `yt_search_${query}_${maxResults}`;
  const cached = getCache<YouTubeVideo[]>(cacheKey);
  if (cached) return cached;

  try {
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoDuration=short&maxResults=${maxResults}&key=${VIDEO_API_CONFIG.YOUTUBE_API_KEY}`
    );
    if (!searchRes.ok) return [];
    const searchData = await searchRes.json();
    const items = searchData.items || [];
    if (items.length === 0) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const videoIds = items.map((item: any) => item.id?.videoId).filter(Boolean).join(',');
    const detailsRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=${videoIds}&key=${VIDEO_API_CONFIG.YOUTUBE_API_KEY}`
    );
    const detailsData = detailsRes.ok ? await detailsRes.json() : { items: [] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const detailsMap = new Map<string, any>();
    for (const d of detailsData.items || []) {
      detailsMap.set(d.id, d);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: YouTubeVideo[] = (items as any[]).map((item) => {
      const detail = detailsMap.get(item.id?.videoId);
      const thumb = item.snippet?.thumbnails?.maxres?.url
        || item.snippet?.thumbnails?.standard?.url
        || item.snippet?.thumbnails?.high?.url
        || item.snippet?.thumbnails?.medium?.url
        || '';
      return {
        id: item.id?.videoId,
        title: item.snippet?.title || '',
        description: item.snippet?.description || '',
        thumbnail: thumb,
        channelTitle: item.snippet?.channelTitle || '',
        publishedAt: item.snippet?.publishedAt || '',
        duration: detail?.contentDetails?.duration,
        viewCount: detail?.statistics?.viewCount,
      };
    }).filter((v: YouTubeVideo) => v.id);

    setCache(cacheKey, results);
    return results;
  } catch (err) {
    console.error('YouTube search error:', err);
    return [];
  }
}

// ── Pexels API ───────────────────────────────────────────
export interface PexelsVideo {
  id: number;
  url: string;
  videoUrl: string;
  thumbnail: string;
  duration: number;
  width: number;
  height: number;
  user: { name: string; url: string };
}

async function searchPexels(query: string, perPage: number): Promise<PexelsVideo[]> {
  if (!hasPexelsKey()) return [];
  const cacheKey = `pexels_search_${query}_${perPage}`;
  const cached = getCache<PexelsVideo[]>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=portrait`,
      { headers: { Authorization: VIDEO_API_CONFIG.PEXELS_API_KEY } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: PexelsVideo[] = (data.videos || []).map((v: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bestFile = v.video_files?.find((f: any) => f.quality === 'hd' && f.file_type === 'video/mp4')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        || v.video_files?.find((f: any) => f.file_type === 'video/mp4')
        || v.video_files?.[0];
      return {
        id: v.id,
        url: v.url,
        videoUrl: bestFile?.link || v.url,
        thumbnail: v.video_pictures?.[0]?.picture || v.image,
        duration: v.duration,
        width: v.width,
        height: v.height,
        user: { name: v.user?.name || 'Pexels', url: v.user?.url || '' },
      };
    });
    setCache(cacheKey, results);
    return results;
  } catch (err) {
    console.error('Pexels search error:', err);
    return [];
  }
}

// ── Convert to Reel format ───────────────────────────────
export function youtubeToReel(video: YouTubeVideo, category?: string): Reel {
  return {
    id: `yt-${video.id}`,
    userId: `yt-channel`,
    videoUrl: `https://www.youtube.com/embed/${video.id}?autoplay=1&mute=0&playsinline=1&rel=0&modestbranding=1`,
    thumbnailUrl: video.thumbnail,
    caption: video.title,
    musicTitle: undefined,
    duration: parseISODuration(video.duration || 'PT30S'),
    likes: [],
    comments: [],
    shares: [],
    savedBy: [],
    viewedBy: [],
    timestamp: new Date(video.publishedAt),
    userName: video.channelTitle,
    userAvatar: `https://i.ytimg.com/vi/${video.id}/default.jpg`,
    tags: ['youtube', category?.toLowerCase() || 'external'],
    viewCount: parseInt(video.viewCount || '0', 10),
    category: category || 'External',
  };
}

export function pexelsToReel(video: PexelsVideo, category?: string): Reel {
  return {
    id: `pexels-${video.id}`,
    userId: `pexels-user`,
    videoUrl: video.videoUrl,
    thumbnailUrl: video.thumbnail,
    caption: `${video.user.name} on Pexels`,
    musicTitle: undefined,
    duration: video.duration,
    likes: [],
    comments: [],
    shares: [],
    savedBy: [],
    viewedBy: [],
    timestamp: new Date(),
    userName: video.user.name,
    userAvatar: '',
    tags: ['pexels', category?.toLowerCase() || 'external'],
    viewCount: 0,
    category: category || 'External',
  };
}

function parseISODuration(iso: string): number {
  // PT1M30S -> 90 seconds
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 30;
  const h = parseInt(match[1] || '0', 10);
  const m = parseInt(match[2] || '0', 10);
  const s = parseInt(match[3] || '0', 10);
  return h * 3600 + m * 60 + s;
}

// ── Combined search ─────────────────────────────────────
export interface SearchReelsResult {
  reels: Reel[];
  source: 'youtube' | 'pexels' | 'mixed' | 'none';
}

export async function searchExternalVideos(query: string, category?: string, maxResults: number = 10): Promise<SearchReelsResult> {
  const results: Reel[] = [];
  let source: SearchReelsResult['source'] = 'none';

  const searchQuery = category ? getCategoryKeyword(category) : query;

  // Try Pexels first (native MP4 playback, better for reels)
  if (VIDEO_API_CONFIG.ENABLE_PEXELS && hasPexelsKey()) {
    const pexels = await searchPexels(searchQuery, maxResults);
    if (pexels.length > 0) {
      results.push(...pexels.map(v => pexelsToReel(v, category)));
      source = 'pexels';
    }
  }

  // Try YouTube as fallback or supplement
  if (VIDEO_API_CONFIG.ENABLE_YOUTUBE && hasYouTubeKey()) {
    const youtube = await searchYouTube(searchQuery, maxResults);
    if (youtube.length > 0) {
      results.push(...youtube.map(v => youtubeToReel(v, category)));
      source = source === 'pexels' ? 'mixed' : 'youtube';
    }
  }

  return { reels: results, source };
}

export async function searchExternalByCategory(category: string, maxResults: number = 8): Promise<SearchReelsResult> {
  return searchExternalVideos('', category, maxResults);
}

export function isYouTubeReel(reel: Reel): boolean {
  return reel.id.startsWith('yt-');
}

export function isPexelsReel(reel: Reel): boolean {
  return reel.id.startsWith('pexels-');
}

export function isExternalReel(reel: Reel): boolean {
  return isYouTubeReel(reel) || isPexelsReel(reel);
}

export function getYouTubeWatchUrl(reel: Reel): string {
  if (!isYouTubeReel(reel)) return '';
  const videoId = reel.id.replace('yt-', '');
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function getYouTubeEmbedUrl(reel: Reel): string {
  if (!isYouTubeReel(reel)) return '';
  const videoId = reel.id.replace('yt-', '');
  return `https://www.youtube.com/embed/${videoId}`;
}
