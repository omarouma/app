import { toast } from 'sonner';

const PEXELS_API_BASE = 'https://api.pexels.com/videos';
const API_KEY = import.meta.env.VITE_PEXELS_API_KEY;

interface PexelsApiVideoFile {
  link?: string;
}

interface PexelsApiVideoUser {
  id?: number;
  name?: string;
  url?: string;
}

interface PexelsApiVideo {
  id?: number;
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  duration?: number;
  width?: number;
  height?: number;
  video_files?: PexelsApiVideoFile[];
  user?: PexelsApiVideoUser;
}

export interface PexelsVideo {
  id: number;
  title: string;
  description: string;
  thumbnail: string;
  url: string;
  videoUrl: string;
  duration: number;
  width: number;
  height: number;
  user: {
    id: number;
    name: string;
    url: string;
  };
}

const CACHE_KEY = 'gaga_pexels_videos';
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

// Demo Pexels videos as fallback
const DEMO_PEXELS_VIDEOS: PexelsVideo[] = [
  {
    id: 3054792,
    title: 'Beautiful Nature Landscape',
    description: 'Scenic footage of mountains and lakes.',
    thumbnail: 'https://images.pexels.com/videos/3054792/3054792-hd.mp4?auto=compress&cs=tinysrgb&w=1200',
    url: 'https://www.pexels.com/video/beautiful-nature-landscape-3054792/',
    videoUrl: 'https://www.pexels.com/video/beautiful-nature-landscape-3054792/',
    duration: 30,
    width: 1920,
    height: 1080,
    user: { id: 12345, name: 'John Doe', url: 'https://pexels.com/@john-doe' }
  },
  {
    id: 3246245,
    title: 'Urban City Timelapse',
    description: 'Busy city streets at night.',
    thumbnail: 'https://images.pexels.com/videos/3246245/3246245-hd.mp4?auto=compress&cs=tinysrgb&w=1200',
    url: 'https://www.pexels.com/video/urban-city-timelapse-3246245/',
    videoUrl: 'https://www.pexels.com/video/urban-city-timelapse-3246245/',
    duration: 25,
    width: 1920,
    height: 1080,
    user: { id: 67890, name: 'Jane Smith', url: 'https://pexels.com/@jane-smith' }
  },
];

function getCached(): PexelsVideo[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > CACHE_DURATION) return null;
    return data;
  } catch {
    return null;
  }
}

function setCached(data: PexelsVideo[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
  } catch {
    // ignore
  }
}

function parsePexelsResponse(items: PexelsApiVideo[]): PexelsVideo[] {
  return items.map(item => {
    const thumbnail = item.image || item.video_files?.[0]?.link || '';
    const url = item.url || item.video_files?.[0]?.link || '';
    return {
      id: item.id || 0,
      title: item.title || item.user?.name || 'Untitled Video',
      description: item.description || '',
      thumbnail,
      url,
      videoUrl: url,
      duration: item.duration || 0,
      width: item.width || 0,
      height: item.height || 0,
      user: {
        id: item.user?.id || 0,
        name: item.user?.name || 'Unknown',
        url: item.user?.url || ''
      }
    };
  });
}

export async function fetchPopularPexelsVideos(perPage = 16): Promise<PexelsVideo[]> {
  const cached = getCached();
  if (cached) return cached;

  if (!API_KEY) {
    console.warn('[Pexels] No VITE_PEXELS_API_KEY found; using demo data.');
    setCached(DEMO_PEXELS_VIDEOS);
    return DEMO_PEXELS_VIDEOS;
  }

  try {
    const url = `${PEXELS_API_BASE}/popular?per_page=${perPage}`;
    const res = await fetch(url, {
      headers: { 'Authorization': API_KEY }
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('[Pexels] API error:', err);
      throw new Error('Pexels API error');
    }
    const data = await res.json();
    const items = data.videos || [];
    const parsed = parsePexelsResponse(items);
    setCached(parsed);
    return parsed;
  } catch (err) {
    console.error('[Pexels] Failed to fetch videos:', err);
    toast.error('Pexels feed unavailable. Showing demo videos.');
    setCached(DEMO_PEXELS_VIDEOS);
    return DEMO_PEXELS_VIDEOS;
  }
}

export async function searchPexels(query: string, perPage = 16): Promise<PexelsVideo[]> {
  if (!API_KEY) {
    const q = query.toLowerCase();
    return DEMO_PEXELS_VIDEOS.filter(v => v.title.toLowerCase().includes(q) || v.user.name.toLowerCase().includes(q));
  }

  try {
    const url = `${PEXELS_API_BASE}/search?query=${encodeURIComponent(query)}&per_page=${perPage}`;
    const res = await fetch(url, {
      headers: { 'Authorization': API_KEY }
    });
    if (!res.ok) throw new Error('Pexels search error');
    const data = await res.json();
    return parsePexelsResponse(data.videos || []);
  } catch (err) {
    console.error('[Pexels] Search failed:', err);
    const q = query.toLowerCase();
    return DEMO_PEXELS_VIDEOS.filter(v => v.title.toLowerCase().includes(q));
  }
}

export function clearPexelsCache() {
  localStorage.removeItem(CACHE_KEY);
}
