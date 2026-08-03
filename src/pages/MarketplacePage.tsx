import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Plus, Heart, MapPin, Tag, X, ChevronLeft,
  SlidersHorizontal
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useMarketplaceStore } from '@/store/useMarketplaceStore';
import { useChatStore } from '@/store/useChatStore';
import { toast } from 'sonner';
import EmptyState from '@/components/EmptyState';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import { getDefaultAvatar } from '@/lib/utils';
import type { MarketplaceItem } from '@/types';

const categories = [
  'All', 'Electronics', 'Fashion', 'Vehicles', 'Home', 'Sports',
  'Books', 'Toys', 'Health', 'Services', 'Jobs', 'Other'
];

const conditionLabels: Record<string, string> = {
  new: 'New',
  like_new: 'Like New',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
};

const conditionColors: Record<string, string> = {
  new: 'bg-[#00C300] text-black',
  like_new: 'bg-[#00C300]/80 text-black',
  good: 'bg-blue-500 text-white',
  fair: 'bg-yellow-500 text-black',
  poor: 'bg-red-500 text-white',
};

export default function MarketplacePage() {
  const { user } = useAuthStore();
  const {
    listings, loading, getListings, getMyListings, getFavorites, getNearbyListings,
    addToFavorites, removeFromFavorites, subscribeListings, createListing
  } = useMarketplaceStore();
  const { createDirectChat } = useChatStore();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'my' | 'favorites' | 'nearby'>('all');
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(new Set());
  const [priceSort, setPriceSort] = useState<'none' | 'low' | 'high'>('none');
  const [, setUserLocation] = useState<{lat: number; lng: number} | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedListing, setSelectedListing] = useState<MarketplaceItem | null>(null);
  const [createTitle, setCreateTitle] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createPrice, setCreatePrice] = useState('');
  const [createCategory, setCreateCategory] = useState('Other');
  const [createCondition, setCreateCondition] = useState<'new' | 'like_new' | 'good' | 'fair' | 'poor'>('good');
  const [createLocation, setCreateLocation] = useState('');
  const [createIsNegotiable, setCreateIsNegotiable] = useState(false);
  const [creating, setCreating] = useState(false);

  // Initial load + subscribe
  useEffect(() => {
    getListings(selectedCategory === 'All' ? undefined : selectedCategory, 50);
    const unsub = subscribeListings();
    return () => unsub();
  }, [getListings, selectedCategory, subscribeListings]);

  // Update favoritedIds when user changes or listings change
  useEffect(() => {
    if (!user?.id) return;
    const favs = new Set<string>();
    listings.forEach(l => {
      if (l.favorites.includes(user.id)) favs.add(l.id);
    });
    queueMicrotask(() => setFavoritedIds(favs));
  }, [listings, user?.id]);

  // Handle tab changes (skip 'all' since initial load covers it)
  useEffect(() => {
    if (activeTab === 'my' && user?.id) {
      getMyListings(user.id);
    } else if (activeTab === 'favorites' && user?.id) {
      getFavorites(user.id);
    } else if (activeTab === 'nearby') {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => {
            const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setUserLocation(loc);
            getNearbyListings(loc.lat, loc.lng, 50);
          },
          () => {
            if (user?.latitude && user?.longitude) {
              const loc = { lat: user.latitude, lng: user.longitude };
              setUserLocation(loc);
              getNearbyListings(loc.lat, loc.lng, 50);
            }
          }
        );
      } else if (user?.latitude && user?.longitude) {
        const loc = { lat: user.latitude, lng: user.longitude };
        queueMicrotask(() => setUserLocation(loc));
        getNearbyListings(loc.lat, loc.lng, 50);
      }
    }
  }, [activeTab, user?.id, user?.latitude, user?.longitude, getMyListings, getFavorites, getNearbyListings]);

  const handleFavorite = async (item: MarketplaceItem) => {
    if (!user?.id) return;
    const isFav = favoritedIds.has(item.id);
    if (isFav) {
      await removeFromFavorites(item.id, user.id);
      setFavoritedIds(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    } else {
      await addToFavorites(item.id, user.id);
      setFavoritedIds(prev => new Set(prev).add(item.id));
    }
  };

  const handleCreateListing = async () => {
    if (!user?.id) return;
    if (!createTitle.trim() || !createPrice.trim() || !createLocation.trim()) {
      toast.error('Please fill in title, price, and location');
      return;
    }
    const price = parseFloat(createPrice);
    if (isNaN(price) || price <= 0) {
      toast.error('Invalid price');
      return;
    }
    setCreating(true);
    try {
      await createListing(user.id, {
        title: createTitle.trim(),
        description: createDesc.trim(),
        price,
        currency: 'USD',
        images: [],
        category: createCategory,
        condition: createCondition,
        location: createLocation.trim(),
        isNegotiable: createIsNegotiable,
        tags: [],
      });
      toast.success('Listing created!');
      setShowCreateModal(false);
      setCreateTitle('');
      setCreateDesc('');
      setCreatePrice('');
      setCreateLocation('');
      setCreateIsNegotiable(false);
      setCreateCategory('Other');
      setCreateCondition('good');
      getListings(selectedCategory === 'All' ? undefined : selectedCategory, 50);
    } catch (e) {
      toast.error('Failed to create listing');
      console.error(e);
    } finally {
      setCreating(false);
    }
  };

  const filteredListings = listings.filter(item => {
    if (item.status !== 'active') return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.location.toLowerCase().includes(q) ||
        item.tags?.some(t => t.toLowerCase().includes(q))
      );
    }
    return true;
  }).sort((a, b) => {
    if (priceSort === 'low') return a.price - b.price;
    if (priceSort === 'high') return b.price - a.price;
    return 0;
  });

  return (
    <div className="h-full flex flex-col bg-[#0d0d0d]">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a]">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => navigate(-1)} className="text-white p-1">
            <ChevronLeft size={22} />
          </button>
          <h1 className="text-lg font-bold text-white">Marketplace</h1>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowSearch(!showSearch)}
            className="p-2 rounded-lg hover:bg-[#1a1a1a] text-[#8D8D8D]"
          >
            <Search size={18} />
          </button>
          <button type="button" onClick={() => setShowFilters(!showFilters)}
            className="p-2 rounded-lg hover:bg-[#1a1a1a] text-[#8D8D8D]"
          >
            <SlidersHorizontal size={18} />
          </button>
        </div>
      </div>

      {/* Search bar */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-2 border-b border-[#1a1a1a]">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8D8D8D]" />
                <input
                  type="text"
                  placeholder="Search listings..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-[#1a1a1a] text-white pl-10 pr-4 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300]"
                  autoFocus
                />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8D8D8D]">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-2 border-b border-[#1a1a1a] space-y-2">
              <div className="flex gap-2 overflow-x-auto">
                {categories.map(cat => (
                  <button type="button" key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
                      selectedCategory === cat
                        ? 'bg-[#00C300] text-black'
                        : 'bg-[#1a1a1a] text-[#8D8D8D]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPriceSort(priceSort === 'low' ? 'none' : 'low')}
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    priceSort === 'low' ? 'bg-[#00C300] text-black' : 'bg-[#1a1a1a] text-[#8D8D8D]'
                  }`}
                >
                  Price: Low to High
                </button>
                <button type="button" onClick={() => setPriceSort(priceSort === 'high' ? 'none' : 'high')}
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    priceSort === 'high' ? 'bg-[#00C300] text-black' : 'bg-[#1a1a1a] text-[#8D8D8D]'
                  }`}
                >
                  Price: High to Low
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs */}
      <div className="shrink-0 flex gap-1 px-4 py-2 border-b border-[#1a1a1a] overflow-x-auto">
        {[
          { key: 'all' as const, label: 'All' },
          { key: 'my' as const, label: 'My Listings' },
          { key: 'favorites' as const, label: 'Favorites' },
          { key: 'nearby' as const, label: 'Nearby' },
        ].map(t => (
          <button type="button" key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
              activeTab === t.key ? 'bg-[#00C300] text-black' : 'bg-[#1a1a1a] text-[#8D8D8D]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Product Grid */}
      <div className="flex-1 overflow-y-auto p-3 pb-24">
        {loading && filteredListings.length === 0 && <LoadingSkeleton />}

        {!loading && filteredListings.length === 0 && (
          <EmptyState
            icon={Tag}
            title="No listings found"
            description={activeTab === 'nearby' ? 'Enable location or try a different tab.' : 'Be the first to list something!'}
          />
        )}

        <div className="grid grid-cols-2 gap-3">
          {filteredListings.map(item => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              whileTap={{ scale: 0.98 }}
              className="bg-[#1a1a1a] rounded-xl overflow-hidden cursor-pointer"
              onClick={() => setSelectedListing(item)}
            >
              {/* Image */}
              <div className="aspect-square bg-[#2a2a2a] relative">
                {item.images[0] ? (
                  <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Tag size={32} className="text-[#8D8D8D]" />
                  </div>
                )}
                {/* Favorite button */}
                <button type="button" onClick={e => { e.stopPropagation(); handleFavorite(item); }}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/40 backdrop-blur-sm"
                >
                  <Heart
                    size={16}
                    className={favoritedIds.has(item.id) ? 'text-red-500 fill-red-500' : 'text-white'}
                  />
                </button>
                {/* Condition badge */}
                <span className={`absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold ${conditionColors[item.condition] || 'bg-[#8D8D8D] text-white'}`}>
                  {conditionLabels[item.condition] || item.condition}
                </span>
              </div>

              {/* Info */}
              <div className="p-2.5">
                <div className="flex items-start justify-between gap-1 mb-1">
                  <h3 className="text-white text-sm font-medium line-clamp-2 leading-tight">{item.title}</h3>
                </div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-[#00C300] font-bold text-sm">{item.price} {item.currency}</span>
                  {item.isNegotiable && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#2a2a2a] text-[#8D8D8D]">
                      Negotiable
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-[#8D8D8D] text-xs">
                  <MapPin size={12} />
                  <span className="truncate">{item.location}</span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <img
                    src={item.userAvatar || getDefaultAvatar(item.userId)}
                    alt="User avatar"
                    className="w-5 h-5 rounded-full object-cover"
                  />
                  <span className="text-[#8D8D8D] text-xs truncate">{item.userName || 'Seller'}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Create Listing FAB */}
      <button type="button" onClick={() => setShowCreateModal(true)}
        className="fixed bottom-20 right-4 z-30 w-12 h-12 rounded-full bg-[#00C300] text-black flex items-center justify-center shadow-lg hover:bg-[#00C300]/90 transition-colors"
      >
        <Plus size={22} />
      </button>

      {/* Listing Detail Modal */}
      <AnimatePresence>
        {selectedListing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center"
            onClick={() => setSelectedListing(null)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-[#1a1a1a] w-full max-w-lg rounded-t-2xl sm:rounded-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              {selectedListing.images[0] && (
                <div className="aspect-video bg-[#2a2a2a]">
                  <img src={selectedListing.images[0]} alt={selectedListing.title} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-white">{selectedListing.title}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${conditionColors[selectedListing.condition] || 'bg-[#8D8D8D] text-white'}`}>
                        {conditionLabels[selectedListing.condition] || selectedListing.condition}
                      </span>
                      <span className="text-[#00C300] font-bold">{selectedListing.price} {selectedListing.currency}</span>
                      {selectedListing.isNegotiable && <span className="text-[10px] text-[#8D8D8D]">Negotiable</span>}
                    </div>
                  </div>
                  <button type="button" onClick={() => setSelectedListing(null)} className="text-[#8D8D8D] p-1">
                    <X size={20} />
                  </button>
                </div>
                <p className="text-[#8D8D8D] text-sm leading-relaxed">{selectedListing.description || 'No description provided.'}</p>
                <div className="flex items-center gap-2 text-[#8D8D8D] text-sm">
                  <MapPin size={14} />
                  <span>{selectedListing.location}</span>
                </div>
                <div className="flex items-center gap-2">
                  <img src={selectedListing.userAvatar || getDefaultAvatar(selectedListing.userId)} alt="Seller" className="w-8 h-8 rounded-full object-cover" />
                  <span className="text-white text-sm">{selectedListing.userName || 'Seller'}</span>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button" onClick={() => handleFavorite(selectedListing)}
                    className="flex-1 py-2.5 rounded-xl bg-[#2a2a2a] text-white text-sm font-medium hover:bg-[#333] transition-colors"
                  >
                    {favoritedIds.has(selectedListing.id) ? 'Remove Favorite' : 'Add to Favorites'}
                  </button>
                  <button
                    type="button" onClick={async () => {
                      if (!user?.id || !selectedListing) return;
                      setSelectedListing(null);
                      await createDirectChat(selectedListing.userId, user.id);
                      navigate(`/chat/${selectedListing.userId}`);
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-[#00C300] text-black text-sm font-medium hover:bg-[#00C300]/90 transition-colors"
                  >
                    Chat with Seller
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Listing Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center"
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-[#1a1a1a] w-full max-w-lg rounded-t-2xl sm:rounded-2xl p-4 max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white">Create Listing</h2>
                <button type="button" onClick={() => setShowCreateModal(false)} className="text-[#8D8D8D] p-1">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-3">
                <input
                  type="text" placeholder="Item title *"
                  value={createTitle} onChange={e => setCreateTitle(e.target.value)}
                  className="w-full bg-[#0d0d0d] text-white px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300]"
                />
                <textarea
                  placeholder="Description"
                  value={createDesc} onChange={e => setCreateDesc(e.target.value)}
                  rows={3}
                  className="w-full bg-[#0d0d0d] text-white px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300] resize-none"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number" placeholder="Price *"
                    value={createPrice} onChange={e => setCreatePrice(e.target.value)}
                    className="w-full bg-[#0d0d0d] text-white px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300]"
                  />
                  <select
                    value={createCategory} onChange={e => setCreateCategory(e.target.value)}
                    className="w-full bg-[#0d0d0d] text-white px-3 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300]"
                  >
                    {categories.filter(c => c !== 'All').map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={createCondition} onChange={e => setCreateCondition(e.target.value as 'new' | 'like_new' | 'good' | 'fair' | 'poor')}
                    className="w-full bg-[#0d0d0d] text-white px-3 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300]"
                  >
                    {Object.entries(conditionLabels).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <input
                    type="text" placeholder="Location *"
                    value={createLocation} onChange={e => setCreateLocation(e.target.value)}
                    className="w-full bg-[#0d0d0d] text-white px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300]"
                  />
                </div>
                <label className="flex items-center gap-2 text-white text-sm cursor-pointer">
                  <input
                    type="checkbox" checked={createIsNegotiable} onChange={e => setCreateIsNegotiable(e.target.checked)}
                    className="w-4 h-4 accent-[#00C300]"
                  />
                  Price is negotiable
                </label>
                <button
                  type="button" onClick={handleCreateListing}
                  disabled={creating || !createTitle.trim() || !createPrice.trim() || !createLocation.trim()}
                  className="w-full py-3 rounded-xl bg-[#00C300] text-black font-semibold text-sm hover:bg-[#00C300]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {creating ? 'Creating...' : 'Create Listing'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
