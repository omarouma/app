import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Search, X, Loader, TrendingUp, Smile } from 'lucide-react';
import env from '@/config/env';

// Default sticker packs
const DEFAULT_STICKERS = [
  { id: 'like', emoji: '👍', category: 'reactions' },
  { id: 'love', emoji: '❤️', category: 'reactions' },
  { id: 'laugh', emoji: '😂', category: 'reactions' },
  { id: 'wow', emoji: '😮', category: 'reactions' },
  { id: 'sad', emoji: '😢', category: 'reactions' },
  { id: 'angry', emoji: '😡', category: 'reactions' },
  { id: 'clap', emoji: '👏', category: 'reactions' },
  { id: 'fire', emoji: '🔥', category: 'reactions' },
  { id: 'party', emoji: '🎉', category: 'celebrations' },
  { id: 'confetti', emoji: '🎊', category: 'celebrations' },
  { id: 'balloon', emoji: '🎈', category: 'celebrations' },
  { id: 'gift', emoji: '🎁', category: 'celebrations' },
  { id: 'cake', emoji: '🎂', category: 'celebrations' },
  { id: 'heart_eyes', emoji: '😍', category: 'emotions' },
  { id: 'cry', emoji: '😭', category: 'emotions' },
  { id: 'blush', emoji: '😊', category: 'emotions' },
  { id: 'kiss', emoji: '😘', category: 'emotions' },
  { id: 'hug', emoji: '🤗', category: 'emotions' },
  { id: 'cool', emoji: '😎', category: 'greetings' },
  { id: 'wave', emoji: '👋', category: 'greetings' },
  { id: 'ok', emoji: '👌', category: 'greetings' },
  { id: 'pray', emoji: '🙏', category: 'greetings' },
  { id: 'rocket', emoji: '🚀', category: 'greetings' },
  { id: '100', emoji: '💯', category: 'celebrations' },
];

const CATEGORIES = [
  { id: 'reactions', label: 'Reactions', icon: '😊' },
  { id: 'celebrations', label: 'Celebrations', icon: '🎉' },
  { id: 'emotions', label: 'Emotions', icon: '❤️' },
  { id: 'greetings', label: 'Greetings', icon: '👋' },
];

// GIF API — key should be set via environment variable
const GIF_API_KEY = env.VITE_TENOR_API_KEY || '';
const GIF_API_URL = 'https://tenor.googleapis.com/v2/search';

interface StickerPickerProps {
  onSelect: (sticker: { type: 'emoji' | 'gif'; content: string }) => void;
  onClose: () => void;
}

export const StickerPicker = memo(function StickerPicker({ onSelect, onClose }: StickerPickerProps) {
  const [activeTab, setActiveTab] = useState<'stickers' | 'gifs'>('stickers');
  const [activeCategory, setActiveCategory] = useState('reactions');
  const [gifQuery, setGifQuery] = useState('');
  const [gifs, setGifs] = useState<string[]>([]);
  const [loadingGifs, setLoadingGifs] = useState(false);
  const [recentGifs, setRecentGifs] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('gaga_recent_gifs');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchGifs = useCallback(async (query: string) => {
    if (!GIF_API_KEY) {
      setGifs([]);
      return;
    }
    if (!query.trim()) {
      setGifs(recentGifs.slice(0, 12));
      return;
    }
    setLoadingGifs(true);
    try {
      const response = await fetch(
        `${GIF_API_URL}?q=${encodeURIComponent(query)}&key=${GIF_API_KEY}&limit=20&media_filter=tinygif`
      );
      const data = await response.json();
      if (data.results) {
        const urls = data.results.map((r: { media_formats?: { tinygif?: { url: string } } }) =>
          r.media_formats?.tinygif?.url || ''
        ).filter(Boolean);
        setGifs(urls);
      }
    } catch {
      setGifs([]);
    }
    setLoadingGifs(false);
  }, [recentGifs]);

  // Debounced GIF search
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      searchGifs(gifQuery);
    }, 500);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [gifQuery, searchGifs]);

  const handleGifSelect = useCallback((url: string) => {
    onSelect({ type: 'gif', content: url });
    // Add to recent
    const updated = [url, ...recentGifs.filter(g => g !== url)].slice(0, 12);
    setRecentGifs(updated);
    try {
      localStorage.setItem('gaga_recent_gifs', JSON.stringify(updated));
    } catch { /* ignore */ }
    onClose();
  }, [onSelect, onClose, recentGifs]);

  const filteredStickers = DEFAULT_STICKERS.filter(s => s.category === activeCategory);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="bg-[#F5F5F5] border-t border-[#EBEBEB]"
    >
      {/* Tab bar */}
      <div className="flex border-b border-[#EBEBEB]">
        <button
          type="button"
          onClick={() => setActiveTab('stickers')}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'stickers' ? 'text-[#00C300] border-b-2 border-[#00C300]' : 'text-[#8D8D8D]'
          }`}
        >
          <Smile size={16} className="inline mr-1" /> Stickers
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('gifs')}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'gifs' ? 'text-[#00C300] border-b-2 border-[#00C300]' : 'text-[#8D8D8D]'
          }`}
        >
          GIFs
        </button>
      </div>

      <div className="h-[280px] overflow-y-auto">
        {activeTab === 'stickers' ? (
          <>
            {/* Category tabs */}
            <div className="flex gap-1 px-3 py-2 overflow-x-auto scrollbar-hide border-b border-[#EBEBEB]">
              {CATEGORIES.map(cat => (
                <button
                  type="button"
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    activeCategory === cat.id
                      ? 'bg-[#00C300] text-white'
                      : 'bg-white text-[#8D8D8D] hover:bg-[#EBEBEB]'
                  }`}
                >
                  <span>{cat.icon}</span> {cat.label}
                </button>
              ))}
            </div>

            {/* Sticker grid */}
            <div className="grid grid-cols-6 gap-2 p-3">
              {filteredStickers.map(sticker => (
                <button
                  type="button"
                  key={sticker.id}
                  onClick={() => {
                    onSelect({ type: 'emoji', content: sticker.emoji });
                    onClose();
                  }}
                  className="w-12 h-12 flex items-center justify-center text-2xl bg-white rounded-xl hover:bg-[#EBEBEB] active:scale-90 transition-all"
                  title={sticker.id}
                >
                  {sticker.emoji}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* GIF Search */}
            <div className="px-3 py-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8D8D8D]" />
                <input
                  value={gifQuery}
                  onChange={e => setGifQuery(e.target.value)}
                  placeholder="Search GIFs..."
                  className="w-full bg-white rounded-xl pl-9 pr-3 py-2 text-sm text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-[#8D8D8D]"
                />
                {gifQuery && (
                  <button type="button" onClick={() => setGifQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8D8D8D]">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* GIF grid */}
            <div className="px-3 pb-3">
              {loadingGifs ? (
                <div className="flex items-center justify-center py-8">
                  <Loader size={20} className="animate-spin text-[#00C300]" />
                </div>
              ) : gifs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-[#8D8D8D]">
                  <TrendingUp size={24} className="mb-2" />
                  <p className="text-xs">Search for GIFs or try trending ones</p>
                  <div className="flex gap-2 mt-3">
                    {['hello', 'thanks', 'lol', 'good morning'].map(tag => (
                      <button
                        type="button"
                        key={tag}
                        onClick={() => setGifQuery(tag)}
                        className="px-2 py-1 bg-white rounded-full text-xs text-[#8D8D8D] hover:bg-[#EBEBEB] capitalize"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {gifs.map((url, i) => (
                    <button
                      type="button"
                      key={`${url}-${i}`}
                      onClick={() => handleGifSelect(url)}
                      className="aspect-video bg-[#EBEBEB] rounded-lg overflow-hidden hover:opacity-80 transition-opacity"
                    >
                      <img src={url} className="w-full h-full object-cover" alt={`GIF ${i + 1}`} loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
});