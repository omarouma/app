import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar, MapPin, Users, DollarSign, Plus, Search, Filter,
  ChevronLeft, X, Check, Clock, MoreVertical
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useEventStore } from '@/store/useEventStore';
import { toast } from 'sonner';
import BottomNav from '@/components/layout/BottomNav';
import EmptyState from '@/components/EmptyState';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import { getDefaultAvatar } from '@/lib/utils';
import type { EventData } from '@/types';

type EventTab = 'upcoming' | 'my-events' | 'past' | 'nearby';

const tabs: { key: EventTab; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'my-events', label: 'My Events' },
  { key: 'past', label: 'Past' },
  { key: 'nearby', label: 'Nearby' },
];

const categories = ['All', 'Music', 'Sports', 'Tech', 'Food', 'Art', 'Business', 'Party', 'Other'];

export default function EventsPage() {
  const { user } = useAuthStore();
  const { events, myEvents, loading, getUpcomingEvents, getMyEvents, getNearbyEvents, subscribeEvents, joinEvent, leaveEvent, maybeEvent, createEvent } = useEventStore();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<EventTab>('upcoming');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showFilters, setShowFilters] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createLocation, setCreateLocation] = useState('');
  const [createStart, setCreateStart] = useState('');
  const [createEnd, setCreateEnd] = useState('');
  const [createCategory, setCreateCategory] = useState('Other');
  const [createCapacity, setCreateCapacity] = useState('');
  const [createCost, setCreateCost] = useState('');
  const [createPrivacy, setCreatePrivacy] = useState<'public' | 'friends' | 'private'>('public');
  const [createIsOnline, setCreateIsOnline] = useState(false);
  const [creating, setCreating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch events based on tab
  useEffect(() => {
    if (activeTab === 'upcoming') {
      getUpcomingEvents(50);
    } else if (activeTab === 'my-events' && user?.id) {
      getMyEvents(user.id);
    } else if (activeTab === 'nearby') {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => {
            const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setUserLocation(loc);
            getNearbyEvents(loc.lat, loc.lng, 50);
          },
          () => {
            // fallback to user profile location
            if (user?.latitude && user?.longitude) {
              const loc = { lat: user.latitude, lng: user.longitude };
              setUserLocation(loc);
              getNearbyEvents(loc.lat, loc.lng, 50);
            }
          }
        );
      } else if (user?.latitude && user?.longitude) {
        const loc = { lat: user.latitude, lng: user.longitude };
        queueMicrotask(() => setUserLocation(loc));
        getNearbyEvents(loc.lat, loc.lng, 50);
      }
    }
  }, [activeTab, user?.id, user?.latitude, user?.longitude, getUpcomingEvents, getMyEvents, getNearbyEvents]);

  // Subscribe to events for real-time updates
  useEffect(() => {
    const unsub = subscribeEvents();
    return () => unsub();
  }, [subscribeEvents]);

  const now = new Date();

  const filteredEvents = (activeTab === 'my-events' ? myEvents : events).filter(event => {
    const isUpcoming = new Date(event.startDate) > now;
    const isPast = new Date(event.endDate) < now;

    if (activeTab === 'upcoming' && !isUpcoming) return false;
    if (activeTab === 'past' && !isPast) return false;
    if (activeTab === 'nearby' && !userLocation) return false;

    if (selectedCategory !== 'All' && event.category !== selectedCategory) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        event.title.toLowerCase().includes(q) ||
        event.description.toLowerCase().includes(q) ||
        event.location.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getRSVPStatus = (event: EventData) => {
    if (!user?.id) return 'none';
    if (event.attendees.includes(user.id)) return 'going';
    if (event.maybes.includes(user.id)) return 'maybe';
    if (event.notGoing.includes(user.id)) return 'not-going';
    return 'none';
  };

  const handleRSVP = async (event: EventData, status: 'going' | 'maybe' | 'not-going') => {
    if (!user?.id) return;
    const current = getRSVPStatus(event);
    if (status === 'going') {
      if (current === 'going') return;
      await joinEvent(event.id, user.id);
    } else if (status === 'maybe') {
      if (current === 'maybe') return;
      await maybeEvent(event.id, user.id);
    } else {
      if (current === 'not-going') return;
      await leaveEvent(event.id, user.id);
    }
    // Refresh
    if (activeTab === 'upcoming') getUpcomingEvents(50);
    if (activeTab === 'my-events') getMyEvents(user.id);
  };

  const handleCreateEvent = async () => {
    if (!user?.id) return;
    if (!createTitle.trim() || !createLocation.trim() || !createStart || !createEnd) {
      toast.error('Please fill in title, location, start and end dates');
      return;
    }
    const startDate = new Date(createStart);
    const endDate = new Date(createEnd);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      toast.error('Invalid dates');
      return;
    }
    if (endDate <= startDate) {
      toast.error('End date must be after start date');
      return;
    }
    setCreating(true);
    try {
      await createEvent(user.id, {
        title: createTitle.trim(),
        description: createDesc.trim(),
        location: createLocation.trim(),
        lat: userLocation?.lat,
        lng: userLocation?.lng,
        startDate,
        endDate,
        privacy: createPrivacy,
        cost: createCost ? parseFloat(createCost) : undefined,
        currency: 'BDT',
        isOnline: createIsOnline,
        category: createCategory,
        capacity: createCapacity ? parseInt(createCapacity) : undefined,
        coverImage: undefined,
      });
      toast.success('Event created!');
      setShowCreateModal(false);
      setCreateTitle('');
      setCreateDesc('');
      setCreateLocation('');
      setCreateStart('');
      setCreateEnd('');
      setCreateCost('');
      setCreateCapacity('');
      setCreatePrivacy('public');
      setCreateIsOnline(false);
      setCreateCategory('Other');
      if (activeTab === 'upcoming') getUpcomingEvents(50);
      if (activeTab === 'my-events') getMyEvents(user.id);
    } catch (e) {
      toast.error('Failed to create event');
      console.error(e);
    } finally {
      setCreating(false);
    }
  };

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="h-full flex flex-col bg-[#0d0d0d]">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a]">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => navigate(-1)} className="text-white p-1">
            <ChevronLeft size={22} />
          </button>
          <h1 className="text-lg font-bold text-white">Events</h1>
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
            <Filter size={18} />
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
                  placeholder="Search events..."
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

      {/* Category pills */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-2 border-b border-[#1a1a1a] flex gap-2 overflow-x-auto">
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs */}
      <div className="shrink-0 flex gap-1 px-4 py-2 border-b border-[#1a1a1a] overflow-x-auto">
        {tabs.map(t => (
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

      {/* Event list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
        {loading && filteredEvents.length === 0 && <LoadingSkeleton />}

        {!loading && filteredEvents.length === 0 && (
          <EmptyState
            icon={Calendar}
            title="No events found"
            description={activeTab === 'nearby' ? 'Try enabling location or selecting a different tab.' : 'Be the first to create an event!'}
          />
        )}

        {filteredEvents.map(event => {
          const rsvp = getRSVPStatus(event);
          const isUpcoming = new Date(event.startDate) > now;
          return (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#1a1a1a] rounded-2xl overflow-hidden"
            >
              {/* Cover image */}
              <div className="h-40 bg-[#2a2a2a] relative">
                {event.coverImage ? (
                  <img src={event.coverImage} alt={event.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1a1a1a] to-[#2a2a2a]">
                    <Calendar size={40} className="text-[#8D8D8D]" />
                  </div>
                )}
                <div className="absolute top-3 left-3">
                  <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
                    isUpcoming ? 'bg-[#00C300] text-black' : 'bg-[#8D8D8D] text-white'
                  }`}>
                    {isUpcoming ? 'Upcoming' : 'Past'}
                  </span>
                </div>
                {event.privacy !== 'public' && (
                  <div className="absolute top-3 right-3">
                    <span className="px-2 py-1 rounded-lg text-xs font-medium bg-black/50 text-white">
                      {event.privacy === 'friends' ? 'Friends' : 'Private'}
                    </span>
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-semibold text-base leading-tight mb-1">{event.title}</h3>
                    <p className="text-[#8D8D8D] text-sm line-clamp-2 mb-2">{event.description}</p>
                  </div>
                  <button type="button" className="text-[#8D8D8D] p-1">
                    <MoreVertical size={18} />
                  </button>
                </div>

                <div className="flex flex-col gap-1.5 mb-3">
                  <div className="flex items-center gap-2 text-[#8D8D8D] text-xs">
                    <Calendar size={14} className="text-[#00C300]" />
                    <span>{formatDate(event.startDate)}</span>
                    {event.endDate && (
                      <span> - {formatDate(event.endDate)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[#8D8D8D] text-xs">
                    <MapPin size={14} className="text-[#00C300]" />
                    <span>{event.location}</span>
                    {event.isOnline && (
                      <span className="text-[#00C300]">(Online)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[#8D8D8D] text-xs">
                    <Users size={14} className="text-[#00C300]" />
                    <span>{event.attendees.length} going</span>
                    {event.capacity && (
                      <span>• {event.capacity - event.attendees.length} spots left</span>
                    )}
                  </div>
                  {event.cost !== undefined && event.cost > 0 && (
                    <div className="flex items-center gap-2 text-[#8D8D8D] text-xs">
                      <DollarSign size={14} className="text-[#00C300]" />
                      <span>{event.cost} {event.currency}</span>
                    </div>
                  )}
                </div>

                {/* Host info */}
                <div className="flex items-center gap-2 mb-3">
                  <img
                    src={event.userAvatar || getDefaultAvatar(event.userId)}
                    alt="User avatar"
                    className="w-6 h-6 rounded-full object-cover"
                  />
                  <span className="text-white text-xs">{event.userName || 'Host'}</span>
                </div>

                {/* RSVP buttons */}
                {isUpcoming && (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => handleRSVP(event, 'going')}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-colors ${
                        rsvp === 'going'
                          ? 'bg-[#00C300] text-black'
                          : 'bg-[#2a2a2a] text-white hover:bg-[#333]'
                      }`}
                    >
                      <Check size={14} /> Going
                    </button>
                    <button type="button" onClick={() => handleRSVP(event, 'maybe')}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-colors ${
                        rsvp === 'maybe'
                          ? 'bg-yellow-500 text-black'
                          : 'bg-[#2a2a2a] text-white hover:bg-[#333]'
                      }`}
                    >
                      <Clock size={14} /> Maybe
                    </button>
                    <button type="button" onClick={() => handleRSVP(event, 'not-going')}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-colors ${
                        rsvp === 'not-going'
                          ? 'bg-red-500 text-white'
                          : 'bg-[#2a2a2a] text-white hover:bg-[#333]'
                      }`}
                    >
                      <X size={14} /> Not Going
                    </button>
                  </div>
                )}

                {!isUpcoming && (
                  <div className="text-[#8D8D8D] text-xs text-center py-2">
                    Event has ended
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Create Event FAB */}
      <button type="button" onClick={() => setShowCreateModal(true)}
        className="fixed bottom-20 right-4 z-30 w-12 h-12 rounded-full bg-[#00C300] text-black flex items-center justify-center shadow-lg hover:bg-[#00C300]/90 transition-colors"
      >
        <Plus size={22} />
      </button>

      {/* Create Event Modal */}
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
                <h2 className="text-lg font-bold text-white">Create Event</h2>
                <button type="button" onClick={() => setShowCreateModal(false)} className="text-[#8D8D8D] p-1">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-3">
                <input
                  type="text" placeholder="Event title *"
                  value={createTitle} onChange={e => setCreateTitle(e.target.value)}
                  className="w-full bg-[#0d0d0d] text-white px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300]"
                />
                <textarea
                  placeholder="Description"
                  value={createDesc} onChange={e => setCreateDesc(e.target.value)}
                  rows={3}
                  className="w-full bg-[#0d0d0d] text-white px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300] resize-none"
                />
                <input
                  type="text" placeholder="Location *"
                  value={createLocation} onChange={e => setCreateLocation(e.target.value)}
                  className="w-full bg-[#0d0d0d] text-white px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300]"
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[#8D8D8D] text-xs mb-1 block">Start *</label>
                    <input
                      type="datetime-local"
                      value={createStart} onChange={e => setCreateStart(e.target.value)}
                      className="w-full bg-[#0d0d0d] text-white px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300]"
                    />
                  </div>
                  <div>
                    <label className="text-[#8D8D8D] text-xs mb-1 block">End *</label>
                    <input
                      type="datetime-local"
                      value={createEnd} onChange={e => setCreateEnd(e.target.value)}
                      className="w-full bg-[#0d0d0d] text-white px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300]"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={createCategory} onChange={e => setCreateCategory(e.target.value)}
                    className="w-full bg-[#0d0d0d] text-white px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300]"
                  >
                    {categories.filter(c => c !== 'All').map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <select
                    value={createPrivacy} onChange={e => setCreatePrivacy(e.target.value as 'public' | 'friends' | 'private')}
                    className="w-full bg-[#0d0d0d] text-white px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300]"
                  >
                    <option value="public">Public</option>
                    <option value="friends">Friends</option>
                    <option value="private">Private</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number" placeholder="Capacity (optional)"
                    value={createCapacity} onChange={e => setCreateCapacity(e.target.value)}
                    className="w-full bg-[#0d0d0d] text-white px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300]"
                  />
                  <input
                    type="number" placeholder="Cost (optional)"
                    value={createCost} onChange={e => setCreateCost(e.target.value)}
                    className="w-full bg-[#0d0d0d] text-white px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300]"
                  />
                </div>
                <label className="flex items-center gap-2 text-white text-sm cursor-pointer">
                  <input
                    type="checkbox" checked={createIsOnline} onChange={e => setCreateIsOnline(e.target.checked)}
                    className="w-4 h-4 accent-[#00C300]"
                  />
                  Online event
                </label>
                <button
                  type="button" onClick={handleCreateEvent}
                  disabled={creating || !createTitle.trim() || !createLocation.trim() || !createStart || !createEnd}
                  className="w-full py-3 rounded-xl bg-[#00C300] text-black font-semibold text-sm hover:bg-[#00C300]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {creating ? 'Creating...' : 'Create Event'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
}
