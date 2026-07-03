import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Bookmark, Trash2, Search, X, MessageCircle,
  Image as ImageIcon, MapPin, File, Clock
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useSavedMessages } from '@/hooks/useSavedMessages';
import { formatTime } from '@/lib/utils';
import { toast } from 'sonner';

export default function SavedMessagesPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { saved, unsaveMessage, clearAll } = useSavedMessages(user?.id);
  const [search, setSearch] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const filtered = saved.filter(s =>
    s.content.toLowerCase().includes(search.toLowerCase()) ||
    s.senderName.toLowerCase().includes(search.toLowerCase())
  );

  const iconForType = (type: string) => {
    switch (type) {
      case 'image': return <ImageIcon size={16} className="text-[#00C300]" />;
      case 'video': return <ImageIcon size={16} className="text-[#FF3B30]" />;
      case 'file': return <File size={16} className="text-[#8B5CF6]" />;
      case 'location': return <MapPin size={16} className="text-[#FF3B30]" />;
      case 'voice': return <MessageCircle size={16} className="text-[#2196F3]" />;
      default: return <MessageCircle size={16} className="text-[#8D8D8D]" />;
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#F5F5F5]">
      {/* Header */}
      <div className="bg-white border-b border-[#EBEBEB] sticky top-0 z-10">
        <div className="flex items-center gap-3 p-4">
          <button type="button" onClick={() => navigate(-1)} className="p-2 -ml-2 hover:bg-[#F5F5F5] rounded-full text-[#111111]">
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-lg font-bold text-[#111111] flex-1">Saved Messages</h1>
          {saved.length > 0 && (
            <button type="button" onClick={() => setShowConfirm(true)}
              className="text-[#FF3B30] text-sm font-medium"
            >
              Clear All
            </button>
          )}
        </div>
        <div className="px-4 pb-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8D8D8D]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search saved messages..."
              className="w-full bg-[#F5F5F5] rounded-xl pl-9 pr-9 py-2.5 text-sm text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-[#8D8D8D]"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8D8D8D]">
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <Bookmark size={48} className="text-[#C7C7CC] mx-auto mb-3" />
            <p className="text-[#8D8D8D] text-sm">
              {search ? 'No messages match your search' : 'No saved messages yet'}
            </p>
            <p className="text-[#C7C7CC] text-xs mt-1">
              {search ? 'Try a different search term' : 'Long press a message and tap Save'}
            </p>
          </div>
        ) : (
          filtered.map((msg, i) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="bg-white rounded-xl border border-[#EBEBEB] p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center gap-2 mb-2">
                {iconForType(msg.type)}
                <p className="text-[#111111] text-sm font-medium">{msg.senderName}</p>
                <span className="text-[#C7C7CC] text-xs ml-auto">{formatTime(msg.timestamp)}</span>
              </div>
              <p className="text-[#111111] text-sm whitespace-pre-wrap break-words">{msg.content}</p>
              {msg.mediaUrl && msg.type === 'image' && (
                <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="mt-2 block">
                  <img src={msg.mediaUrl} className="rounded-lg max-h-48 object-cover" alt="Shared image" />
                </a>
              )}
              {msg.mediaUrl && msg.type === 'video' && (
                <video src={msg.mediaUrl} className="mt-2 rounded-lg max-h-48 w-full" controls />
              )}
              <div className="flex items-center justify-between mt-3">
                <span className="text-[#8D8D8D] text-[10px] flex items-center gap-1">
                  <Clock size={10} /> Saved {new Date(msg.savedAt).toLocaleDateString()}
                </span>
                <button type="button" onClick={() => {
                    unsaveMessage(msg.id);
                    toast.success('Message removed');
                  }}
                  className="text-[#FF3B30] text-xs flex items-center gap-1 hover:bg-[#FF3B30]/10 px-2 py-1 rounded-lg transition-colors"
                >
                  <Trash2 size={12} /> Remove
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Clear All Confirm */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-[#111111] mb-2">Clear All Saved?</h3>
              <p className="text-[#8D8D8D] text-sm mb-4">This will remove all saved messages. This cannot be undone.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowConfirm(false)}
                  className="flex-1 py-3 bg-[#F5F5F5] text-[#111111] rounded-xl text-sm font-bold"
                >
                  Cancel
                </button>
                <button type="button" onClick={() => { clearAll(); setShowConfirm(false); toast.success('All saved messages cleared'); }}
                  className="flex-1 py-3 bg-[#FF3B30] text-white rounded-xl text-sm font-bold"
                >
                  Clear All
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
