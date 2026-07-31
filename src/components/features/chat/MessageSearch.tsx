import { memo, useCallback, useRef, useEffect } from 'react';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface MessageSearchProps {
  isOpen: boolean;
  query: string;
  totalResults: number;
  currentIndex: number;
  onQueryChange: (query: string) => void;
  onClose: () => void;
  onNavigate: (direction: 'prev' | 'next') => void;
}

export const MessageSearch = memo(function MessageSearch(props: MessageSearchProps) {
  const {
    isOpen, query, totalResults, currentIndex,
    onQueryChange, onClose, onNavigate,
  } = props;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        onNavigate('prev');
      } else {
        onNavigate('next');
      }
    }
  }, [onClose, onNavigate]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="shrink-0 bg-white border-b border-[#EBEBEB] overflow-hidden"
        >
          <div className="flex items-center gap-2 px-4 py-2">
            <Search size={16} className="text-[#8D8D8D]" />
            <input
              ref={inputRef}
              aria-label="Search messages"
              value={query}
              onChange={e => onQueryChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search messages... (Enter to navigate)"
              className="flex-1 bg-[#F5F5F5] rounded-xl px-3 py-2 text-sm text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-[#8D8D8D]"
            />
            {/* Navigation Controls */}
            {totalResults > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-[#8D8D8D] text-xs whitespace-nowrap">
                  {currentIndex + 1}/{totalResults}
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('prev')}
                  disabled={totalResults === 0}
                  className="p-1 text-[#8D8D8D] hover:text-[#111111] disabled:opacity-30 transition-colors"
                  aria-label="Previous result"
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('next')}
                  disabled={totalResults === 0}
                  className="p-1 text-[#8D8D8D] hover:text-[#111111] disabled:opacity-30 transition-colors"
                  aria-label="Next result"
                >
                  <ChevronDown size={16} />
                </button>
              </div>
            )}
            <button type="button" onClick={onClose} className="text-[#8D8D8D] hover:text-[#111111]" aria-label="Close search">
              <X size={18} />
            </button>
          </div>
          {query && (
            <p className="px-4 pb-2 text-[#8D8D8D] text-xs">
              {totalResults} result{totalResults !== 1 ? 's' : ''}
              {totalResults > 0 && ` — Press Enter for next, Shift+Enter for previous`}
            </p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
});

