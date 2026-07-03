import type { Reel } from '@/types';

export const REEL_CATEGORIES = [
  'Funny', 'Music', 'Sports', 'Food', 'Travel', 'Dance',
  'Tech', 'Beauty', 'Gaming', 'Education', 'Nature', 'Lifestyle'
] as const;

export type ReelCategory = (typeof REEL_CATEGORIES)[number];

const SAMPLE_VIDEOS = [
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/VolkswagenGTIReview.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
];

const SAMPLE_THUMBNAILS = [
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ElephantsDream.jpg',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerBlazes.jpg',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerEscapes.jpg',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerFun.jpg',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerJoyrides.jpg',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerMeltdowns.jpg',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/Sintel.jpg',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/SubaruOutbackOnStreetAndDirt.jpg',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/TearsOfSteel.jpg',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/VolkswagenGTIReview.jpg',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/WeAreGoingOnBullrun.jpg',
];

const DEMO_CAPTIONS: Record<string, string[]> = {
  Funny: [
    'When you realize it\'s Monday tomorrow 😂',
    'This is literally me every morning ☕️',
    'POV: You finally understood the joke 5 hours later',
    'My brain during an exam 🧠',
  ],
  Music: [
    'This beat hits different 🔥🎵',
    'Vibing to this all day long 🎶',
    'New music drop! What do you think? 🎧',
    'When the bass drops... 💥',
  ],
  Sports: [
    'That winning shot was insane! 🏆',
    'Training hard, dreaming big 💪',
    'Game day energy is unmatched ⚽️',
    'The grind never stops 🏋️‍♂️',
  ],
  Food: [
    'This recipe is a game changer 🍕',
    'Homemade goodness! Who wants a bite? 🍰',
    'Food coma loading... 🍜',
    'Sunday brunch goals 🥞',
  ],
  Travel: [
    'Wanderlust is real ✈️🌍',
    'Hidden gems you need to visit 🏝️',
    'Sunset views that take your breath away 🌅',
    'Adventure is calling! 🏔️',
  ],
  Dance: [
    'New choreography, who dis? 💃',
    'Practice makes perfect 🕺',
    'Dance like nobody\'s watching ✨',
    'This move took 100 tries 😅',
  ],
  Tech: [
    'This gadget blew my mind 🤯',
    'Future is here! 🚀',
    'Tech review: worth it or skip? 📱',
    'Coding life be like... 💻',
  ],
  Beauty: [
    'Glow up transformation ✨',
    'Morning skincare routine 🌸',
    'This look took 5 minutes! 💄',
    'Self-care Sunday 🛁',
  ],
  Gaming: [
    'That clutch moment! 🎮',
    'New high score unlocked 🏅',
    'Gaming setup tour 🖥️',
    'Level up! 🎯',
  ],
  Education: [
    'Learn something new today 📚',
    'This fact will blow your mind 🤓',
    'Study hack that actually works 📝',
    'Knowledge is power! 💡',
  ],
  Nature: [
    'Nature at its finest 🌿',
    'Peaceful moments like this 🍃',
    'Wildlife encounter! 🦋',
    'Chasing waterfalls 🌊',
  ],
  Lifestyle: [
    'Day in my life ☀️',
    'Productive day routine 🗓️',
    'Minimalist living goals 🏠',
    'Finding joy in small things 🌟',
  ],
};

const DEMO_USER_NAMES = [
  'CreativeSoul', 'DailyVibes', 'TrendSetter', 'LaughFactory',
  'MusicLover', 'FoodieLife', 'TravelBug', 'TechGuru',
  'DanceQueen', 'GameMaster', 'NatureLover', 'StyleIcon',
];

const DEMO_AVATARS = [
  'https://api.dicebear.com/7.x/avataaars/svg?seed=CreativeSoul',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=DailyVibes',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=TrendSetter',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=LaughFactory',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=MusicLover',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=FoodieLife',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=TravelBug',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=TechGuru',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=DanceQueen',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=GameMaster',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=NatureLover',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=StyleIcon',
];

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
}

/**
 * Generate demo reels for the feed when there are no real reels.
 * These use public sample videos so new users always have content to watch.
 */
export function generateDemoReels(count = 12): Reel[] {
  const reels: Reel[] = [];

  for (let i = 0; i < count; i++) {
    const category = REEL_CATEGORIES[i % REEL_CATEGORIES.length];
    const captions = DEMO_CAPTIONS[category];
    const caption = captions[Math.floor(seededRandom(i * 7) * captions.length)];
    const userIdx = i % DEMO_USER_NAMES.length;
    const videoIdx = i % SAMPLE_VIDEOS.length;

    reels.push({
      id: `demo-reel-${i}`,
      userId: `demo-user-${userIdx}`,
      videoUrl: SAMPLE_VIDEOS[videoIdx],
      thumbnailUrl: SAMPLE_THUMBNAILS[videoIdx],
      caption,
      musicTitle: i % 3 === 0 ? 'Trending Audio' : undefined,
      duration: 30 + Math.floor(seededRandom(i * 13) * 120),
      likes: Array.from({ length: Math.floor(seededRandom(i * 3) * 500) }, (_, j) => `user-${j}`),
      comments: [],
      shares: [],
      savedBy: [],
      viewedBy: [],
      timestamp: new Date(Date.now() - i * 3600000 * 24),
      userName: DEMO_USER_NAMES[userIdx],
      userAvatar: DEMO_AVATARS[userIdx],
      tags: [category.toLowerCase(), 'trending', 'foryou'],
      viewCount: Math.floor(seededRandom(i * 11) * 10000) + 100,
      category,
    });
  }

  return reels;
}

/**
 * Check if a reel is a demo reel.
 */
export function isDemoReel(reel: Reel): boolean {
  return reel.id.startsWith('demo-reel-');
}

/**
 * Shuffle array using Fisher-Yates algorithm.
 */
export function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Mix reels for "For You" feed - interleave by category for variety.
 */
export function mixForYou(reels: Reel[]): Reel[] {
  // Group by category
  const byCategory: Record<string, Reel[]> = {};
  for (const reel of reels) {
    const cat = reel.category || 'Other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(reel);
  }

  // Interleave: take one from each category, repeat
  const categories = Object.keys(byCategory);
  const mixed: Reel[] = [];
  let round = 0;
  let added = true;

  while (added) {
    added = false;
    for (const cat of categories) {
      const catReels = byCategory[cat];
      if (catReels[round]) {
        mixed.push(catReels[round]);
        added = true;
      }
    }
    round++;
  }

  // If there are leftover reels, append them shuffled
  const seenIds = new Set(mixed.map(r => r.id));
  const leftover = reels.filter(r => !seenIds.has(r.id));
  return [...mixed, ...shuffleArray(leftover)];
}

/**
 * Sort reels by trending (view count + likes weight).
 */
export function sortByTrending(reels: Reel[]): Reel[] {
  return [...reels].sort((a, b) => {
    const scoreA = a.viewCount + (a.likes?.length || 0) * 10;
    const scoreB = b.viewCount + (b.likes?.length || 0) * 10;
    return scoreB - scoreA;
  });
}
