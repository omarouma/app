import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Search, X, User, Hash, MessageSquare, Calendar, ShoppingBag, Users, Loader,
  ArrowRight, TrendingUp, Clock, SlidersHorizontal
} from 'lucide-react';
import { useEnhancedTimelineStore } from '@/store/useEnhancedTimelineStore';
import { useEventStore } from '@/store/useEventStore';
import { useMarketplaceStore } from '@/store/useMarketplaceStore';
import { useGroupStore } from '@/store/useGroupStore';
import { isFirestoreAvailable, queryCollection, COLLECTIONS, where, orderBy, limit } from '@/lib/firestore';
import { getDefaultAvatar, formatTime } from '@/lib/utils';
import type { Chat, TimelinePost, User as UserType, EventData, MarketplaceItem, Hashtag } from '@/types';

const TABS = [
  { key: 'all', label: 'All', icon: Search },
  { key: 'users', label: 'People', icon: User },
  { key: 'posts', label: 'Posts', icon: MessageSquare },
  { key: 'hashtags', label: 'Tags', icon: Hash },
  { key: 'events', label: 'Events', icon: Calendar },
  { key: 'marketplace', label: 'Market', icon: ShoppingBag },
  { key: 'groups', label: 'Groups', icon: Users },
] as const;

type TabKey = typeof TABS[number]['key'];

interface SearchResult {
  id: string;
  type: TabKey;
  title: string;
  subtitle: string;
  image?: string;
  meta?: string;
  data: UserType | TimelinePost | EventData | MarketplaceItem | Chat | Hashtag;
}

export default function SearchPage() {
  const navigate = useNavigate();
  const { searchHashtags } = useEnhancedTimelineStore();
  const { events } = useEventStore();
  const { listings } = useMarketplaceStore();
  const { groups } = useGroupStore();

  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [trendingSearches] = useState([
    'gagachat', 'tech', 'gaming', 'music', 'food', 'travel', 'photography', 'memes', 'coding', 'fitness',
  ]);

  // Load recent searches from localStorage
  useEffect(() => {
    const loadRecentSearches = () => {
      try {
        const saved = localStorage.getItem('gaga-recent-searches');
        if (saved) setRecentSearches(JSON.parse(saved));
      } catch {
        // ignore
      }
    };

    loadRecentSearches();
  }, []);

  const saveRecentSearch = useCallback((q: string) => {
    if (!q.trim()) return;
    setRecentSearches(prev => {
      const next = [q.trim(), ...prev.filter(s => s !== q.trim())].slice(0, 10);
      localStorage.setItem('gaga-recent-searches', JSON.stringify(next));
      return next;
    });
  }, []);

  const performSearch = useCallback(async (q: string) => {
    if (!q.trim() || q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const term = q.trim().toLowerCase();
    const all: SearchResult[] = [];

    try {
      // Search users by name AND username (parallel queries)
      if (activeTab === 'all' || activeTab === 'users') {
        if (isFirestoreAvailable()) {
          const [nameData, usernameData] = await Promise.all([
            queryCollection<UserType>(COLLECTIONS.USERS, [
              where('name', '>=', term),
              where('name', '<=', term + '\uf8ff'),
              limit(20),
            ]),
            queryCollection<UserType>(COLLECTIONS.USERS, [
              where('username', '>=', term),
              where('username', '<=', term + '\uf8ff'),
              limit(20),
            ]),
          ]);
          const userMap = new Map<string, UserType>();
          (nameData || []).forEach((u) => userMap.set(u.id, u));
          (usernameData || []).forEach((u) => userMap.set(u.id, u));
          userMap.forEach((u) => {
            all.push({
              id: u.id,
              type: 'users',
              title: u.name || 'User',
              subtitle: u.username ? '@' + u.username : u.email || '',
              image: u.avatar || getDefaultAvatar(u.name || 'U'),
              meta: u.bio || '',
              data: u,
            });
          });
        }
      }

      // Search posts
      if (activeTab === 'all' || activeTab === 'posts') {
        if (isFirestoreAvailable()) {
          const postData = await queryCollection<TimelinePost>(COLLECTIONS.POSTS, [
            where('content', '>=', term),
            where('content', '<=', term + '\uf8ff'),
            orderBy('createdAt', 'desc'),
            limit(20),
          ]);
          (postData || []).forEach((p) => {
            all.push({
              id: p.id,
              type: 'posts',
              title: p.content?.slice(0, 60) || 'Post',
              subtitle: p.userName || 'User',
              image: p.images?.[0] || undefined,
              meta: p.timestamp ? formatTime(p.timestamp) : '',
              data: p,
            });
          });
        }
      }

      // Search hashtags
      if (activeTab === 'all' || activeTab === 'hashtags') {
        const hashtags = await searchHashtags(term);
        hashtags.forEach((h: Hashtag) => {
          all.push({
            id: h.id,
            type: 'hashtags',
            title: '#' + h.tag,
            subtitle: `${h.postCount.toLocaleString()} posts`,
            meta: h.trending ? 'Trending' : '',
            data: h,
          });
        });
      }

      // Search events
      if (activeTab === 'all' || activeTab === 'events') {
        const eventResults = events.filter(e =>
          e.title.toLowerCase().includes(term) ||
          e.description.toLowerCase().includes(term) ||
          e.location.toLowerCase().includes(term)
        );
        eventResults.forEach((e: EventData) => {
          all.push({
            id: e.id,
            type: 'events',
            title: e.title,
            subtitle: `${e.location} · ${e.startDate.toLocaleDateString()}`,
            meta: `${e.attendees.length} going`,
            data: e,
          });
        });
      }

      // Search marketplace
      if (activeTab === 'all' || activeTab === 'marketplace') {
        const marketResults = listings.filter(l =>
          l.title.toLowerCase().includes(term) ||
          l.description.toLowerCase().includes(term) ||
          l.category.toLowerCase().includes(term)
        );
        marketResults.forEach((l: MarketplaceItem) => {
          all.push({
            id: l.id,
            type: 'marketplace',
            title: l.title,
            subtitle: `৳${l.price.toLocaleString()} · ${l.condition}`,
            image: l.images?.[0] || undefined,
            meta: l.status,
            data: l,
          });
        });
      }

      // Search groups
      if (activeTab === 'all' || activeTab === 'groups') {
        const groupResults = groups.filter((g: Chat) =>
          (g.name || '').toLowerCase().includes(term) ||
          ((g.description || '') as string).toLowerCase().includes(term)
        );
        groupResults.forEach((g) => {
          all.push({
            id: g.id,
            type: 'groups',
            title: g.name || 'Group',
            subtitle: `${g.participants.length} members`,
            meta: 'Group',
            data: g,
          });
        });
      }
    } catch (err) {
      console.error('Search error:', err);
    }

    setResults(all);
    setLoading(false);
  }, [activeTab, events, listings, groups, searchHashtags]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, activeTab, performSearch]);

  const handleResultClick = (result: SearchResult) => {
    saveRecentSearch(query);
    switch (result.type) {
      case 'users':
        navigate('/profile/' + result.id);
        break;
      case 'posts':
        navigate('/timeline', { state: { highlightPostId: result.id } });
        break;
      case 'hashtags':
        if ('tag' in result.data) {
          navigate('/hashtags', { state: { tag: result.data.tag } });
        } else {
          navigate('/hashtags');
        }
        break;
      case 'events':
        navigate('/events', { state: { highlightEventId: result.id } });
        break;
      case 'marketplace':
        navigate('/marketplace', { state: { highlightItemId: result.id } });
        break;
      case 'groups':
        navigate(`/group/${result.id}`);
        break;
    }
  };

  const clearRecents = () => {
    setRecentSearches([]);
    localStorage.removeItem('gaga-recent-searches');
  };

  return (
    <div className="h-full flex flex-col bg-[#0d0d0d]">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-[#1a1a1a]">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-[#1a1a1a] text-[#8D8D8D]">
            <X size={20} />
          </button>
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8D8D8D]" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search people, posts, tags, events..."
              className="w-full bg-[#1a1a1a] text-white pl-10 pr-10 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-[#8D8D8D]"
              autoFocus
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8D8D8D]">
                <X size={14} />
              </button>
            )}
          </div>
          <button type="button" className="p-2 rounded-lg hover:bg-[#1a1a1a] text-[#8D8D8D]">
            <SlidersHorizontal size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3 overflow-x-auto scrollbar-hide">
          {TABS.map(tab => (
            <button type="button" key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.key ? 'bg-[#00C300] text-black' : 'bg-[#1a1a1a] text-[#8D8D8D]'
              }`}
            >
              <tab.icon size={12} /> {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-nav">
        {!query && (
          <div className="p-4">
            {/* Recent searches */}
            {recentSearches.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-[#8D8D8D] uppercase tracking-wider">Recent</h3>
                  <button type="button" onClick={clearRecents} className="text-xs text-[#FF3B30]">Clear</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recentSearches.map((s, i) => (
                    <button type="button" key={i}
                      onClick={() => setQuery(s)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#1a1a1a] text-[#8D8D8D] text-xs hover:bg-[#2a2a2a]"
                    >
                      <Clock size={10} /> {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Trending searches */}
            <div>
              <h3 className="text-xs font-semibold text-[#8D8D8D] uppercase tracking-wider mb-2">Trending</h3>
              <div className="flex flex-wrap gap-2">
                {trendingSearches.map((s, i) => (
                  <button type="button" key={i}
                    onClick={() => setQuery(s)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#1a1a1a] text-[#00C300] text-xs hover:bg-[#2a2a2a]"
                  >
                    <TrendingUp size={10} /> {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <Loader size={24} className="text-[#00C300] animate-spin" />
          </div>
        )}

        {/* Results */}
        {!loading && query && results.length === 0 && (
          <div className="text-center py-16">
            <Search size={48} className="mx-auto text-[#2a2a2a] mb-4" />
            <p className="text-[#8D8D8D] font-medium">No results found</p>
            <p className="text-[#8D8D8D]/60 text-sm mt-1">Try different keywords</p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="p-4 space-y-2">
            {results.map((result, i) => (
              <motion.button
                key={`${result.type}-${result.id}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => handleResultClick(result)}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#1a1a1a] hover:bg-[#2a2a2a] transition-colors text-left"
              >
                {result.image ? (
                  <img src={result.image} alt="Cover image" className="w-12 h-12 rounded-xl object-cover bg-[#2a2a2a] shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-[#2a2a2a] flex items-center justify-center shrink-0">
                    {(() => {
                      const TabIcon = TABS.find(t => t.key === result.type)?.icon || Search;
                      return <TabIcon size={20} className="text-[#8D8D8D]" />;
                    })()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{result.title}</p>
                  <p className="text-[#8D8D8D] text-xs truncate">{result.subtitle}</p>
                </div>
                <div className="text-right shrink-0">
                  {result.meta && (
                    <span className="text-[10px] text-[#00C300] bg-[#00C300]/10 px-2 py-0.5 rounded-full">{result.meta}</span>
                  )}
                  <ArrowRight size={14} className="text-[#8D8D8D] mt-1 ml-auto" />
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
