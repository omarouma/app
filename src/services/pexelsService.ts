import { toast } from 'sonner';
import { z } from 'zod';
import env from '@/config/env';

const PEXELS_API_BASE = 'https://api.pexels.com/videos';
const API_KEY = env.VITE_PEXELS_API_KEY;

// Zod schema for validating the API response
const PexelsApiVideoSchema = z.object({
  id: z.number(),
  image: z.string(),
  duration: z.number(),
  user: z.object({
    name: z.string(),
  }),
  video_files: z.array(z.object({
    link: z.string(),
    quality: z.string(),
  })),
});

const PexelsApiResponseSchema = z.object({
  videos: z.array(PexelsApiVideoSchema),
});

// Type for our application's video object
export interface PexelsVideo {
  id: number;
  thumbnail: string;
  duration: number;
  author: string;
  videoUrl: string;
  // Aliases used by YouTubePlayer and feed components
  title: string;
  url: string;
  user: { name: string };
}


const CACHE_KEY = 'gaga_pexels_videos';
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

// Demo Pexels videos as fallback
const DEMO_PEXELS_VIDEOS: PexelsVideo[] = [
  { id: 3054792, thumbnail: 'https://images.pexels.com/videos/3054792/free-video-3054792.jpg?auto=compress&cs=tinysrgb&dpr=1&w=500', duration: 30, author: 'John Doe', videoUrl: 'https://www.pexels.com/video/3054792/download/', title: 'Nature Video 1', url: 'https://www.pexels.com/video/3054792/download/', user: { name: 'John Doe' } },
  { id: 3246245, thumbnail: 'https://images.pexels.com/videos/3246245/free-video-3246245.jpg?auto=compress&cs=tinysrgb&dpr=1&w=500', duration: 25, author: 'Jane Smith', videoUrl: 'https://www.pexels.com/video/3246245/download/', title: 'Nature Video 2', url: 'https://www.pexels.com/video/3246245/download/', user: { name: 'Jane Smith' } },
  { id: 854005, thumbnail: 'https://images.pexels.com/videos/854005/free-video-854005.jpg?auto=compress&cs=tinysrgb&dpr=1&w=500', duration: 15, author: 'Nature Clips', videoUrl: 'https://www.pexels.com/video/854005/download/', title: 'Nature Clips', url: 'https://www.pexels.com/video/854005/download/', user: { name: 'Nature Clips' } },
  { id: 1572418, thumbnail: 'https://images.pexels.com/videos/1572418/free-video-1572418.jpg?auto=compress&cs=tinysrgb&dpr=1&w=500', duration: 45, author: 'City Vibes', videoUrl: 'https://www.pexels.com/video/1572418/download/', title: 'City Vibes', url: 'https://www.pexels.com/video/1572418/download/', user: { name: 'City Vibes' } },
];

function getCachedVideos(): PexelsVideo[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > CACHE_DURATION) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function cacheVideos(data: PexelsVideo[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
  } catch (e) {
    console.warn('[Pexels] Failed to cache videos:', e);
  }
}

function transformToPexelsVideo(apiVideo: z.infer<typeof PexelsApiVideoSchema>): PexelsVideo | null {
  const videoFile = apiVideo.video_files.find(f => f.quality === 'hd') || apiVideo.video_files[0];
  if (!videoFile) return null;

  return {
    id: apiVideo.id,
    thumbnail: apiVideo.image,
    duration: apiVideo.duration,
    author: apiVideo.user.name,
    videoUrl: videoFile.link,
    title: `Pexels Video ${apiVideo.id}`,
    url: videoFile.link,
    user: { name: apiVideo.user.name },
  };
}

async function fetchFromPexels(url: string): Promise<PexelsVideo[]> {
  if (!API_KEY) {
    console.warn('[Pexels] No VITE_PEXELS_API_KEY found; using demo data.');
    return DEMO_PEXELS_VIDEOS;
  }

  try {
    const res = await fetch(url, { headers: { 'Authorization': API_KEY } });
    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[Pexels] API error (${res.status}):`, errorText);
      throw new Error(`Pexels API responded with status ${res.status}`);
    }
    
    const data = await res.json();
    const validation = PexelsApiResponseSchema.safeParse(data);

    if (!validation.success) {
      console.error('[Pexels] Invalid API response structure:', validation.error.flatten());
      throw new Error('Failed to parse Pexels API response.');
    }

    return validation.data.videos
      .map(transformToPexelsVideo)
      .filter((v): v is PexelsVideo => v !== null);

  } catch (err) {
    console.error('[Pexels] Fetch failed:', err);
    toast.error('Could not fetch videos from Pexels. Displaying demo content.');
    return DEMO_PEXELS_VIDEOS;
  }
}

export async function fetchPopularPexelsVideos(perPage = 16): Promise<PexelsVideo[]> {
  const cached = getCachedVideos();
  if (cached) return cached;

  const videos = await fetchFromPexels(`${PEXELS_API_BASE}/popular?per_page=${perPage}`);
  
  if (videos.length > 0) {
    cacheVideos(videos);
  }
  
  return videos;
}

export async function searchPexels(query: string, perPage = 16): Promise<PexelsVideo[]> {
  if (!query.trim()) return [];
  
  const url = `${PEXELS_API_BASE}/search?query=${encodeURIComponent(query)}&per_page=${perPage}`;
  return fetchFromPexels(url);
}

export function clearPexelsCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (e) {
    console.warn('[Pexels] Failed to clear cache:', e);
  }
}