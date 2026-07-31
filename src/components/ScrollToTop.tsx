import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp } from 'lucide-react';

interface ScrollToTopProps {
  scrollContainerRef?: React.RefObject<HTMLElement>;
}

export default function ScrollToTop({ scrollContainerRef }: ScrollToTopProps) {
  const [visible, setVisible] = useState(false);
  const savedScrollContainerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const scrollContainer = scrollContainerRef?.current || (typeof window !== 'undefined' ? window : null);
    savedScrollContainerRef.current = scrollContainer as HTMLElement | null;

    if (!scrollContainer) return;

    const handleScroll = () => {
      const scrollY = scrollContainer === window 
        ? window.scrollY 
        : (scrollContainer as HTMLElement).scrollTop;
      setVisible(scrollY > 400);
    };

    (scrollContainer as EventTarget).addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Check initial scroll position

    return () => {
      (scrollContainer as EventTarget).removeEventListener('scroll', handleScroll);
    };
  }, [scrollContainerRef]);

  const scrollToTop = () => {
    const scrollContainer = savedScrollContainerRef.current || window;
    if (scrollContainer === window) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      (scrollContainer as HTMLElement).scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          transition={{ duration: 0.2 }}
          type="button"
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-[#00C300] text-white shadow-lg shadow-[#00C300]/30 flex items-center justify-center hover:bg-[#00A300] transition-colors"
          aria-label="Scroll to top"
        >
          <ChevronUp size={24} />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
