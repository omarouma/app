import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEnhancedTimelineStore } from '@/store/useEnhancedTimelineStore';
import { Heart, ThumbsUp, Laugh, Frown, Flame, Zap, Star, Hand, X } from 'lucide-react';
import type { PostReactions } from '@/types';

interface ReactionsBarProps {
  postId: string;
  userId: string;
  reactions: PostReactions;
  showPicker?: boolean;
  size?: 'sm' | 'md';
}

const REACTION_CONFIG: { key: keyof PostReactions; emoji: string; label: string; color: string; icon: typeof Heart }[] = [
{ key: 'like', emoji: '👍', label: 'Like', color: '#00C300', icon: ThumbsUp },
  { key: 'love', emoji: '❤️', label: 'Love', color: '#ef4444', icon: Heart },
  { key: 'haha', emoji: '😂', label: 'Haha', color: '#f59e0b', icon: Laugh },
  { key: 'wow', emoji: '😮', label: 'Wow', color: '#a855f7', icon: Zap },
  { key: 'sad', emoji: '😢', label: 'Sad', color: '#6366f1', icon: Frown },
  { key: 'angry', emoji: '😡', label: 'Angry', color: '#dc2626', icon: Flame },
  { key: 'clap', emoji: '👏', label: 'Clap', color: '#10b981', icon: Hand },
  { key: 'fire', emoji: '🔥', label: 'Fire', color: '#f97316', icon: Star },
];

export default function ReactionsBar({ postId, userId, reactions, showPicker = true, size = 'md' }: ReactionsBarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { addReaction, removeReaction } = useEnhancedTimelineStore();

  const total = Object.values(reactions).reduce((sum, arr) => sum + (arr?.length || 0), 0);
  const userReaction = REACTION_CONFIG.find((r) => reactions[r.key]?.includes(userId))?.key || null;

  const handleReaction = (key: keyof PostReactions) => {
    if (userReaction === key) {
      removeReaction(postId, userId, key);
    } else {
      addReaction(postId, userId, key);
    }
    setPickerOpen(false);
  };

  const handleEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (showPicker) setPickerOpen(true);
  };

  const handleLeave = () => {
    timerRef.current = setTimeout(() => setPickerOpen(false), 300);
  };

  const activeConfig = REACTION_CONFIG.find((r) => r.key === userReaction);
  const iconSize = size === 'sm' ? 16 : 20;

  return (
    <div className="relative inline-flex items-center gap-1">
      {/* Reaction picker */}
      <AnimatePresence>
        {pickerOpen && showPicker && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white rounded-2xl shadow-2xl border border-gray-100 px-3 py-2 flex items-center gap-1 z-50"
            onMouseEnter={handleEnter}
            onMouseLeave={handleLeave}
          >
            {REACTION_CONFIG.map((config) => (
              <motion.button
                key={config.key}
                whileHover={{ scale: 1.3, y: -4 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => handleReaction(config.key)}
                className="p-1 rounded-full hover:bg-gray-50 transition-colors"
                title={config.label}
              >
                <span className="text-xl leading-none">{config.emoji}</span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main button */}
      <motion.button
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onClick={() => {
          if (userReaction) {
            removeReaction(postId, userId, userReaction);
          } else {
            addReaction(postId, userId, 'like');
          }
        }}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
        whileTap={{ scale: 0.95 }}
      >
        {activeConfig ? (
          <activeConfig.icon size={iconSize} style={{ color: activeConfig.color }} />
        ) : (
          <ThumbsUp size={iconSize} className="text-gray-400" />
        )}
        <span
          className={`text-sm font-medium ${activeConfig ? '' : 'text-gray-500'}`}
          style={activeConfig ? { color: activeConfig.color } : {}}
        >
          {activeConfig ? activeConfig.label : 'Like'}
        </span>
      </motion.button>

      {/* Reaction count summary */}
      {total > 0 && (
        <button type="button" onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1 ml-1 hover:bg-gray-100 px-2 py-1 rounded-lg transition-colors"
        >
          <div className="flex -space-x-1">
            {REACTION_CONFIG.filter((r) => (reactions[r.key]?.length || 0) > 0)
              .slice(0, 3)
              .map((r) => (
                <span key={r.key} className="text-xs bg-white rounded-full shadow-sm border border-gray-100 w-4 h-4 flex items-center justify-center">
                  {r.emoji}
                </span>
              ))}
          </div>
          <span className="text-xs text-gray-500 font-medium">{total}</span>
        </button>
      )}

      {/* Reaction details modal */}
      <AnimatePresence>
        {showDetails && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
            onClick={() => setShowDetails(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl max-w-sm w-full max-h-[70vh] overflow-hidden"
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <h3 className="font-bold text-gray-900">Reactions</h3>
                <button type="button" onClick={() => setShowDetails(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                  <X size={18} className="text-gray-500" />
                </button>
              </div>
              <div className="p-2 space-y-1 overflow-y-auto max-h-[50vh]">
                {REACTION_CONFIG.filter((r) => (reactions[r.key]?.length || 0) > 0).map((r) => (
                  <div key={r.key} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                    <span className="text-lg">{r.emoji}</span>
                    <span className="text-sm font-medium text-gray-700">{r.label}</span>
                    <span className="text-sm text-gray-500 ml-auto">{reactions[r.key]?.length || 0}</span>
                  </div>
                ))}
                {total === 0 && (
                  <p className="text-center text-gray-400 py-8 text-sm">No reactions yet</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
